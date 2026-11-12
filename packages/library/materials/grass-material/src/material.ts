import type { Layer3D } from "@papit/game-engine";
import { noise } from "./noise";
import { GROUND_FRAGMENT, GROUND_VERTEX, TUFT_FRAGMENT, TUFT_VERTEX } from "./shaders";
import { sprite } from "./sprites";
import type { GrassLook, Light, Pusher, View } from "./types";

type Program = { name: string; program: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

let ids = 0;
const MODES = { sprite: 0, cross: 1, mesh: 2 } as const;

/** A medium pixel-style meadow; any field can be overridden. */
export const GRASS_LOOK: GrassLook = {
    size: [.22, .33],
    color: "#5d9a3a",
    shape: "leaves",
    bladeShare: .35,
    variation: .12,
    patches: [
        { color: "#7bb045", scale: .02, threshold: .58, softness: .08 },
        { color: "#4a7d33", scale: .015, threshold: .62, softness: .08 },
    ],
    accents: [
        { chance: .004, color: "#e8d36a", height: .12, scale: 1.2 },
        { chance: .02, color: "#8fc456", height: .05, scale: 1 },
    ],
    wind: { direction: [0, 1], speed: .025, scale: .07, threshold: .365, diverge: 10, angle: 60, perspective: .3 },
    sway: { speed: .1, angle: 10 },
    push: { angle: 45, exponent: 1 },
    clouds: { scale: 40, speed: .05, direction: [1, .3], height: 30, contrast: 2, threshold: .1, min: .45, diverge: 12 },
    lighting: { wrap: 0, steepness: 1 },
    bands: 3,
    softBands: .2,
    pixelated: true,
    pixels: 24,
    stepped: true,
    framerate: 5,
    noiseSize: 128,
    pushers: 16,
    source: "sprite",
    distance: 45,
    debug: "",
};

/** a few named looks on top of `GRASS_LOOK` (views, gallery) */
export const GRASS_LOOKS: Record<string, Partial<GrassLook>> = {
    meadow: {},
    smooth: { pixelated: false, stepped: false, framerate: 30, bands: 0, pixels: 64, softBands: 0 },
    blades: { shape: "blades" },
    dry: {
        color: "#a39a52", shape: "mixed",
        patches: [{ color: "#c2b46a", scale: .02, threshold: .55, softness: .1 }, { color: "#7d7a3c", scale: .015, threshold: .62, softness: .08 }],
        accents: [{ chance: .01, color: "#d9c27a", height: .1, scale: 1.1 }],
    },
};

/** sRGB hex to linear rgb */
export function linear(hex: string): [number, number, number] {
    const n = parseInt(hex.replace("#", ""), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => Math.pow(c / 255, 2.2)) as [number, number, number];
}

/**
 * The grass material: tuft and ground programs, the noise texture (wind, patches, clouds) and the sprites.
 * Geometry is the caller's. `useTufts` / `useGround` bind everything for the next draw.
 *
 * Tuft attributes: 0 position (base at y 0, height 1), 1 normal, 2 uv (v 0 at the root), 4 instance `x y z scale`.
 * Ground attributes: 0 position.
 */
export class GrassMaterial {
    readonly gl: WebGL2RenderingContext;
    private o: GrassLook;
    private tufts?: Program;
    private groundProgram?: Program;
    private noiseTex?: WebGLTexture;
    private sprites: WebGLTexture[] = [];
    private masks = [1, 1, 1, 1];
    private pushers = new Float32Array(0);
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };
    private id = ids++;
    private version = 0;

    /** Programs come from the layer (async); `useTufts` / `useGround` return false until they are linked. */
    constructor(readonly layer: Layer3D, look: Partial<GrassLook> = {}) {
        this.gl = layer.gl;
        this.o = { ...GRASS_LOOK, ...look };
        this.compile();
        this.link(`grass-material-${this.id}-ground`, GROUND_VERTEX, GROUND_FRAGMENT).then(p => this.groundProgram = p);
        this.buildNoise();
        this.buildSprites();
    }

    get look(): Readonly<GrassLook> { return this.o; }

    /** Merge settings. Rebuilds only what the change needs (shader, noise, sprites). */
    set(look: Partial<GrassLook>) {
        const before = this.o;
        this.o = { ...before, ...look };
        if (this.o.pushers !== before.pushers) this.compile();
        if (this.o.noiseSize !== before.noiseSize) this.buildNoise();
        if (this.o.pixels !== before.pixels || this.o.pixelated !== before.pixelated || this.o.sprites !== before.sprites) this.buildSprites();
    }

    /** Characters that bend grass: x y z radius each. Only the first `pushers` count. */
    push(pushers: Pusher[]) {
        const n = Math.min(pushers.length, this.o.pushers);
        if (this.pushers.length !== n * 4) this.pushers = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) this.pushers.set(pushers[i], i * 4);
    }

    /** Bind the tuft program and its uniforms; `time` in seconds. False while it still links. */
    useTufts(view: View, light: Light, time: number): boolean {
        const gl = this.gl, o = this.o, p = this.tufts;
        if (!p) return false;
        const u = p.u;
        gl.useProgram(p.program);
        this.common(p, view, light, time);
        gl.uniform1i(u("mode"), MODES[o.source]);
        gl.uniform1i(u("debug"), o.debug === "wind" ? 1 : o.debug === "push" ? 2 : 0);
        gl.uniform1f(u("time"), time);
        gl.uniform1f(u("framerate"), o.framerate);
        gl.uniform1i(u("stepped"), o.stepped ? 1 : 0);
        gl.uniform1f(u("maxDistance"), o.distance);
        gl.uniform2f(u("size"), o.size[0], o.size[1]);
        gl.uniform2fv(u("windDirection"), o.wind.direction);
        gl.uniform1f(u("windSpeed"), o.wind.speed);
        gl.uniform1f(u("windScale"), o.wind.scale);
        gl.uniform1f(u("windThreshold"), o.wind.threshold);
        gl.uniform1f(u("windDiverge"), o.wind.diverge);
        gl.uniform1f(u("windAngle"), o.wind.angle);
        gl.uniform1f(u("perspective"), o.wind.perspective);
        gl.uniform1f(u("swaySpeed"), o.sway.speed);
        gl.uniform1f(u("swayAngle"), o.sway.angle);
        gl.uniform1f(u("pushAngle"), o.push.angle);
        gl.uniform1f(u("pushExponent"), o.push.exponent);
        gl.uniform1i(u("pusherCount"), this.pushers.length / 4);
        if (this.pushers.length) gl.uniform4fv(u("pushers"), this.pushers);
        const a = [o.accents[0], o.accents[1]];
        gl.uniform2f(u("accentChance"), a[0]?.chance ?? 0, a[1]?.chance ?? 0);
        gl.uniform2f(u("accentHeight"), a[0]?.height ?? 0, a[1]?.height ?? 0);
        gl.uniform2f(u("accentScale"), a[0]?.scale ?? 1, a[1]?.scale ?? 1);
        gl.uniform3fv(u("accentColor"), [...linear(a[0]?.color ?? o.color), ...linear(a[1]?.color ?? o.color)]);
        gl.uniform4fv(u("spriteMask"), this.masks);
        gl.uniform4f(u("spriteAnchor"), .5, 0, 0, 0);
        gl.uniform1f(u("bladeShare"), o.shape === "leaves" ? 0 : o.shape === "blades" ? 1 : o.bladeShare);
        gl.uniform1f(u("variation"), o.variation);
        this.sprites.forEach((t, i) => {
            gl.activeTexture(gl.TEXTURE1 + i);
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.uniform1i(u("sprite" + i), 1 + i);
        });
        gl.activeTexture(gl.TEXTURE0);
        return true;
    }

    /** Bind the ground program: the floor with the same patches, light and clouds. `darken` scales its colour. */
    useGround(view: View, light: Light, time: number, darken = .8): boolean {
        const gl = this.gl, p = this.groundProgram;
        if (!p) return false;
        gl.useProgram(p.program);
        this.common(p, view, light, time);
        // pixel style: one texel per sprite pixel
        gl.uniform1f(p.u("texel"), this.o.pixelated ? this.o.size[0] / this.o.pixels : 0);
        gl.uniform1f(p.u("darken"), darken);
        return true;
    }

    destroy() {
        const gl = this.gl;
        [this.noiseTex, ...this.sprites].forEach(t => t && gl.deleteTexture(t));
        [this.tufts, this.groundProgram].forEach(p => p && this.layer.deleteProgram(p.name));
    }

    // ---- internals ----

    /** uniforms both programs share: camera, light, colours, clouds */
    private common(p: Program, view: View, light: Light, time: number) {
        const gl = this.gl, u = p.u, o = this.o;
        this.f32.view.set(view.viewMatrix);
        this.f32.projection.set(view.projectionMatrix);
        gl.uniformMatrix4fv(u("view"), false, this.f32.view);
        gl.uniformMatrix4fv(u("projection"), false, this.f32.projection);
        const e = view.worldPosition ?? { x: 0, y: 0, z: 0 };
        gl.uniform3f(u("eye"), e.x, e.y, e.z);
        gl.uniform3fv(u("sunDirection"), light.sunDirection);
        gl.uniform3fv(u("sunColor"), light.sunColor);
        gl.uniform1f(u("sunStrength"), light.sunStrength);
        gl.uniform3fv(u("sky"), light.sky);
        gl.uniform3fv(u("ground"), light.ground);
        gl.uniform1f(u("ambient"), light.ambient);
        gl.uniform3fv(u("fogColor"), light.fogColor);
        gl.uniform1f(u("fogDensity"), light.fogDensity);
        gl.uniform3fv(u("grassColor"), linear(o.color));
        const pa = [o.patches[0], o.patches[1]];
        gl.uniform3fv(u("patchColor"), [...linear(pa[0]?.color ?? o.color), ...linear(pa[1]?.color ?? o.color)]);
        gl.uniform3fv(u("patchNoise"), [pa[0]?.scale ?? 0, pa[0]?.threshold ?? 2, pa[0]?.softness ?? 0, pa[1]?.scale ?? 0, pa[1]?.threshold ?? 2, pa[1]?.softness ?? 0]);
        gl.uniform1f(u("bands"), o.bands);
        gl.uniform1f(u("softBands"), o.softBands);
        gl.uniform1f(u("wrap"), o.lighting.wrap);
        gl.uniform1f(u("steepness"), o.lighting.steepness);
        const c = o.clouds;
        gl.uniform1i(u("clouds"), c ? 1 : 0);
        gl.uniform1f(u("cloudTime"), time);
        if (c)
        {
            gl.uniform2fv(u("cloudDirection"), c.direction);
            gl.uniform1f(u("cloudScale"), c.scale);
            gl.uniform1f(u("cloudSpeed"), c.speed);
            gl.uniform1f(u("cloudHeight"), c.height);
            gl.uniform1f(u("cloudContrast"), c.contrast);
            gl.uniform1f(u("cloudThreshold"), c.threshold);
            gl.uniform1f(u("cloudMin"), c.min);
            gl.uniform1f(u("cloudDiverge"), c.diverge);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTex!);
        gl.uniform1i(u("noiseTex"), 0);
    }

    private compile() {
        const version = ++this.version;
        this.link(`grass-material-${this.id}-tufts-${version}`, TUFT_VERTEX(this.o.pushers), TUFT_FRAGMENT).then(p => {
            // a newer compile may have started meanwhile
            if (version !== this.version) return this.layer.deleteProgram(p.name);
            if (this.tufts) this.layer.deleteProgram(this.tufts.name);
            this.tufts = p;
        });
    }

    private async link(name: string, vertex: string, fragment: string): Promise<Program> {
        const gl = this.gl, program = await this.layer.createProgram(name, vertex, fragment);
        const cache = new Map<string, WebGLUniformLocation | null>();
        return { name, program, u: n => cache.has(n) ? cache.get(n)! : (cache.set(n, gl.getUniformLocation(program, n)), cache.get(n)!) };
    }

    private buildNoise() {
        const gl = this.gl, n = this.o.noiseSize;
        this.noiseTex ??= gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise(n));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
    }

    /** Generated sprites, replaced by `sprites` entries when given (urls load async). */
    private buildSprites() {
        const gl = this.gl, o = this.o;
        const kinds = ["leaves", "flower", "leafy", "tuft"] as const;
        kinds.forEach((kind, i) => {
            const t = this.sprites[i] ??= gl.createTexture()!;
            const custom = o.sprites?.[i];
            const img = sprite(kind, o.pixels, i + 1);
            this.upload(t, { width: img.width, height: img.height, data: img.data });
            this.masks[i] = 1;
            if (!custom) return;
            const apply = (source: TexImageSource) => { if (this.o.sprites?.[i] === custom) { this.upload(t, source); this.masks[i] = 0; } };
            if (typeof custom === "string")
            {
                const image = new Image();
                image.onload = () => apply(image);
                image.src = custom;
            }
            else apply(custom);
        });
    }

    private upload(texture: WebGLTexture, source: TexImageSource | { width: number; height: number; data: Uint8Array }) {
        const gl = this.gl, pixel = this.o.pixelated;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if ("data" in source)
        {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
        }
        else
        {
            // images are stored top row first, the tuft uv has v = 0 at the root
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pixel ? gl.NEAREST : gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, pixel ? gl.NEAREST : gl.LINEAR);
        if (!pixel) gl.generateMipmap(gl.TEXTURE_2D);
    }
}
