import type { Layer3D } from "@papit/game-engine";
import { WATER_FRAGMENT, WATER_VERTEX } from "./shaders";
import type { Light, View, WaterLook } from "./types";

type Program = { name: string; program: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

let ids = 0;

/** A clear low poly sea. Lengths in metres; any field can be overridden (nested objects merge). */
export const WATER_LOOK: WaterLook = {
    shallow: "#4fb3c4",
    deep: "#1d5a8c",
    fresh: { shallow: "#5aa8b0", deep: "#265e78" },
    opacity: .5,
    clarity: 6,
    sky: .4,
    glints: { dark: .08, scale: .7, length: 1.4, lane: .4, strength: 1, specks: .3, speed: .25, far: 220 },
    foam: { color: "#ffffff", contact: .06, rim: .45, wobble: .4, wobbleScale: 6, lines: 3, width: .12, spacing: 2.5, speed: .3, pieces: .5, amount: .85, far: 300 },
    streaks: { amount: .8, length: 4, width: .2 },
    under: { shallow: "#3aa7b8", deep: "#0b2e52", clarity: 14, density: .035, sun: .06 },
};

/** named looks on top of `WATER_LOOK`: from clear sea to swamp */
export const WATER_LOOKS: Record<string, Partial<WaterLook>> = {
    sea: {},
    calm: { glints: { ...WATER_LOOK.glints, dark: .05, specks: .2, speed: .15 }, foam: { ...WATER_LOOK.foam, lines: 2, speed: .2, pieces: .6 } },
    stormy: {
        shallow: "#4a98a8", deep: "#173f63", glints: { ...WATER_LOOK.glints, dark: .14, speed: .6, length: 2.2 },
        foam: { ...WATER_LOOK.foam, rim: .8, contact: .15, wobble: .2, wobbleScale: 14, lines: 5, width: .35, spacing: 4, speed: .45, pieces: .15, amount: 1 },
    },
    tropical: { shallow: "#63d2cf", deep: "#2678b5", clarity: 12, opacity: .35, under: { ...WATER_LOOK.under, shallow: "#58cfd0", deep: "#145a8a", density: .02, clarity: 25 } },
    lake: { shallow: "#5a9fa0", deep: "#2a5a6e", fresh: { shallow: "#5a9fa0", deep: "#2a5a6e" }, under: { ...WATER_LOOK.under, shallow: "#4a8f8a", deep: "#173f4a", density: .06, clarity: 8 } },
    muddy: {
        shallow: "#8f8a5c", deep: "#5e5536", fresh: { shallow: "#8f8a5c", deep: "#5e5536" }, opacity: .85, clarity: 1.5,
        glints: { ...WATER_LOOK.glints, dark: .06, specks: .1 },
        under: { shallow: "#7d744a", deep: "#3b3420", clarity: 2, density: .35, sun: .4 },
    },
    swamp: {
        shallow: "#4d6b3c", deep: "#2b3a24", fresh: { shallow: "#4d6b3c", deep: "#2b3a24" }, opacity: .9, clarity: 1, sky: .2,
        glints: { ...WATER_LOOK.glints, dark: .04, specks: .05, lane: .2 }, foam: { ...WATER_LOOK.foam, amount: .3, lines: 0, color: "#c9cfa8" },
        under: { shallow: "#3e5530", deep: "#141c10", clarity: 1.5, density: .5, sun: .6 },
    },
};

/** sRGB hex to linear rgb */
export function linear(hex: string): [number, number, number] {
    const n = parseInt(hex.replace("#", ""), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => Math.pow(c / 255, 2.2)) as [number, number, number];
}

/** one level deep merge: nested plain objects merge, the rest replaces */
export function merge<T extends object>(base: T, over: Partial<T>): T {
    const out: any = { ...base };
    for (const [k, v] of Object.entries(over))
    {
        if (v === undefined) continue;
        const b = (base as any)[k];
        out[k] = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b) ? { ...b, ...v } : v;
    }
    return out;
}

/**
 * Set the `UNDER_GLSL` uniforms on the bound program: the underwater colours of `under`, and the surface above the eye
 * (`eyeSurface`, metres; any value when the eye is not under water).
 */
export function bindUnder(gl: WebGL2RenderingContext, u: (name: string) => WebGLUniformLocation | null, under: WaterLook["under"], eyeSurface: number) {
    gl.uniform3fv(u("underShallow"), linear(under.shallow));
    gl.uniform3fv(u("underDeep"), linear(under.deep));
    gl.uniform1f(u("underClarity"), under.clarity);
    gl.uniform1f(u("underDensity"), under.density);
    gl.uniform1f(u("underSun"), under.sun);
    gl.uniform1f(u("eyeSurface"), eyeSurface);
}

/**
 * Low poly water: a flat surface in a depth colour, toon dashes that turn white in the sun, specks, shore foam lines that
 * show near the camera, dashes running with rivers, and the view from below. Procedural, no textures. Geometry is the caller's
 * (flat, few vertices).
 *
 * Attributes: 0 position, 1 info (depth m, shore distance m, < 0 over land), 2 flow (u v metres, speed m/s along v, open water 0..1),
 * 3 shore direction (x z toward land, optional).
 * Draw after the opaque scene with premultiplied blending (`gl.ONE, gl.ONE_MINUS_SRC_ALPHA`), depth writes off.
 */
export class WaterMaterial {
    readonly gl: WebGL2RenderingContext;
    private o: WaterLook;
    private program?: Program;
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };
    private id = ids++;

    constructor(readonly layer: Layer3D, look: Partial<WaterLook> = {}) {
        this.gl = layer.gl;
        this.o = merge(WATER_LOOK, look);
        this.link().then(p => this.program = p);
    }

    get look(): Readonly<WaterLook> { return this.o; }
    set(look: Partial<WaterLook>) { this.o = merge(this.o, look); }

    /**
     * Bind for the next draw. `fresh` uses the lake / river colours; `under`: the eye is below this water, whose surface is at
     * `surface` metres there. `contacts`: x z radius per thing standing in the water (up to 32) for a thin foam ring. False while linking.
     */
    use(view: View, light: Light, time: number, { fresh = false, under = false, surface = 0, contacts = [] as ArrayLike<number> } = {}): boolean {
        const gl = this.gl, o = this.o, p = this.program;
        if (!p) return false;
        const u = p.u;
        gl.useProgram(p.program);
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
        gl.uniform1f(u("time"), time);

        const colors = fresh ? o.fresh : o, g = o.glints, f = o.foam;
        gl.uniform3fv(u("shallow"), linear(colors.shallow));
        gl.uniform3fv(u("deep"), linear(colors.deep));
        gl.uniform1f(u("opacity"), o.opacity);
        gl.uniform1f(u("clarity"), o.clarity);
        gl.uniform1f(u("skyTint"), o.sky);
        gl.uniform1f(u("glintDark"), g.dark);
        gl.uniform1f(u("glintScale"), g.scale);
        gl.uniform1f(u("glintLength"), g.length);
        gl.uniform1f(u("glintLane"), g.lane);
        gl.uniform1f(u("glintStrength"), g.strength);
        gl.uniform1f(u("glintSpecks"), g.specks);
        gl.uniform1f(u("glintSpeed"), g.speed);
        gl.uniform1f(u("glintFar"), g.far);
        gl.uniform3fv(u("foamColor"), linear(f.color));
        gl.uniform1f(u("foamRim"), f.rim);
        gl.uniform1f(u("foamWobble"), f.wobble);
        gl.uniform1f(u("foamWobbleScale"), f.wobbleScale);
        gl.uniform1f(u("foamLines"), f.lines);
        gl.uniform1f(u("foamWidth"), f.width);
        gl.uniform1f(u("foamSpacing"), f.spacing);
        gl.uniform1f(u("foamSpeed"), f.speed);
        gl.uniform1f(u("foamPieces"), f.pieces);
        gl.uniform1f(u("foamAmount"), f.amount);
        gl.uniform1f(u("foamFar"), f.far);
        gl.uniform1f(u("foamContact"), f.contact);
        const count = Math.min(32, Math.floor(contacts.length / 3));
        gl.uniform1i(u("contactCount"), count);
        if (count) gl.uniform3fv(u("contacts[0]"), Float32Array.from(Array.prototype.slice.call(contacts, 0, count * 3)));
        gl.uniform1f(u("streakAmount"), o.streaks.amount);
        gl.uniform1f(u("streakLength"), o.streaks.length);
        gl.uniform1f(u("streakWidth"), o.streaks.width);
        gl.uniform1i(u("under"), under ? 1 : 0);
        bindUnder(gl, u, o.under, surface);
        return true;
    }

    destroy() {
        if (this.program) this.layer.deleteProgram(this.program.name);
    }

    private async link(): Promise<Program> {
        const gl = this.gl, name = `water-${this.id}`, program = await this.layer.createProgram(name, WATER_VERTEX, WATER_FRAGMENT);
        const cache = new Map<string, WebGLUniformLocation | null>();
        return { name, program, u: n => cache.has(n) ? cache.get(n)! : (cache.set(n, gl.getUniformLocation(program, n)), cache.get(n)!) };
    }
}
