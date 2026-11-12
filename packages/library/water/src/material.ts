import type { Layer3D } from "@papit/game-engine";
import { WATER_FRAGMENT, WATER_VERTEX } from "./shaders";
import type { Light, View, WaterLook } from "./types";
import type { ShoreMap } from "./shore";

type Program = { name: string; program: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

let ids = 0;

/** column major 4x4: a * b */
function mul4(a: ArrayLike<number>, b: ArrayLike<number>, out: Float32Array) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return out;
}

/** 4x4 inverse (cofactors), in place */
function invert4(m: Float32Array) {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06, d = det ? 1 / det : 0;
    m.set([
        (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
        (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
        (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
        (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
    ]);
    return m;
}

/** depth formats a blit may need to match the drawn framebuffer, most likely first */
const DEPTH_FORMATS = (gl: WebGL2RenderingContext) => {
    const d24 = [gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.DEPTH_ATTACHMENT];
    const d24s8 = [gl.DEPTH24_STENCIL8, gl.DEPTH_STENCIL, gl.UNSIGNED_INT_24_8, gl.DEPTH_STENCIL_ATTACHMENT];
    const d32 = [gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT, gl.DEPTH_ATTACHMENT];
    // browsers often back the default depth with depth24 stencil8 even without a stencil asked for
    return [d24s8, d24, d32];
};

/** A clear low poly sea. Lengths in metres; any field can be overridden (nested objects merge). */
export const WATER_LOOK: WaterLook = {
    shallow: "#4fb3c4",
    deep: "#1d5a8c",
    fresh: { shallow: "#5aa8b0", deep: "#265e78" },
    opacity: .5,
    clarity: 6,
    sky: .4,
    horizon: .6,
    paint: { amount: .35, scale: 18 },
    glints: { dark: .12, scale: .7, length: 1.4, lane: .5, strength: 1, specks: .3, speed: .25, far: 220, density: .8, melt: .8, glow: .06 },
    foam: { color: "#ffffff", contact: .08, rim: .6, wobble: .35, wobbleScale: 7, lines: 2, width: .16, spacing: 1.3, speed: .35, pieces: .4, amount: .9, far: 300 },
    streaks: { amount: .8, length: 4, width: .2 },
    under: { shallow: "#3aa7b8", deep: "#0b2e52", clarity: 14, density: .035, sun: .06 },
};

/** named looks on top of `WATER_LOOK`: from clear sea to swamp */
export const WATER_LOOKS: Record<string, Partial<WaterLook>> = {
    sea: {},
    calm: { glints: { ...WATER_LOOK.glints, dark: .05, specks: .2, speed: .15 }, foam: { ...WATER_LOOK.foam, lines: 2, speed: .25, pieces: .55 } },
    stormy: {
        shallow: "#4a98a8", deep: "#173f63", glints: { ...WATER_LOOK.glints, dark: .14, speed: .6, length: 2.2 },
        foam: { ...WATER_LOOK.foam, rim: 1.1, contact: .15, wobble: .2, wobbleScale: 14, lines: 6, width: .3, spacing: 2.2, speed: .5, pieces: .15, amount: 1 },
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
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16), shape: new Float32Array(32 * 12), inverse: new Float32Array(16) };
    private depth?: { fbo: WebGLFramebuffer; texture: WebGLTexture; w: number; h: number; format: number; ok: boolean };
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
     * `surface` metres there. `contacts`: x z radius per thing standing in the water (up to 32) for a thin foam ring; `shore`: a smooth shore map (`createShoreMap`) the wave lines follow (missing: the shore distance attribute).
     * After `capture()` the water reads the scene depth: exact see-through edge and rim foam wherever it meets anything. `outlines`: 12 radius scales per
     * contact (round from +x toward +z) so the ring follows its real outline (missing: round). False while linking.
     */
    use(view: View, light: Light, time: number, { fresh = false, under = false, surface = 0, contacts = [] as ArrayLike<number>, outlines = [] as ArrayLike<number>, shore = undefined as ShoreMap | undefined } = {}): boolean {
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
        gl.uniform1f(u("glintDensity"), g.density);
        gl.uniform1f(u("glintMelt"), g.melt);
        gl.uniform1f(u("glintGlow"), g.glow);
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
        if (count)
        {
            gl.uniform3fv(u("contacts[0]"), Float32Array.from(Array.prototype.slice.call(contacts, 0, count * 3)));
            const shape = this.f32.shape;
            for (let k = 0; k < count * 12; k++) shape[k] = k < outlines.length ? outlines[k] : 1;
            gl.uniform4fv(u("contactShape[0]"), shape.subarray(0, count * 12));
        }
        gl.uniform1f(u("streakAmount"), o.streaks.amount);
        gl.uniform1f(u("streakLength"), o.streaks.length);
        gl.uniform1f(u("streakWidth"), o.streaks.width);
        gl.uniform1f(u("paintAmount"), o.paint.amount);
        gl.uniform1f(u("paintScale"), o.paint.scale);
        gl.uniform1f(u("horizon"), o.horizon);
        gl.uniform1i(u("under"), under ? 1 : 0);
        bindUnder(gl, u, o.under, surface);
        // the scene depth (unit 7) and the shore map (unit 6)
        const depth = this.depth?.ok && this.depth.w === gl.drawingBufferWidth && this.depth.h === gl.drawingBufferHeight ? this.depth : undefined;
        gl.uniform1i(u("hasDepth"), depth ? 1 : 0);
        gl.uniform1i(u("hasShore"), shore ? 1 : 0);
        gl.uniform1i(u("sceneDepth"), 7);
        gl.uniform1i(u("shoreMap"), 6);
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, depth?.texture ?? null);
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, shore?.texture ?? null);
        gl.activeTexture(gl.TEXTURE0);
        if (depth) gl.uniformMatrix4fv(u("invViewProj"), false, invert4(mul4(this.f32.projection, this.f32.view, this.f32.inverse)));
        if (shore) gl.uniform4f(u("shoreRect"), shore.x, shore.z, shore.cell, shore.n);
        return true;
    }

    /**
     * Copy the depth of everything drawn so far (the bound framebuffer). Call once a frame after the opaque scene, before the
     * water: the water then knows the ground under every pixel. Stops (quietly) if the depth can't be copied here.
     */
    capture() {
        const gl = this.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        if (this.depth && !this.depth.ok && this.depth.format < 0) return;
        const source = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const fresh = !this.depth || this.depth.w !== w || this.depth.h !== h;
        if (fresh)
        {
            // try the formats until a blit works (it needs the same depth format as the source)
            const formats = DEPTH_FORMATS(gl);
            this.freeDepth();
            for (let f = 0; f < formats.length; f++)
            {
                const [internal, format, type, attachment] = formats[f];
                const texture = gl.createTexture()!, fbo = gl.createFramebuffer()!;
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.bindTexture(gl.TEXTURE_2D, null);
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, texture, 0);
                while (gl.getError() !== gl.NO_ERROR);
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo);
                gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
                const ok = gl.getError() === gl.NO_ERROR;
                gl.bindFramebuffer(gl.FRAMEBUFFER, source);
                if (ok) { this.depth = { fbo, texture, w, h, format: f, ok }; return; }
                gl.deleteFramebuffer(fbo);
                gl.deleteTexture(texture);
            }
            this.depth = { fbo: null!, texture: null!, w, h, format: -1, ok: false };
            console.warn("@polywar/water: can't copy the scene depth here, the water edge uses the vertex data");
            return;
        }
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.depth!.fbo);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, source);
    }

    destroy() {
        this.freeDepth();
        if (this.program) this.layer.deleteProgram(this.program.name);
    }

    private freeDepth() {
        if (this.depth?.ok) { this.gl.deleteFramebuffer(this.depth.fbo); this.gl.deleteTexture(this.depth.texture); }
        this.depth = undefined;
    }

    private async link(): Promise<Program> {
        const gl = this.gl, name = `water-${this.id}`, program = await this.layer.createProgram(name, WATER_VERTEX, WATER_FRAGMENT);
        const cache = new Map<string, WebGLUniformLocation | null>();
        return { name, program, u: n => cache.has(n) ? cache.get(n)! : (cache.set(n, gl.getUniformLocation(program, n)), cache.get(n)!) };
    }
}
