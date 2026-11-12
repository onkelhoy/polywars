import type { Layer3D } from "@papit/game-engine";
import { WATER_FRAGMENT, WATER_VERTEX } from "./shaders";
import { waterTexture } from "./texture";
import type { Light, View, WaterLook } from "./types";

type Program = { name: string; program: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

let ids = 0;

/** A low poly sea; any field can be overridden (nested objects merge). */
export const WATER_LOOK: WaterLook = {
    shallow: "#3fa7b5",
    deep: "#1a476b",
    fresh: { shallow: "#4a9aa8", deep: "#24546a" },
    opacity: .55,
    clarity: 8,
    sparkle: { strength: 1.2, size: .35, scale: 6, far: 250 },
    sky: .5,
    foam: { color: "#ffffff", width: 30, spacing: 9, speed: .05, amount: 1, shore: 2.5, far: 350 },
    streaks: { amount: .6, length: 14, width: 1.2 },
    under: { color: "#1f6273", density: .045, caustics: .6 },
};

/** a few named looks on top of `WATER_LOOK` (views, gallery) */
export const WATER_LOOKS: Record<string, Partial<WaterLook>> = {
    sea: {},
    calm: { foam: { ...WATER_LOOK.foam, amount: .6, width: 15 }, sparkle: { ...WATER_LOOK.sparkle, size: .2 } },
    stormy: { deep: "#14324a", foam: { ...WATER_LOOK.foam, spacing: 6, speed: .1, width: 45 } },
    tropical: { shallow: "#5cc6c6", deep: "#2a72a8", clarity: 14 },
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
 * Low poly water: a flat plane in a depth colour, hard sun flecks, shore foam lines that show near the camera,
 * streaks running with rivers, and an underwater view. Geometry is the caller's (flat, few vertices).
 *
 * Attributes: 0 position, 1 info (depth m, shore distance m), 2 flow (u v metres, speed m/s along v, open water 0..1).
 * Draw after the opaque scene with premultiplied blending (`gl.ONE, gl.ONE_MINUS_SRC_ALPHA`), depth writes off.
 */
export class WaterMaterial {
    readonly gl: WebGL2RenderingContext;
    /** rg ripple normal, b caustics, a foam noise; ground shaders can use it for caustics (`CAUSTICS_GLSL`) */
    readonly texture: WebGLTexture;
    private o: WaterLook;
    private program?: Program;
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };
    private id = ids++;

    constructor(readonly layer: Layer3D, look: Partial<WaterLook> = {}) {
        this.gl = layer.gl;
        this.o = merge(WATER_LOOK, look);
        const gl = this.gl, size = 256;
        this.texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, waterTexture(size));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.link().then(p => this.program = p);
    }

    get look(): Readonly<WaterLook> { return this.o; }
    set(look: Partial<WaterLook>) { this.o = merge(this.o, look); }

    /** Bind for the next draw. `fresh` uses the lake / river colours, `under` the view from below. False while linking. */
    use(view: View, light: Light, time: number, { fresh = false, under = false } = {}): boolean {
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

        const colors = fresh ? o.fresh : o;
        gl.uniform3fv(u("shallow"), linear(colors.shallow));
        gl.uniform3fv(u("deep"), linear(colors.deep));
        gl.uniform1f(u("opacity"), o.opacity);
        gl.uniform1f(u("clarity"), o.clarity);
        gl.uniform1f(u("skyTint"), o.sky);
        gl.uniform1f(u("sparkle"), o.sparkle.strength);
        gl.uniform1f(u("sparkleSize"), o.sparkle.size);
        gl.uniform1f(u("sparkleScale"), o.sparkle.scale);
        gl.uniform1f(u("sparkleFar"), o.sparkle.far);
        gl.uniform3fv(u("foamColor"), linear(o.foam.color));
        gl.uniform1f(u("foamWidth"), o.foam.width);
        gl.uniform1f(u("foamSpacing"), o.foam.spacing);
        gl.uniform1f(u("foamSpeed"), o.foam.speed);
        gl.uniform1f(u("foamAmount"), o.foam.amount);
        gl.uniform1f(u("foamShore"), o.foam.shore);
        gl.uniform1f(u("foamFar"), o.foam.far);
        gl.uniform1f(u("streakAmount"), o.streaks.amount);
        gl.uniform1f(u("streakLength"), o.streaks.length);
        gl.uniform1f(u("streakWidth"), o.streaks.width);
        gl.uniform3fv(u("underColor"), linear(o.under.color));
        gl.uniform1f(u("underDensity"), o.under.density);
        gl.uniform1i(u("under"), under ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(u("tex"), 0);
        return true;
    }

    destroy() {
        this.gl.deleteTexture(this.texture);
        if (this.program) this.layer.deleteProgram(this.program.name);
    }

    private async link(): Promise<Program> {
        const gl = this.gl, name = `water-material-${this.id}`, program = await this.layer.createProgram(name, WATER_VERTEX, WATER_FRAGMENT);
        const cache = new Map<string, WebGLUniformLocation | null>();
        return { name, program, u: n => cache.has(n) ? cache.get(n)! : (cache.set(n, gl.getUniformLocation(program, n)), cache.get(n)!) };
    }
}
