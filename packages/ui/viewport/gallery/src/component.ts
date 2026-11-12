// system
import { CustomElement, html, property } from "@papit/web-component";
import { GameEngine, GameObject, type Layer3D } from "@papit/game-engine";
import "@papit/button";
import "@papit/dialog";
import type { Dialog } from "@papit/dialog";
import "@polywar/3d-asset-preview";
import type { AssetPreview3D } from "@polywar/3d-asset-preview";
import { Model, Renderer, gltfFromMesh, type Drawable, type ModelOptions, type TexturedGLTF } from "@polywar/renderer";
import { Matrix4 } from "@papit/matrix";

// local
import sheet from "./style.css" with { type: "css" };
import type { Asset, AssetKind, Assets, GalleryItem, OpenEvent } from "./types";

type Tile = { item: GalleryItem; stage?: HTMLElement; model?: Model; drawable?: Drawable; loading?: boolean; yaw: number; drag: number | null };

const KINDS: AssetKind[] = ["model", "material", "audio", "image", "video", "source", "other"];
const is3D = (kind: AssetKind) => kind === "model" || kind === "material";

/**
 * A gallery of assets, grouped under headings.
 *
 * - `location` (default `/assets`): a served folder with a `manifest.json` (`node bin/manifest.mjs <folder>` in this package).
 *   Empty string: no manifest.
 * - `tree`: an `Assets` tree set directly (same shape as the manifest), shown after the manifest.
 * - `items`: extra entries, e.g. generated meshes, shown after the manifest ones.
 * - `kinds`: which kinds start visible; the header toggles them, and searches names and groups.
 *
 * 3D tiles share one canvas over the page (a scissor rect per tile) so any number of them costs one
 * WebGL context. Drag a tile to turn it; click opens it in `pw-3d-asset-preview` (or what `opener` makes).
 * Tiles play `animation` when they have it, else "idle"; the header lists every clip the tiles have.
 * `skin` makes the skin of loaded models (e.g. `@polywar/skeleton` for characters, IK).
 */
export class Gallery extends CustomElement {
    static sheet = sheet;

    @property({ after: function (this: Gallery) { this.load(); } }) location: string = "/assets";
    @property({ type: Object, attribute: false, after: function (this: Gallery) { this.sync(); } }) tree: Assets | null = null;
    @property({ type: Array, attribute: false, after: function (this: Gallery) { this.sync(); } }) items: GalleryItem[] = [];
    @property({ type: Array, attribute: false, rerender: true }) kinds: AssetKind[] = ["model", "material", "audio", "image", "video"];
    @property({ rerender: true }) search: string = "";
    /** clip every tile plays when it has it (else "idle") */
    @property({ rerender: true }) animation: string = "idle";
    /** skin factory for loaded models, see `Model.load` */
    @property({ attribute: false }) skin: ModelOptions["skin"] | null = null;
    /** makes the element an item opens in; undefined = the default `pw-3d-asset-preview` */
    @property({ attribute: false }) opener: ((item: GalleryItem, animation: string) => HTMLElement | undefined) | null = null;

    private manifestItems: GalleryItem[] = [];
    private treeItems: GalleryItem[] = [];
    private treeSource: Assets | null = null;
    private tiles = new Map<GalleryItem, Tile>();
    private engine?: GameEngine<any>;
    private renderer?: Renderer;
    private gl?: WebGL2RenderingContext;
    private opened?: GalleryItem;
    private view = Matrix4.create();
    private projection = Matrix4.create();
    private matrix = Matrix4.create();
    private loading = 0;
    /** every clip name the loaded tiles have */
    private clips = new Set<string>();

    get all() {
        if (this.tree !== this.treeSource) { this.treeSource = this.tree; this.treeItems = this.tree ? flatten(this.tree) : []; }
        return [...this.manifestItems, ...this.treeItems, ...this.items];
    }

    firstRender() {
        super.firstRender();
        const engine = new GameEngine({ name: "main", query: "canvas.models", type: "webgl2", documentElement: this.shadowRoot! });
        this.engine = engine;
        this.gl = (engine.layers.main as any).gl as WebGL2RenderingContext;
        this.renderer = new Renderer(engine.layers.main as Layer3D);
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
        const ticket = ++this.loading;
        let items: GalleryItem[] = [];
        if (this.location && !this.location.includes("__marker__"))
        {
            try
            {
                const tree: Assets = await (await fetch(`${this.location.replace(/\/$/, "")}/manifest.json`)).json();
                items = flatten({ ...tree, name: "" });
            }
            catch (e) { console.warn("pw-gallery: no manifest at", this.location, e); }
        }
        if (ticket !== this.loading) return;
        this.manifestItems = items;
        this.sync();
    }

    /** create tiles for new 3D items, drop tiles of removed ones */
    private sync() {
        if (!this.gl) return;
        const all = new Set(this.all);
        for (const [item, tile] of this.tiles) if (!all.has(item)) { tile.model?.destroy(); tile.drawable?.destroy?.(); this.tiles.delete(item); }
        for (const item of all)
        {
            if (!is3D(item.kind) || this.tiles.has(item)) continue;
            this.tiles.set(item, { item, yaw: .6, drag: null });
        }
        this.requestUpdate();
    }

    /** models load when their tile comes near the viewport */
    private observer = new IntersectionObserver(entries => {
        for (const entry of entries)
        {
            if (!entry.isIntersecting) continue;
            const tile = [...this.tiles.values()].find(t => t.stage === entry.target);
            if (tile) this.fetch(tile);
            this.observer.unobserve(entry.target);
        }
    }, { rootMargin: "400px" });

    private fetch(tile: Tile) {
        if (tile.loading || tile.model || tile.drawable || !this.gl) return;
        tile.loading = true;
        const { item } = tile;
        if (item.scene) { tile.drawable = item.scene(this.engine!.layers.main as Layer3D); return; }
        const gltf = toGLTF(item);
        const ready = gltf ? Promise.resolve(new Model(this.gl, gltf)) : item.src ? Model.load(this.gl, item.src, { skin: this.skin ?? undefined }) : null;
        ready?.then(m => {
            if (this.tiles.get(item) !== tile) return m.destroy();
            tile.model = m;
            if (m.animations.some(a => a.name && !this.clips.has(a.name.toLowerCase()))) { m.animations.forEach(a => a.name && this.clips.add(a.name.toLowerCase())); this.requestUpdate(); }
        }).catch(e => console.warn("pw-gallery:", item.src, e));
    }

    // ---- drawing ----

    private draw() {
        const gl = this.gl!, layer = this.engine!.layers.main as any;
        const box = (layer.canvas as HTMLCanvasElement).getBoundingClientRect();
        const ratio = layer.width / (box.width || 1);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, 0, layer.width, layer.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const time = this.engine!.time;
        for (const tile of this.tiles.values())
        {
            const model = tile.model, drawable = tile.drawable;
            const r = tile.stage?.isConnected ? tile.stage.getBoundingClientRect() : null;
            if ((!model && !drawable) || !r || r.bottom < box.top || r.top > box.bottom || r.width === 0) continue;
            const x = (r.left - box.left) * ratio, y = layer.height - (r.bottom - box.top) * ratio, w = r.width * ratio, h = r.height * ratio;
            gl.viewport(x, y, w, h);
            gl.scissor(x, y, w, h);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            if (drawable)
            {
                // draws itself: turn the camera around it instead
                const radius = Math.max(Math.hypot(...drawable.size) / 2, .01), reach = radius / Math.sin(.75 / 2) * 1.05, y = drawable.size[1] / 2;
                const eye: [number, number, number] = [Math.sin(-tile.yaw) * reach * .8, y + reach * .55, Math.cos(-tile.yaw) * reach * .8];
                this.view.lookAt(eye, [0, y, 0], [0, 1, 0]);
                this.projection.perspective(.75, w / h, reach * .02, reach * 10);
                drawable.draw({ viewMatrix: this.view, projectionMatrix: this.projection, worldPosition: { x: eye[0], y: eye[1], z: eye[2] } }, this.renderer!.light, time);
                continue;
            }
            if (!model) continue;
            const clip = clipOf(model, this.animation) ?? clipOf(model, "idle");
            if (clip) model.pose(clip, time);
            // far enough that the bounding sphere fits the tile (fov .75 rad)
            const radius = Math.max(Math.hypot(...model.size) / 2, .01);
            const reach = radius / Math.sin(.75 / 2) * 1.05;
            const eye: [number, number, number] = [0, reach * .33, reach * .94];
            this.camera(eye, w / h, reach);
            const [cx, cy, cz] = model.center;
            this.matrix = Matrix4.rotationY(tile.yaw).translate(-cx, -cy, -cz);
            this.renderer!.begin({ viewMatrix: this.view, projectionMatrix: this.projection, worldPosition: { x: eye[0], y: eye[1], z: eye[2] } }, null);
            model.draw(this.renderer!, this.matrix);
        }
        gl.disable(gl.SCISSOR_TEST);
        gl.viewport(0, 0, layer.width, layer.height);
    }

    /** look at the origin from `eye` */
    private camera(eye: [number, number, number], aspect: number, reach: number) {
        this.view.lookAt(eye, [0, 0, 0], [0, 1, 0]);
        this.projection.perspective(.75, aspect, reach * .02, reach * 10);
    }

    // ---- ui ----

    /** The preview dialog lives outside the template, so re-renders never replace the preview (and its `gltf`). */
    private get dialog() {
        let dialog = this.shadowRoot!.querySelector<Dialog>("pap-dialog");
        if (dialog) return dialog;
        dialog = document.createElement("pap-dialog") as Dialog;
        dialog.setAttribute("close-outside-click", "");
        dialog.addEventListener("close", () => { dialog!.replaceChildren(); this.opened = undefined; });
        this.shadowRoot!.append(dialog);
        return dialog;
    }

    /** open an item: 3D in pw-3d-asset-preview (near full screen), image/video as a large preview */
    open(item: GalleryItem) {
        if (!["model", "material", "image", "video"].includes(item.kind)) return;
        this.opened = item;
        const dialog = this.dialog;
        dialog.header = `${item.group ? item.group + "/" : ""}${item.name}`;
        dialog.className = item.kind;
        let content: HTMLElement;
        const custom = is3D(item.kind) ? this.opener?.(item, this.animation) : undefined;
        if (custom) content = custom;
        else if (is3D(item.kind))
        {
            const preview = content = document.createElement("pw-3d-asset-preview") as AssetPreview3D;
            preview.setAttribute("controls", "");
            preview.setAttribute("grid", "");
            preview.setAttribute("mode", "orbit");
            preview.setAttribute("bones", "");
            const clip = item.src || item.gltf ? this.tiles.get(item)?.model : undefined;
            preview.setAttribute("animation", (clip && (clipOf(clip, this.animation) ?? clipOf(clip, "idle"))?.name) || this.animation);
            if (this.skin) preview.skin = this.skin;
            if (item.scene) preview.scene = item.scene;
            const gltf = toGLTF(item);
            if (gltf) preview.gltf = gltf;
            else if (item.src) preview.setAttribute("src", item.src);
            if (item.lods) preview.lods = item.lods;
        }
        else if (item.kind === "image")
        {
            const img = content = document.createElement("img");
            img.src = item.src ?? "";
            img.alt = item.name;
        }
        else
        {
            const video = content = document.createElement("video");
            video.src = item.src ?? "";
            video.controls = video.autoplay = video.loop = true;
        }
        dialog.replaceChildren(content);
        dialog.open = true;
        this.dispatchEvent(new CustomEvent<OpenEvent>("open", { detail: { item } }));
    }

    close() {
        this.dialog.close();
    }

    private handleopen = (item: GalleryItem) => () => this.open(item);
    private handleclip = (e: Event) => { this.animation = (e.target as HTMLSelectElement).value; };
    private handlesearch = (e: Event) => { this.search = (e.target as HTMLInputElement).value; };
    private handlekind = (kind: AssetKind) => () => {
        this.kinds = this.kinds.includes(kind) ? this.kinds.filter(k => k !== kind) : [...this.kinds, kind];
    };
    private dragstart = (tile: Tile) => (e: PointerEvent) => {
        tile.drag = e.clientX;
        let moved = 0;
        const move = (m: PointerEvent) => { moved += Math.abs(m.clientX - tile.drag!); tile.yaw += (m.clientX - tile.drag!) * .01; tile.drag = m.clientX; };
        const up = () => {
            tile.drag = null;
            removeEventListener("pointermove", move); removeEventListener("pointerup", up);
            if (moved < 4) this.open(tile.item);
        };
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
    };

    // copies the name (e.g. a generator seed); stays inside the tile, no dialog/link
    private handlecopy = (text: string) => (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const button = e.currentTarget as HTMLElement;
        navigator.clipboard?.writeText(text).then(() => {
            button.classList.add("copied");
            setTimeout(() => button.classList.remove("copied"), 900);
        });
    };

    private figure(item: GalleryItem) {
        const caption = html`<figcaption><button class="name" title="copy: ${item.name}" @click="${this.handlecopy(item.name)}">${item.name}</button><small>${item.note ?? (item.size ? size(item.size) : "")}</small></figcaption>`;
        if (is3D(item.kind))
        {
            const tile = this.tiles.get(item);
            const id = `tile-${[...this.tiles.keys()].indexOf(item)}`;
            if (tile) requestAnimationFrame(() => {
                const stage = this.shadowRoot!.getElementById(id) ?? undefined;
                if (stage && stage !== tile.stage) { tile.stage = stage; if (!tile.model && !tile.drawable) this.observer.observe(stage); }
            });
            return html`<figure class="model">
                <div class="stage" id="${id}" @pointerdown="${tile ? this.dragstart(tile) : null}"></div>
                ${caption}
            </figure>`;
        }
        if (item.kind === "audio") return html`<figure class="audio">${caption}<audio controls preload="none" src="${item.src}"></audio></figure>`;
        if (item.kind === "image") return html`<figure class="image"><img loading="lazy" src="${item.src}" alt="${item.name}" @click="${this.handleopen(item)}" />${caption}</figure>`;
        if (item.kind === "video") return html`<figure class="video"><video muted loop playsinline preload="metadata" src="${item.src}" @click="${this.handleopen(item)}" @pointerenter="${playpreview}" @pointerleave="${stoppreview}"></video>${caption}</figure>`;
        return html`<figure class="file">${item.src ? html`<a href="${item.src}">${caption}</a>` : caption}</figure>`;
    }

    render() {
        const q = this.search.toLowerCase();
        const all = this.all;
        const shown = all.filter(i => this.kinds.includes(i.kind) && (!q || `${i.group ?? ""}/${i.name}`.toLowerCase().includes(q)));
        const top = (g = "") => g.split("/")[0];
        const rest = (g = "") => g.split("/").slice(1).join("/");
        const tops = [...new Set(shown.map(i => top(i.group)))];
        return html`
            <header>
                <input type="search" placeholder="search" aria-label="search" @input="${this.handlesearch}" />
                ${KINDS.map(k => html`<pap-button size="small" variant="${this.kinds.includes(k) ? "filled" : "outline"}" @click="${this.handlekind(k)}">${k}</pap-button>`)}
                ${this.clips.size ? html`
                    <select aria-label="animation" @change="${this.handleclip}">
                        ${[...this.clips].sort().map(n => html`<option value="${n}" ${n === this.animation && "selected"}>${n}</option>`)}
                    </select>
                ` : ""}
                <small>${shown.length} / ${all.length}</small>
            </header>
            ${tops.map(t => html`
                <section>
                    ${t ? html`<h2>${t}</h2>` : ""}
                    ${[...new Set(shown.filter(i => top(i.group) === t).map(i => rest(i.group)))].map(sub => html`
                        ${sub ? html`<h3>${sub}</h3>` : ""}
                        <div class="grid">${shown.filter(i => top(i.group) === t && rest(i.group) === sub).map(i => this.figure(i))}</div>
                    `)}
                </section>
            `)}
            <canvas class="models"></canvas>
        `;
    }
}

const EXTENSIONS: Record<AssetKind, string[]> = {
    model: [".glb", ".gltf"],
    material: [],
    source: [".blend", ".fbx", ".obj", ".mtl"],
    audio: [".mp3", ".wav", ".ogg", ".m4a", ".flac"],
    video: [".mp4", ".webm", ".mov", ".m4v"],
    image: [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif"],
    other: [],
};

export function kindOf(file: string): AssetKind {
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    return (Object.keys(EXTENSIONS) as AssetKind[]).find(k => EXTENSIONS[k].includes(ext)) ?? "other";
}

/** an `Assets` tree to gallery items; the folder names (below the root) become the group */
export function flatten(tree: Assets, group = tree.name): GalleryItem[] {
    const lod = /\.lod(\d+)\.[^.]+$/, files = tree.assets.filter(a => !("assets" in a)).map(a => (a as Asset).name);
    return tree.assets.flatMap(a => "assets" in a
        ? flatten(a, group ? `${group}/${a.name}` : a.name)
        : lod.test((a as Asset).name) ? [] // lod copies: a picker in the preview
        : [{ name: (a as Asset).name.replace(/\.[^.]+$/, ""), group, kind: kindOf((a as Asset).file), src: (a as Asset).file, size: (a as Asset).size, lods: lodsOf((a as Asset).name, files) }]);
}

/** how many `<name>.lod<n>.<ext>` copies sit next to a file (0 = none) */
function lodsOf(name: string, files: string[]) {
    const dot = name.lastIndexOf("."), base = name.slice(0, dot), ext = name.slice(dot);
    let n = 0;
    while (files.includes(`${base}.lod${n + 1}${ext}`)) n++;
    return n;
}

function toGLTF(item: GalleryItem): TexturedGLTF | null {
    if (item.gltf) return item.gltf;
    if (item.mesh) return gltfFromMesh(...(Array.isArray(item.mesh) ? item.mesh : [item.mesh]));
    return null;
}

/** clip by name, any case ("Idle" = "idle") */
function clipOf(model: Model, name: string) {
    const n = name.toLowerCase();
    return model.animations.find(a => a.name?.toLowerCase() === n);
}

function playpreview(e: Event) { (e.currentTarget as HTMLVideoElement).play().catch(() => {}); }
function stoppreview(e: Event) { (e.currentTarget as HTMLVideoElement).pause(); }

function size(bytes: number) {
    return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.ceil(bytes / 1e3)} KB`;
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-gallery": Gallery;
    }
}
