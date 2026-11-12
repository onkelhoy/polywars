// system
import { CustomElement, html, property } from "@papit/web-component";
import { Camera, GameEngine, GameObject, type Layer3D } from "@papit/game-engine";

// local
import sheet from "./style.css" with { type: "css" };
import { fly, panZoom } from "./controllers";
import type { PanMode } from "./controllers";
import type { Color, DemoMode } from "./types";

/**
 * Stage for 3D views: a WebGL2 canvas on `@papit/game-engine`, a camera you can switch between
 * `pan` (map style pan / turn / zoom) and `fly` (free flight), keeping where it is.
 * Children are an overlay panel: pointer, wheel and typing in it never move the camera.
 * Set `draw` (and `tick`) to draw each frame; `background` follows the page theme.
 */
export class Demo3D extends CustomElement {
    static sheet = sheet;

    @property({ rerender: true, after: function (this: Demo3D) { this.applyMode(); } }) mode: DemoMode = "pan";
    /** pan mode drag: `ground` slides over the ground, `screen` moves in the view plane */
    @property({ after: function (this: Demo3D) { this.applyMode(); } }) pan: PanMode = "ground";
    /** fly speed, units per second (the wheel changes it while flying) */
    @property({ type: Number }) speed: number = 5;
    @property({ type: Number }) near: number = .05;
    @property({ type: Number }) far: number = 1000;
    /** hide the mode bar */
    @property({ type: Boolean, attribute: "no-bar" }) noBar: boolean = false;
    /** hide the direction arrows (bottom-left); the bar's "axes" button toggles them too */
    @property({ type: Boolean, attribute: "no-axes", rerender: true }) noAxes: boolean = false;

    /** hide the origin dot; the bar's "origin" button toggles it */
    @property({ type: Boolean, attribute: "no-origin", rerender: true }) noOrigin: boolean = false;
    /** where the origin dot sits, world space */
    origin: [number, number, number] = [0, 0, 0];

    /** called every frame before drawing, `dt` in seconds */
    tick?: (dt: number, demo: Demo3D) => void;
    /** draw the scene; clear with `demo.background` */
    draw?: (camera: Camera, demo: Demo3D) => void;

    engine?: GameEngine<any>;
    /** seconds since start */
    time = 0;
    /** page background as rgba 0..1, follows the light / dark theme */
    background: Color = [0, 0, 0, 1];
    private start: { position: number[]; rotation: number[]; target?: [number, number, number] } = { position: [6, 5, 8], rotation: [-.45, .65, 0] };
    /** pan mode's pivot */
    private pivot?: { x: number; y: number; z: number } & ArrayLike<number>;
    private resolveReady!: () => void;
    /** resolves once the engine and its layer exist */
    readonly ready = new Promise<void>(r => this.resolveReady = r);

    get layer() { return this.engine?.layers.main as Layer3D | undefined; }
    get gl() { return this.layer!.gl; }
    get camera() { return this.layer?.camera ?? null; }

    firstRender() {
        super.firstRender();
        const engine = new GameEngine({ name: "main", query: "canvas", type: "webgl2", documentElement: this.shadowRoot!, theme: true });
        this.engine = engine;
        const demo = this;
        engine.add(new class extends GameObject {
            override update(dt: number) { demo.time += dt; demo.tick?.(dt, demo); demo.updateAxes(); demo.updateOrigin(); }
            override render(layer: any) { if (layer.camera) demo.draw?.(layer.camera, demo); }
        }());
        engine.on("theme", () => this.readBackground());
        this.readBackground();
        this.applyMode();
        engine.start();
        this.resolveReady();
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();
        this.engine?.stop();
    }

    /** Place the camera at `from` looking at `to` (keeps the current mode); pan turns around `to`. */
    look(from: [number, number, number], to: [number, number, number]) {
        const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
        const flat = Math.hypot(d[0], d[2]);
        this.start = { position: [...from], rotation: [Math.atan2(d[1], flat), Math.atan2(-d[0], -d[2]), 0], target: [...to] };
        this.applyMode(true);
    }

    /** New camera with the current pose (or the start pose) and the mode's controller. */
    private applyMode(reset = false) {
        const layer = this.layer;
        if (!layer) return;
        const old = layer.camera;
        const pose = !reset && old ? { position: Array.from(old.position), rotation: Array.from(old.rotation) } : this.start;
        const kept = this.pivot ? Array.from(this.pivot) as [number, number, number] : undefined;
        const target = reset || !old ? this.start.target : kept;
        const controller = this.mode === "fly" ? fly({ speed: this.speed }) : panZoom({ pivot: target, pan: this.pan });
        this.pivot = "pivot" in controller ? controller.pivot : undefined;
        const camera = new Camera({ near: this.near, far: this.far, controllers: [controller] });
        camera.position.set(pose.position);
        camera.rotation.set(pose.rotation);
        layer.camera = camera;
    }

    /** the host's resolved background (`--background` of the theme) as rgba, via a 1px canvas so any css colour works */
    private readBackground() {
        const computed = getComputedStyle(this).backgroundColor;
        const css = computed && computed !== "rgba(0, 0, 0, 0)" ? computed : this.engine?.theme === "dark" ? "#1c1c1e" : "#f2f2f2";
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        this.background = [r / 255, g / 255, b / 255, 1];
    }

    /** turn the corner arrows with the camera: world axes projected on the camera's right / up */
    private updateAxes() {
        const svg = this.noAxes ? null : this.shadowRoot?.querySelector(".axes");
        const camera = this.camera;
        if (!svg || !camera) return;
        const pitch = camera.rotation[0], yaw = camera.rotation[1];
        const r = [Math.cos(yaw), 0, -Math.sin(yaw)];
        const f = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
        const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
        // far ends first so the near arrows draw on top
        const order = [0, 1, 2].sort((a, b) => f[b] - f[a]);
        order.forEach(k => {
            const g = svg.querySelector(`[data-axis="${k}"]`) as SVGGElement | null;
            if (!g) return;
            const x = r[k] * 22, y = -u[k] * 22;
            g.querySelector("line")!.setAttribute("x2", String(x));
            g.querySelector("line")!.setAttribute("y2", String(y));
            g.querySelector("circle")!.setAttribute("cx", String(x));
            g.querySelector("circle")!.setAttribute("cy", String(y));
            g.querySelector("text")!.setAttribute("x", String(x));
            g.querySelector("text")!.setAttribute("y", String(y));
            g.style.opacity = f[k] > .5 ? ".45" : "1";
            svg.appendChild(g);
        });
    }

    /** put the origin dot where `origin` lands on screen, hidden behind the camera */
    private updateOrigin() {
        const dot = this.noOrigin ? null : this.shadowRoot?.querySelector<HTMLElement>(".origin");
        const camera = this.camera, stage = this.shadowRoot?.querySelector<HTMLElement>(".stage");
        if (!dot || !camera || !stage) return;
        const pitch = camera.rotation[0], yaw = camera.rotation[1], p = camera.position, o = this.origin;
        const r = [Math.cos(yaw), 0, -Math.sin(yaw)];
        const f = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
        const u = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
        const d = [o[0] - p[0], o[1] - p[1], o[2] - p[2]];
        const dot3 = (a: number[]) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
        const z = dot3(f);
        if (z <= camera.near) { dot.style.display = "none"; return; }
        const w = stage.clientWidth, h = stage.clientHeight, t = Math.tan(camera.fov / 2) / (camera.zoom || 1);
        dot.style.display = "";
        dot.style.transform = `translate(${w / 2 + dot3(r) / (z * t) * h / 2}px, ${h / 2 - dot3(u) / (z * t) * h / 2}px)`;
    }

    private handleorigin = () => { this.noOrigin = !this.noOrigin; };
    private handleaxes = () => { this.noAxes = !this.noAxes; };
    private handlemode = (mode: DemoMode) => () => { this.mode = mode; };

    render() {
        return html`
            <div class="stage" part="stage"><canvas part="canvas"></canvas></div>
            ${this.noOrigin ? "" : html`<div class="origin" part="origin"></div>`}
            <div class="panel" part="panel"><slot></slot></div>
            ${this.noAxes ? "" : html`
                <svg class="axes" part="axes" viewBox="-32 -32 64 64">
                    <circle class="ring" r="30"></circle>
                    <g data-axis="0" class="x"><line x1="0" y1="0"></line><circle r="6"></circle><text>X</text></g>
                    <g data-axis="1" class="y"><line x1="0" y1="0"></line><circle r="6"></circle><text>Y</text></g>
                    <g data-axis="2" class="z"><line x1="0" y1="0"></line><circle r="6"></circle><text>Z</text></g>
                </svg>
            `}
            ${this.noBar ? "" : html`
                <div class="bar" part="bar">
                    <button class="${this.mode === "pan" ? "on" : ""}" @click="${this.handlemode("pan")}">pan</button>
                    <button class="${this.mode === "fly" ? "on" : ""}" @click="${this.handlemode("fly")}">fly</button>
                    <button class="${this.noAxes ? "" : "on"}" @click="${this.handleaxes}">axes</button>
                    <button class="${this.noOrigin ? "" : "on"}" @click="${this.handleorigin}">origin</button>
                    <span>${this.mode === "fly"
                        ? "click to look (esc frees) · right drag look · WASD · E/Q up/down · shift fast · wheel speed"
                        : "drag turn · right/shift drag pan · wheel zoom"}</span>
                </div>
            `}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-3d-demo": Demo3D;
    }
}
