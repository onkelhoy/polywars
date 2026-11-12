// system
import { CustomElement, html, property } from "@papit/web-component";
import { Camera, GameEngine, GameObject, type Layer3D } from "@papit/game-engine";

// local
import sheet from "./style.css" with { type: "css" };
import { fly, panZoom } from "./controllers";
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
    /** fly speed, units per second (the wheel changes it while flying) */
    @property({ type: Number }) speed: number = 5;
    @property({ type: Number }) near: number = .05;
    @property({ type: Number }) far: number = 1000;
    /** hide the mode bar */
    @property({ type: Boolean, attribute: "no-bar" }) noBar: boolean = false;

    /** called every frame before drawing, `dt` in seconds */
    tick?: (dt: number, demo: Demo3D) => void;
    /** draw the scene; clear with `demo.background` */
    draw?: (camera: Camera, demo: Demo3D) => void;

    engine?: GameEngine<any>;
    /** seconds since start */
    time = 0;
    /** page background as rgba 0..1, follows the light / dark theme */
    background: Color = [0, 0, 0, 1];
    private start: { position: number[]; rotation: number[] } = { position: [6, 5, 8], rotation: [-.45, .65, 0] };
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
            override update(dt: number) { demo.time += dt; demo.tick?.(dt, demo); }
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

    /** Place the camera at `from` looking at `to` (keeps the current mode). */
    look(from: [number, number, number], to: [number, number, number]) {
        const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
        const flat = Math.hypot(d[0], d[2]);
        this.start = { position: [...from], rotation: [Math.atan2(d[1], flat), Math.atan2(-d[0], -d[2]), 0] };
        this.applyMode(true);
    }

    /** New camera with the current pose (or the start pose) and the mode's controller. */
    private applyMode(reset = false) {
        const layer = this.layer;
        if (!layer) return;
        const old = layer.camera;
        const pose = !reset && old ? { position: Array.from(old.position), rotation: Array.from(old.rotation) } : this.start;
        const controller = this.mode === "fly" ? fly({ speed: this.speed }) : panZoom();
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

    private handlemode = (mode: DemoMode) => () => { this.mode = mode; };

    render() {
        return html`
            <div class="stage" part="stage"><canvas part="canvas"></canvas></div>
            <div class="panel" part="panel"><slot></slot></div>
            ${this.noBar ? "" : html`
                <div class="bar" part="bar">
                    <button class="${this.mode === "pan" ? "on" : ""}" @click="${this.handlemode("pan")}">pan</button>
                    <button class="${this.mode === "fly" ? "on" : ""}" @click="${this.handlemode("fly")}">fly</button>
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
