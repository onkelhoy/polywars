// system
import { CustomElement, html, property } from "@papit/web-component";
import type { Camera } from "@papit/game-engine";
import "@polywar/3d-demo";
import type { Demo3D } from "@polywar/3d-demo";
import { Matrix4 } from "@papit/matrix";
import { Grid, Model, Renderer, type TexturedGLTF } from "./render";
import { MeshBuilder, upload, type GPUMesh } from "@papit/game-mesh";
import "@papit/button";

// local
import sheet from "./style.css" with { type: "css" };
import type { LoadEvent, PreviewMode } from "./types";

/**
 * Shows one 3D asset (.glb/.gltf) by path.
 * Modes: `turntable` (spins, drag to orbit), `orbit` (drag turn, right-drag/shift-drag pan, wheel zoom), `fps` (click, WASD + mouse).
 * With `controls`: mode switch, animation picker, play/pause and a time scrubber.
 */
export class AssetPreview3D extends CustomElement {
    static sheet = sheet;

    @property({ after: function (this: AssetPreview3D) { this.load(); } }) src: string = "";
    /** in-memory glTF (generated content), optionally with `maps` (urls or pixels); wins over `src` */
    @property({ attribute: false, after: function (this: AssetPreview3D) { this.load(); } }) gltf: TexturedGLTF | null = null;
    /** a new model keeps the camera where it is (after the first one); `frame()` fits it again */
    @property({ type: Boolean, attribute: "keep-view" }) keepView: boolean = false;
    @property({ rerender: true, after: function (this: AssetPreview3D) { this.applyMode(); } }) mode: PreviewMode = "turntable";
    @property({ rerender: true }) animation: string = "";
    @property({ type: Boolean, rerender: true }) controls: boolean = false;
    @property({ type: Boolean }) grid: boolean = false;
    /** toon bands for the sun, 0 is smooth */
    @property({ type: Number }) toon: number = 0;
    @property({ type: Number }) speed: number = 1;
    // light: ambient and sun strength, sun direction in degrees, lamp (point light) strength and angle around the model
    @property({ type: Number }) ambient: number = .6;
    @property({ type: Number }) sun: number = 1;
    @property({ type: Number, attribute: "sun-azimuth" }) sunAzimuth: number = 40;
    @property({ type: Number, attribute: "sun-elevation" }) sunElevation: number = 50;
    @property({ type: Number }) lamp: number = 0;
    @property({ type: Number, attribute: "lamp-angle" }) lampAngle: number = 120;
    @property({ type: Boolean, rerender: true }) lights: boolean = false;

    private demo?: Demo3D;
    private renderer?: Renderer;
    private gridMesh?: Grid;
    private bulb?: GPUMesh;
    private model?: Model;
    private yaw = 0;
    private time = 0;
    private playing = true;
    private loading = 0;

    async firstRender() {
        super.firstRender();
        const demo = this.shadowRoot!.querySelector<Demo3D>("pw-3d-demo")!;
        this.demo = demo;
        await demo.ready;
        this.renderer = new Renderer(demo.layer!);
        this.bulb = upload(demo.gl, new MeshBuilder().sphere([1, .85, .6], {}, 1).build());
        demo.tick = dt => this.step(dt);
        demo.draw = camera => this.draw(camera);
        this.applyMode();
        this.load();
    }

    // ---- scene ----

    private async load() {
        // the html template briefly sets a placeholder before the real value
        if (!this.renderer) return;
        const gl = this.renderer.gl;
        const src = !this.src || this.src.includes("__marker__") ? "" : this.src;
        if (!this.gltf && !src) return;
        const ticket = ++this.loading;
        const model = this.gltf ? new Model(gl, this.gltf) : await Model.load(gl, src);
        await model.ready;
        if (ticket !== this.loading) return model.destroy();
        const first = !this.model;
        this.model?.destroy();
        this.model = model;
        // grid scaled to the model: lines every 10^n / 2 metres, out to 3x its size
        const r = this.reach, step = Math.pow(10, Math.floor(Math.log10(r))) / 2;
        this.gridMesh?.destroy();
        this.gridMesh = new Grid(gl, Math.ceil(r * 3 / step) * step, step, 5);
        this.time = 0;
        if (!model.animation(this.animation)) this.animation = "";
        if (first || !this.keepView) this.frame();
        const triangles = model.gltf.meshes.flatMap(m => m.primitives).reduce((n, p) => n + (p.indices?.length ?? p.positions.length / 3) / 3, 0);
        this.dispatchEvent(new CustomEvent<LoadEvent>("load", {
            detail: { src, animations: model.animations.map(a => a.name ?? ""), triangles, size: model.size },
        }));
        this.requestUpdate();
    }

    /** Biggest side of the model, for camera distances and speeds. */
    private get reach() {
        return this.model ? Math.max(...this.model.size, .05) : 1;
    }

    /** distance that fits the bounding sphere in the default 60° view */
    private get fit() {
        const radius = this.model ? Math.hypot(...this.model.size) / 2 : .5;
        return Math.max(radius, .01) / Math.sin(Math.PI / 6) * 1.1;
    }

    /** turntable and orbit pan / zoom around the model, fps flies */
    private applyMode() {
        if (this.demo) this.demo.mode = this.mode === "fps" ? "fly" : "pan";
    }

    /** camera back to a view that fits the model */
    frame() {
        const demo = this.demo;
        if (!demo) return;
        const y = (this.model?.size[1] ?? 0) / 2, d = this.fit;
        demo.near = this.reach * .01;
        demo.far = this.reach * 200;
        demo.speed = this.reach * 1.5;
        demo.look([Math.sin(.7) * Math.cos(.35) * d, y + Math.sin(.35) * d, Math.cos(.7) * Math.cos(.35) * d], [0, y, 0]);
    }

    private step(dt: number) {
        if (this.mode === "turntable") this.yaw += dt * .5;
        if (this.playing) this.time += dt * this.speed;
        const anim = this.model?.animation(this.animation);
        this.model?.pose(anim, this.time);
        if (anim && this.controls)
        {
            const scrub = this.shadowRoot?.querySelector<HTMLInputElement>("input[type=range]");
            if (scrub && document.activeElement !== this) scrub.value = String(anim.duration ? (this.time % anim.duration) / anim.duration : 0);
        }
    }

    private draw(camera: Camera) {
        const renderer = this.renderer!;
        const light = renderer.light;
        light.toon = this.toon;
        light.ambient = this.ambient;
        light.sunStrength = this.sun;
        const az = this.sunAzimuth * Math.PI / 180, el = this.sunElevation * Math.PI / 180;
        light.sunDirection = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
        // lamp circles the model at 80% of its height, just outside its bounds
        const r = this.reach, height = (this.model?.size[1] ?? 1);
        const la = this.lampAngle * Math.PI / 180;
        light.lampPosition = [Math.sin(la) * r * .9, height * .8, Math.cos(la) * r * .9];
        light.lampRange = r * 2.5;
        light.lampStrength = this.lamp;
        renderer.begin(camera, this.demo?.background);
        if (this.lamp > 0 && this.bulb)
        {
            const k = r * .03;
            renderer.draw(this.bulb, [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, ...light.lampPosition, 1], { unlit: true });
        }
        if (this.grid) this.gridMesh?.draw(renderer);
        if (!this.model) return;
        const [cx, , cz] = this.model.center;
        const bottom = this.model.bounds.min[1];
        // spin around the model's middle, standing on y = 0
        this.model.draw(renderer, Matrix4.rotationY(this.yaw).translate(-cx, -bottom, -cz));
    }

    // ---- input ----

    private handlemode = (mode: PreviewMode) => () => { this.mode = mode; };
    private handlelights = () => { this.lights = !this.lights; };
    private handlelight = (name: "ambient" | "sun" | "sunAzimuth" | "sunElevation" | "lamp" | "lampAngle") => (e: Event) => {
        this[name] = Number((e.target as HTMLInputElement).value);
    };
    private handleanimation = (e: Event) => { this.animation = (e.target as HTMLSelectElement).value; this.time = 0; };
    private handleplay = () => { this.playing = !this.playing; this.requestUpdate(); };
    private handlescrub = (e: Event) => {
        const anim = this.model?.animation(this.animation);
        if (!anim) return;
        this.playing = false;
        this.time = Number((e.target as HTMLInputElement).value) * anim.duration;
        this.requestUpdate();
    };

    render() {
        const names = this.model?.animations.map(a => a.name ?? "") ?? [];
        return html`
            <pw-3d-demo no-bar part="demo">
            ${this.controls ? html`
                <div class="bar" part="controls">
                    <div class="modes">
                        ${(["turntable", "orbit", "fps"] as PreviewMode[]).map(m => html`
                            <pap-button size="small" variant="${m === this.mode ? "filled" : "outline"}" @click="${this.handlemode(m)}">${m}</pap-button>
                        `)}
                    </div>
                    ${names.length ? html`
                        <select @change="${this.handleanimation}" aria-label="animation">
                            <option value="" ${!this.animation && "selected"}>rest pose</option>
                            ${names.map(n => html`<option value="${n}" ${n === this.animation && "selected"}>${n}</option>`)}
                        </select>
                        <pap-button size="small" variant="outline" @click="${this.handleplay}">${this.playing ? "pause" : "play"}</pap-button>
                        <input type="range" min="0" max="1" step="0.001" value="0" aria-label="time" @input="${this.handlescrub}" />
                    ` : ""}
                </div>
                ${this.mode === "fps" ? html`<p class="hint">click to look (esc frees), WASD, E/Q up/down, shift fast, wheel speed</p>` : ""}
                <div class="lights" part="lights">
                    <pap-button size="small" variant="${this.lights ? "filled" : "outline"}" @click="${this.handlelights}">light</pap-button>
                    ${this.lights ? html`
                        <label>ambient <input type="range" min="0" max="2" step="0.05" value="${this.ambient}" @input="${this.handlelight("ambient")}" /></label>
                        <label>sun <input type="range" min="0" max="3" step="0.05" value="${this.sun}" @input="${this.handlelight("sun")}" /></label>
                        <label>sun direction <input type="range" min="0" max="360" step="1" value="${this.sunAzimuth}" @input="${this.handlelight("sunAzimuth")}" /></label>
                        <label>sun height <input type="range" min="-10" max="90" step="1" value="${this.sunElevation}" @input="${this.handlelight("sunElevation")}" /></label>
                        <label>lamp <input type="range" min="0" max="4" step="0.05" value="${this.lamp}" @input="${this.handlelight("lamp")}" /></label>
                        <label>lamp around <input type="range" min="0" max="360" step="1" value="${this.lampAngle}" @input="${this.handlelight("lampAngle")}" /></label>
                    ` : ""}
                </div>
            ` : ""}
            </pw-3d-demo>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-3d-asset-preview": AssetPreview3D;
    }
}
