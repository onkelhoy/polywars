// system
import { CustomElement, html, property } from "@papit/web-component";
import { GameEngine, GameObject } from "@papit/game-engine";
import { Model, Renderer, fromTRS, mat4, multiply } from "@polywar/render";
import "@papit/button";
import "@polywar/3d-asset-preview";

// local
import sheet from "./style.css" with { type: "css" };
import type { AssetFile, AssetKind, Manifest, OpenEvent } from "./types";

type Tile = { file: AssetFile; figure?: HTMLElement; model?: Model; yaw: number; drag: number | null };

const KINDS: AssetKind[] = ["model", "audio", "image", "source", "other"];

/**
 * Gallery of everything in a manifest (`npm run assets` writes `/assets/manifest.json`).
 * 3D models turn in tiles, all drawn by one canvas over the page (scissor per tile, like
 * arrow-warfare's model gallery); drag a tile to turn it, click to open it in `pw-3d-asset-preview`.
 */
export class AssetGallery extends CustomElement {
    static sheet = sheet;

    @property({ after: function (this: AssetGallery) { this.load(); } }) manifest: string = "/assets/manifest.json";
    @property({ rerender: true }) search: string = "";
    @property({ type: Array, rerender: true, attribute: false }) kinds: AssetKind[] = ["model", "audio", "image"];

    private files: AssetFile[] = [];
    private tiles = new Map<string, Tile>();
    private engine?: GameEngine<any>;
    private renderer?: Renderer;
    private gl?: WebGL2RenderingContext;
    private opened?: AssetFile;
    private view = new Float32Array(16);
    private projection = new Float32Array(16);
    private matrix = mat4();

    firstRender() {
        super.firstRender();
        const engine = new GameEngine({ name: "main", query: "canvas.models", type: "webgl2", documentElement: this.shadowRoot! });
        this.engine = engine;
        this.gl = (engine.layers.main as any).gl as WebGL2RenderingContext;
        this.renderer = new Renderer(this.gl);
        const gallery = this;
        engine.add(new class extends GameObject {
            override update(dt: number) { for (const t of gallery.tiles.values()) if (t.drag === null) t.yaw += dt * .4; }
            override render() { gallery.draw(); }
        }());
        engine.start();
        this.load();
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();
        this.engine?.stop();
    }

    private async load() {
        if (!this.engine) return;
        const data: Manifest = await (await fetch(this.manifest)).json();
        this.files = data.files;
        for (const file of this.files.filter(f => f.kind === "model"))
        {
            const tile: Tile = { file, yaw: .6, drag: null };
            this.tiles.set(file.path, tile);
            Model.load(this.gl!, file.path).then(m => { tile.model = m; m.pose(m.animation("idle"), 0); }).catch(() => { });
        }
        this.requestUpdate();
    }

    // ---- drawing ----

    private draw() {
        const gl = this.gl!, layer = this.engine!.layers.main as any;
        const canvas = layer.canvas as HTMLCanvasElement;
        const box = canvas.getBoundingClientRect();
        const ratio = layer.width / (box.width || 1);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, 0, layer.width, layer.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const time = this.engine!.time;
        for (const tile of this.tiles.values())
        {
            const model = tile.model;
            const r = tile.figure?.isConnected ? tile.figure.querySelector(".stage")!.getBoundingClientRect() : null;
            if (!model || !r || r.bottom < box.top || r.top > box.bottom || r.width === 0) continue;
            const x = (r.left - box.left) * ratio, y = layer.height - (r.bottom - box.top) * ratio, w = r.width * ratio, h = r.height * ratio;
            gl.viewport(x, y, w, h);
            gl.scissor(x, y, w, h);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            const idle = model.animation("idle");
            if (idle) model.pose(idle, time);
            const reach = Math.max(...model.size, .02);
            this.camera([0, reach * .45, reach * 1.3], w / h, reach);
            const [cx, cy, cz] = model.center;
            const s = Math.sin(tile.yaw / 2), c = Math.cos(tile.yaw / 2);
            multiply(this.matrix, fromTRS(mat4(), [0, 0, 0], [0, s, 0, c], [1, 1, 1]), fromTRS(mat4(), [-cx, -cy, -cz], [0, 0, 0, 1], [1, 1, 1]));
            this.renderer!.begin({ viewMatrix: this.view, projectionMatrix: this.projection, worldPosition: { x: 0, y: reach * .45, z: reach * 1.3 } }, null);
            model.draw(this.renderer!, this.matrix);
        }
        gl.disable(gl.SCISSOR_TEST);
        gl.viewport(0, 0, layer.width, layer.height);
    }

    /** look at the origin from `eye` */
    private camera(eye: [number, number, number], aspect: number, reach: number) {
        const l = Math.hypot(...eye);
        const f = eye.map(v => v / l);
        const rl = Math.hypot(f[2], f[0]) || 1;
        const r = [f[2] / rl, 0, -f[0] / rl];
        const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
        const dot = (a: number[]) => a[0] * eye[0] + a[1] * eye[1] + a[2] * eye[2];
        this.view.set([r[0], u[0], f[0], 0, r[1], u[1], f[1], 0, r[2], u[2], f[2], 0, -dot(r), -dot(u), -dot(f), 1]);
        const near = reach * .02, far = reach * 10, k = 1 / Math.tan(.75 / 2);
        this.projection.set([k / aspect, 0, 0, 0, 0, k, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
    }

    // ---- ui ----

    private handlesearch = (e: Event) => { this.search = (e.target as HTMLInputElement).value; };
    private handlekind = (kind: AssetKind) => () => {
        this.kinds = this.kinds.includes(kind) ? this.kinds.filter(k => k !== kind) : [...this.kinds, kind];
    };
    private handleopen = (file: AssetFile) => () => {
        this.opened = file;
        this.requestUpdate();
        this.dispatchEvent(new CustomEvent<OpenEvent>("open", { detail: { file } }));
        requestAnimationFrame(() => this.shadowRoot!.querySelector("dialog")?.showModal());
    };
    private handleclose = () => { this.shadowRoot!.querySelector("dialog")?.close(); this.opened = undefined; this.requestUpdate(); };
    private dragstart = (tile: Tile) => (e: PointerEvent) => {
        tile.drag = e.clientX;
        let moved = false;
        const move = (m: PointerEvent) => { moved = true; tile.yaw += (m.clientX - tile.drag!) * .01; tile.drag = m.clientX; };
        const up = () => {
            tile.drag = null;
            removeEventListener("pointermove", move); removeEventListener("pointerup", up);
            if (!moved) this.handleopen(tile.file)();
        };
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
    };

    private figure(file: AssetFile) {
        const name = file.name.replace(/\.[^.]+$/, "");
        if (file.kind === "model")
        {
            const tile = this.tiles.get(file.path)!;
            requestAnimationFrame(() => tile.figure = this.shadowRoot!.querySelector<HTMLElement>(`figure[data-path="${file.path}"]`) ?? undefined);
            return html`<figure data-path="${file.path}" class="model">
                <div class="stage" @pointerdown="${this.dragstart(tile)}"></div>
                <figcaption>${name}<small>${size(file.size)}</small></figcaption>
            </figure>`;
        }
        if (file.kind === "audio") return html`<figure class="audio">
            <figcaption>${name}<small>${size(file.size)}</small></figcaption>
            <audio controls preload="none" src="${file.path}"></audio>
        </figure>`;
        if (file.kind === "image") return html`<figure class="image">
            <img loading="lazy" src="${file.path}" alt="${name}" />
            <figcaption>${name}<small>${size(file.size)}</small></figcaption>
        </figure>`;
        return html`<figure class="file"><figcaption>${file.name}<small>${size(file.size)}</small></figcaption></figure>`;
    }

    render() {
        const q = this.search.toLowerCase();
        const shown = this.files.filter(f => this.kinds.includes(f.kind) && (!q || (f.folder + "/" + f.name).toLowerCase().includes(q)));
        const folders = [...new Set(shown.map(f => f.folder))];
        return html`
            <header>
                <input type="search" placeholder="search" aria-label="search" .value="${this.search}" @input="${this.handlesearch}" />
                ${KINDS.map(k => html`<pap-button size="small" variant="${this.kinds.includes(k) ? "filled" : "outline"}" @click="${this.handlekind(k)}">${k}</pap-button>`)}
                <small>${shown.length} / ${this.files.length}</small>
            </header>
            ${folders.map(folder => html`
                <section>
                    <h2>${folder}</h2>
                    <div class="grid">${shown.filter(f => f.folder === folder).map(f => this.figure(f))}</div>
                </section>
            `)}
            <canvas class="models"></canvas>
            <dialog @close="${this.handleclose}">
                <header>
                    <strong>${this.opened?.path ?? ""}</strong>
                    <pap-button size="small" variant="outline" @click="${this.handleclose}">close</pap-button>
                </header>
                ${this.opened ? html`<pw-3d-asset-preview controls grid mode="orbit" src="${this.opened.path}"></pw-3d-asset-preview>` : ""}
            </dialog>
        `;
    }
}

function size(bytes: number) {
    return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.ceil(bytes / 1e3)} KB`;
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-asset-gallery": AssetGallery;
    }
}
