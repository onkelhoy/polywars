// system
import { CustomElement, html, property } from "@papit/web-component";
import type { Camera } from "@papit/game-engine";
import "@polywar/3d-demo";
import type { Demo3D } from "@polywar/3d-demo";
import { Matrix4 } from "@papit/matrix";
import { Grid, Model, Renderer, type Drawable, type ModelOptions, type Scene, type TexturedGLTF } from "@polywar/renderer";
import { MeshBuilder, upload, type GPUMesh } from "@papit/game-mesh";
import "@papit/button";
import { Poser, RigGizmo, Skeleton, type PoseTool } from "@polywar/skeleton";

// local
import sheet from "./style.css" with { type: "css" };
import type { LoadEvent, Overlay, PreviewMode } from "./types";

/**
 * Shows one 3D asset (.glb/.gltf) by path.
 * Modes: `turntable` (spins, drag to orbit), `orbit` (drag turn, right-drag/shift-drag pan, wheel zoom), `fps` (click, WASD + mouse).
 * With `controls`: mode switch, animation picker, play/pause, a time scrubber and frame stepping (`fps`).
 * Rigged models posed by a `Skeleton` (set `skin`, e.g. `Skeleton.skin`) get bones / IK / mesh toggles;
 * with bones shown, press a bone to select it; tools select / move (G, arrows) / rotate (R, rings) pose it, on top of the clip.
 * Hooks: `skin` (e.g. `Skeleton.skin` for IK), `overlay` (draws over the model, e.g. bones), `hide-model`.
 */
export class AssetPreview3D extends CustomElement {
    static sheet = sheet;

    @property({ after: function (this: AssetPreview3D) { this.load(); } }) src: string = "";
    /** in-memory glTF (generated content), optionally with `maps` (urls or pixels); wins over `src` */
    @property({ attribute: false, after: function (this: AssetPreview3D) { this.load(); } }) gltf: TexturedGLTF | null = null;
    /** something that draws itself (e.g. a material sample), drawn with the light and camera; works with or without a model */
    @property({ attribute: false, after: function (this: AssetPreview3D) { this.load(); } }) scene: Scene | null = null;
    /** a new model keeps the camera where it is (after the first one); `frame()` fits it again */
    @property({ type: Boolean, attribute: "keep-view" }) keepView: boolean = false;
    /** makes the skin for a loaded `src` (see `Model.load`), used from the next load */
    @property({ attribute: false }) skin: ModelOptions["skin"] | null = null;
    /** drawn after the model, with the same placement matrix */
    @property({ attribute: false }) overlay: Overlay | null = null;
    /** skip drawing the model (the overlay still draws) */
    @property({ type: Boolean, attribute: "hide-model" }) hideModel: boolean = false;
    /** draw the bones (Blender style) of a `Skeleton` skin */
    @property({ type: Boolean, rerender: true }) bones: boolean = false;
    /** IK of a `Skeleton` skin on/off */
    @property({ type: Boolean, rerender: true }) ik: boolean = true;
    /** frames per second for the frame readout and stepping */
    @property({ type: Number }) fps: number = 30;
    @property({ rerender: true, after: function (this: AssetPreview3D) { this.applyMode(); } }) mode: PreviewMode = "turntable";
    @property({ rerender: true }) animation: string = "";
    @property({ type: Boolean, rerender: true }) controls: boolean = false;
    @property({ type: Boolean }) grid: boolean = false;
    /** toon bands for the sun, 0 is smooth */
    @property({ type: Number }) toon: number = 0;
    @property({ type: Number, rerender: true }) speed: number = 1;
    /** clips wrap; off = play once and hold the last frame */
    @property({ type: Boolean, attribute: "no-loop", rerender: true }) noLoop: boolean = false;
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
    private gizmo?: RigGizmo;
    /** hand posing of a `Skeleton` skin */
    poser?: Poser;
    /** armature space -> world, from the last draw, and back */
    private boneMatrix?: Matrix4;
    private boneInverse?: Matrix4;
    private dragging?: number;
    /** the loaded model */
    model?: Model;
    private drawable?: Drawable;
    private drawableOf?: Scene;
    private yaw = 0;
    private time = 0;
    private playing = true;
    private loading = 0;

    async firstRender() {
        super.firstRender();
        const demo = this.shadowRoot!.querySelector<Demo3D>("pw-3d-demo")!;
        this.demo = demo;
        await demo.ready;
        // a copy a template made and dropped never gets a layer
        if (!demo.layer) return;
        this.renderer = new Renderer(demo.layer);
        this.bulb = upload(demo.gl, new MeshBuilder().sphere([1, .85, .6], {}, 1).build());
        demo.tick = dt => this.step(dt);
        demo.draw = camera => this.draw(camera);
        demo.addEventListener("pointerdown", this.handlebonedown, { capture: true });
        window.addEventListener("pointermove", this.handlebonemove);
        window.addEventListener("pointerup", this.handleboneup);
        window.addEventListener("keydown", this.handlekey);
        this.applyMode();
        this.load();
    }

    // ---- scene ----

    private async load() {
        // the html template briefly sets a placeholder before the real value
        if (!this.renderer) return;
        const gl = this.renderer.gl;
        const src = !this.src || this.src.includes("__marker__") ? "" : this.src;
        if (this.scene !== this.drawableOf)
        {
            const first = !this.model && !this.drawable;
            this.drawable?.destroy?.();
            this.drawableOf = this.scene ?? undefined;
            this.drawable = this.scene?.(this.demo!.layer!);
            if (this.drawable && !this.gltf && !src) { this.model?.destroy(); this.model = undefined; this.fitGrid(); if (first || !this.keepView) this.frame(); }
        }
        if (!this.gltf && !src) return;
        const ticket = ++this.loading;
        const model = this.gltf ? new Model(gl, this.gltf) : await Model.load(gl, src, { skin: this.skin ?? undefined });
        await model.ready;
        if (ticket !== this.loading) return model.destroy();
        const first = !this.model;
        this.model?.destroy();
        this.model = model;
        this.poser = model.skin instanceof Skeleton ? new Poser(model.skin) : undefined;
        if (this.poser) this.poser.size = Math.max(...model.size) * .12;
        this.fitGrid();
        this.time = 0;
        // keep the clip by name, any case ("Idle" = "idle")
        if (!model.animation(this.animation)) this.animation = model.animations.find(c => c.name?.toLowerCase() === this.animation.toLowerCase())?.name ?? "";
        if (first || !this.keepView) this.frame();
        const triangles = model.gltf.meshes.flatMap(m => m.primitives).reduce((n, p) => n + (p.indices?.length ?? p.positions.length / 3) / 3, 0);
        this.dispatchEvent(new CustomEvent<LoadEvent>("load", {
            detail: { src, animations: model.animations.map(a => a.name ?? ""), triangles, size: model.size },
        }));
        this.requestUpdate();
    }

    /** grid scaled to the content: lines every 10^n / 2 metres, out to 3x its size */
    private fitGrid() {
        const r = this.reach, step = Math.pow(10, Math.floor(Math.log10(r))) / 2;
        this.gridMesh?.destroy();
        this.gridMesh = new Grid(this.renderer!.gl, Math.ceil(r * 3 / step) * step, step, 5);
    }

    /** model bounds, else the scene's */
    private get size(): number[] | undefined {
        return this.model?.size ?? this.drawable?.size;
    }

    /** Biggest side of the content, for camera distances and speeds. */
    private get reach() {
        return this.size ? Math.max(...this.size, .05) : 1;
    }

    /** distance that fits the bounding sphere in the default 60° view */
    private get fit() {
        const radius = this.size ? Math.hypot(...this.size) / 2 : .5;
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
        const y = (this.size?.[1] ?? 0) / 2, d = this.fit;
        demo.near = this.reach * .01;
        demo.far = this.reach * 200;
        demo.speed = this.reach * 1.5;
        demo.look([Math.sin(.7) * Math.cos(.35) * d, y + Math.sin(.35) * d, Math.cos(.7) * Math.cos(.35) * d], [0, y, 0]);
    }

    private step(dt: number) {
        if (this.mode === "turntable") this.yaw += dt * .5;
        const anim = this.model?.animation(this.animation);
        if (this.playing) this.time += dt * this.speed;
        if (anim && this.noLoop && this.time >= anim.duration) { this.time = anim.duration; if (this.playing) { this.playing = false; this.requestUpdate(); } }
        this.model?.pose(anim, this.time, !this.noLoop);
        this.poser?.apply();
        if (anim && this.controls)
        {
            const scrub = this.shadowRoot?.querySelector<HTMLInputElement>("input[type=range]");
            if (scrub && document.activeElement !== this) scrub.value = String(anim.duration ? this.clipTime(anim.duration) / anim.duration : 0);
            const frame = this.shadowRoot?.querySelector<HTMLOutputElement>("output.frame");
            if (frame) frame.value = `${Math.round(this.clipTime(anim.duration) * this.fps)} / ${Math.round(anim.duration * this.fps)}`;
        }
    }

    /** time inside the clip */
    private clipTime(duration: number) {
        if (this.noLoop) return Math.min(Math.max(this.time, 0), duration);
        return ((this.time % duration) + duration) % duration;
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
        const r = this.reach, height = (this.size?.[1] ?? 1);
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
        this.drawable?.draw(camera, light, this.demo?.time ?? 0);
        if (!this.model) return;
        const [cx, , cz] = this.model.center;
        const bottom = this.model.bounds.min[1];
        // spin around the model's middle, standing on y = 0; the origin dot sits on the asset's own origin
        const m = Matrix4.rotationY(this.yaw).translate(-cx, -bottom, -cz);
        if (this.demo) this.demo.origin = [m[12], m[13], m[14]];
        if (!this.hideModel) this.model.draw(renderer, m);
        const skin = this.model.skin;
        if (skin instanceof Skeleton)
        {
            if (skin.ikEnabled !== this.ik) skin.ikEnabled = this.ik;
            this.boneMatrix = m.clone.multiply(this.model.skeletonMatrix);
            this.boneInverse = this.boneMatrix.clone.inverse();
            const selected = this.poser?.selected ? new Set([this.poser.selected]) : undefined;
            if (this.bones)
            {
                const gizmo = this.gizmo ??= new RigGizmo(renderer.gl);
                gizmo.draw(renderer, skin, this.boneMatrix, { selected });
                if (this.poser) gizmo.handles(renderer, this.boneMatrix, this.poser.handles(), this.poser.active);
            }
        }
        this.overlay?.(renderer, this.model, m);
    }

    // ---- input ----

    /** with bones shown: a press on a bone or a handle grabs it and keeps the camera still */
    private handlebonedown = (e: PointerEvent) => {
        const demo = this.demo, poser = this.poser, M = this.boneMatrix, ray = this.boneRay(e);
        if (!this.bones || !demo || !poser || !M || !ray || e.button !== 0 || this.mode === "fps") return;
        const [x, y] = demo.local(e.clientX, e.clientY);
        const grabbed = poser.press(x, y, p => demo.project(transform(M, p, 1)), ray);
        this.requestUpdate();
        if (!grabbed) return;
        e.stopPropagation();
        e.preventDefault();
        this.dragging = e.pointerId;
    };
    private handlebonemove = (e: PointerEvent) => {
        if (e.pointerId !== this.dragging) return;
        const ray = this.boneRay(e);
        if (!ray) return;
        this.poser?.drag(ray);
        this.requestUpdate();
    };
    /** pointer ray in armature space */
    private boneRay(e: PointerEvent) {
        const ray = this.demo?.ray(e.clientX, e.clientY), I = this.boneInverse;
        if (!ray || !I) return undefined;
        return { origin: transform(I, ray.origin, 1), direction: transform(I, ray.direction, 0), normal: transform(I, ray.forward, 0) };
    }
    private handleboneup = (e: PointerEvent) => {
        if (e.pointerId !== this.dragging) return;
        this.dragging = undefined;
        this.poser?.release();
    };
    private handletool = (tool: PoseTool) => () => { if (this.poser) this.poser.tool = tool; this.requestUpdate(); };
    /** G move, R rotate, S select (Blender keys), while bones show and nothing is typed into */
    private handlekey = (e: KeyboardEvent) => {
        if (!this.bones || !this.poser || !this.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
        if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
        const tool = ({ g: "move", r: "rotate", s: "select" } as Record<string, PoseTool>)[e.key.toLowerCase()];
        if (tool) this.handletool(tool)();
    };
    private handleposereset = () => { this.poser?.clear(); this.requestUpdate(); };

    private handlemode = (mode: PreviewMode) => () => { this.mode = mode; };
    private handlelights = () => { this.lights = !this.lights; };
    private handlelight = (name: "ambient" | "sun" | "sunAzimuth" | "sunElevation" | "lamp" | "lampAngle") => (e: Event) => {
        this[name] = Number((e.target as HTMLInputElement).value);
    };
    private handleanimation = (e: Event) => { this.animation = (e.target as HTMLSelectElement).value; this.time = 0; };
    private handletoggle = (name: "bones" | "ik" | "hideModel") => () => { this[name] = !this[name]; };
    private handleplay = () => {
        const anim = this.model?.animation(this.animation);
        // play once: at the end, play starts over
        if (!this.playing && anim && this.noLoop && this.time >= anim.duration) this.time = 0;
        this.playing = !this.playing;
        this.requestUpdate();
    };
    private handlespeed = (e: Event) => { this.speed = Number((e.target as HTMLSelectElement).value); };
    private handleloop = () => { this.noLoop = !this.noLoop; };
    private handlestep = (n: number) => () => {
        this.playing = false;
        this.time = (Math.round(this.time * this.fps) + n) / this.fps;
        this.requestUpdate();
    };
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
            <pw-3d-demo no-bar pan="screen" part="demo">
            ${this.controls ? html`
                <div class="bar" part="controls">
                    <div class="modes">
                        ${(["turntable", "orbit", "fps"] as PreviewMode[]).map(m => html`
                            <pap-button size="small" variant="${m === this.mode ? "filled" : "outline"}" @click="${this.handlemode(m)}">${m}</pap-button>
                        `)}
                    </div>
                    ${this.model?.skin instanceof Skeleton ? html`
                        <div class="modes">
                            <pap-button size="small" variant="${!this.hideModel ? "filled" : "outline"}" @click="${this.handletoggle("hideModel")}">mesh</pap-button>
                            <pap-button size="small" variant="${this.bones ? "filled" : "outline"}" @click="${this.handletoggle("bones")}">bones</pap-button>
                            <pap-button size="small" variant="${this.ik ? "filled" : "outline"}" @click="${this.handletoggle("ik")}">IK</pap-button>
                            ${this.bones && this.poser ? (["select", "move", "rotate"] as PoseTool[]).map(t => html`
                                <pap-button size="small" variant="${this.poser!.tool === t ? "filled" : "outline"}" @click="${this.handletool(t)}">${t}</pap-button>
                            `) : ""}
                            ${this.bones ? html`<span class="bone">${this.poser?.selected?.name ?? "press a bone"}</span>` : ""}
                            ${this.poser?.edits.size ? html`<pap-button size="small" variant="outline" @click="${this.handleposereset}">reset pose</pap-button>` : ""}
                        </div>
                    ` : ""}
                    ${names.length ? html`
                        <select @change="${this.handleanimation}" aria-label="animation">
                            <option value="" ${!this.animation && "selected"}>rest pose</option>
                            ${names.map(n => html`<option value="${n}" ${n === this.animation && "selected"}>${n}</option>`)}
                        </select>
                        <pap-button size="small" variant="outline" @click="${this.handleplay}">${this.playing ? "pause" : "play"}</pap-button>
                        <select @change="${this.handlespeed}" aria-label="speed">
                            ${[.1, .25, .5, 1, 1.5, 2].map(v => html`<option value="${v}" ${v === this.speed && "selected"}>${v}×</option>`)}
                        </select>
                        <pap-button size="small" variant="${this.noLoop ? "outline" : "filled"}" @click="${this.handleloop}">loop</pap-button>
                        <input type="range" min="0" max="1" step="0.001" value="0" aria-label="time" @input="${this.handlescrub}" />
                        <pap-button size="small" variant="outline" @click="${this.handlestep(-1)}" aria-label="previous frame">‹</pap-button>
                        <output class="frame" aria-label="frame"></output>
                        <pap-button size="small" variant="outline" @click="${this.handlestep(1)}" aria-label="next frame">›</pap-button>
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

/** column major 4x4 times [x, y, z, w] (w 1 = point, 0 = direction) */
function transform(m: ArrayLike<number>, p: ArrayLike<number>, w: number) {
    return [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i] * w);
}
