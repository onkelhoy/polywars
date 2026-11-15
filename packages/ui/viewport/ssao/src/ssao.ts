import type { Layer3D } from "@papit/game-engine";
import { SHADERS } from "./shaders";

/**
 * `radius` metres the occlusion looks round each point, `strength` 0..1 how dark it gets, `power` contrast,
 * `bias` metres a sample must be behind the surface (stops self shadowing), `samples` 1..16,
 * `scale` AO resolution part of the frame, `fade` start / end metres where it goes away (far terrain stays clean),
 * `debug` shows the AO alone.
 */
export type SSAOOptions = {
    radius: number;
    strength: number;
    power: number;
    bias: number;
    samples: number;
    scale: number;
    fade: [number, number];
    debug: boolean;
};

export const SSAO_DEFAULTS: SSAOOptions = { radius: .5, strength: 1, power: 1.5, bias: .02, samples: 12, scale: .5, fade: [60, 120], debug: false };

/** What the pass needs from a camera; `@papit/game-engine`'s `Camera` fits. */
export type Projected = { projectionMatrix: ArrayLike<number> };

type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> };
type Target = { width: number; height: number; samples: number; msaa: WebGLFramebuffer; color: WebGLRenderbuffer; depthBuffer: WebGLRenderbuffer;
    resolved: WebGLFramebuffer; scene: WebGLTexture; depth: WebGLTexture; aoBuffer: WebGLFramebuffer; ao: WebGLTexture; aoWidth: number; aoHeight: number };

const NAMES = ["depth", "scene", "ao", "projection", "inverseProjection", "kernel", "samples", "radius", "bias", "power", "texel", "fade", "aoTexel", "strength", "debug"];

let passes = 0;

/**
 * Screen space ambient occlusion around any WebGL2 drawing: `begin()` sends the frame to an offscreen target
 * (multisampled like the canvas), `end(camera)` works out the AO from depth alone and draws the frame darkened
 * into the canvas, depth included, so later draws still depth test. Programs come from the layer (async, `ready`);
 * until then `begin` / `end` draw straight to the canvas.
 */
export class SSAO {
    options: SSAOOptions;
    readonly gl: WebGL2RenderingContext;
    readonly ready: Promise<void>;
    private programs?: { ao: Program; composite: Program };
    private target?: Target;
    private vao: WebGLVertexArrayObject;
    private kernel = makeKernel(16);
    private f32 = { projection: new Float32Array(16), inverse: new Float32Array(16) };
    private active = false;

    constructor(readonly layer: Layer3D, options: Partial<SSAOOptions> = {}) {
        this.gl = layer.gl;
        this.options = { ...SSAO_DEFAULTS, ...options };
        this.vao = this.gl.createVertexArray()!;
        const id = `pw-ssao-${passes++}`;
        this.ready = Promise.all([this.compile(id + "-ao", SHADERS.ao), this.compile(id + "-composite", SHADERS.composite)])
            .then(([ao, composite]) => { this.programs = { ao, composite }; });
    }

    /** Draw into the offscreen frame from here on (sized to the canvas). Clear it yourself (the renderer's `begin` does). */
    begin() {
        this.active = !!this.programs;
        if (!this.active) return;
        const gl = this.gl, t = this.resize(gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.msaa);
        gl.viewport(0, 0, t.width, t.height);
    }

    /** AO from the frame's depth, the frame times it into the canvas. `camera`: the one the frame was drawn with. */
    end(camera: Projected) {
        if (!this.active || !this.programs || !this.target) return;
        this.active = false;
        const gl = this.gl, t = this.target, o = this.options, { ao, composite } = this.programs;
        // resolve the samples: colour and depth into textures
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msaa);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.resolved);
        gl.blitFramebuffer(0, 0, t.width, t.height, 0, 0, t.width, t.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.blitFramebuffer(0, 0, t.width, t.height, 0, 0, t.width, t.height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);

        const blend = gl.isEnabled(gl.BLEND), test = gl.isEnabled(gl.DEPTH_TEST), func = gl.getParameter(gl.DEPTH_FUNC), mask = gl.getParameter(gl.DEPTH_WRITEMASK);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(this.vao);
        this.f32.projection.set(camera.projectionMatrix);
        invert(this.f32.inverse, this.f32.projection);

        // the AO, half res
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.aoBuffer);
        gl.viewport(0, 0, t.aoWidth, t.aoHeight);
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(ao.program);
        this.bind(0, t.depth, ao.uniforms.depth);
        gl.uniformMatrix4fv(ao.uniforms.projection, false, this.f32.projection);
        gl.uniformMatrix4fv(ao.uniforms.inverseProjection, false, this.f32.inverse);
        gl.uniform3fv(ao.uniforms.kernel, this.kernel);
        gl.uniform1i(ao.uniforms.samples, Math.max(1, Math.min(16, Math.round(o.samples))));
        gl.uniform1f(ao.uniforms.radius, o.radius);
        gl.uniform1f(ao.uniforms.bias, o.bias);
        gl.uniform1f(ao.uniforms.power, o.power);
        gl.uniform2f(ao.uniforms.texel, 1 / t.width, 1 / t.height);
        gl.uniform2fv(ao.uniforms.fade, o.fade);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // blurred AO times the frame into the canvas, depth written back (test always passes)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, t.width, t.height);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.ALWAYS);
        gl.depthMask(true);
        gl.useProgram(composite.program);
        this.bind(0, t.depth, composite.uniforms.depth);
        this.bind(1, t.scene, composite.uniforms.scene);
        this.bind(2, t.ao, composite.uniforms.ao);
        gl.uniformMatrix4fv(composite.uniforms.inverseProjection, false, this.f32.inverse);
        gl.uniform2f(composite.uniforms.aoTexel, 1 / t.aoWidth, 1 / t.aoHeight);
        gl.uniform1f(composite.uniforms.strength, o.strength);
        gl.uniform1i(composite.uniforms.debug, o.debug ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // leave the state as found
        for (const unit of [2, 1, 0]) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, null); }
        gl.bindVertexArray(null);
        gl.useProgram(null);
        gl.depthFunc(func);
        gl.depthMask(mask);
        if (!test) gl.disable(gl.DEPTH_TEST);
        if (blend) gl.enable(gl.BLEND);
    }

    destroy() {
        this.free();
        this.gl.deleteVertexArray(this.vao);
        if (this.programs) for (const p of Object.values(this.programs)) this.gl.deleteProgram(p.program);
        this.programs = undefined;
    }

    private bind(unit: number, texture: WebGLTexture, at: WebGLUniformLocation | null) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(at, unit);
    }

    /** the targets for this size (made again when the canvas or `scale` changes) */
    private resize(width: number, height: number): Target {
        const gl = this.gl, s = Math.max(.1, Math.min(1, this.options.scale));
        const aoWidth = Math.max(1, Math.round(width * s)), aoHeight = Math.max(1, Math.round(height * s));
        const t = this.target;
        if (t && t.width === width && t.height === height && t.aoWidth === aoWidth && t.aoHeight === aoHeight) return t;
        this.free();
        const attributes = gl.getContextAttributes();
        const samples = attributes?.antialias ? Math.min(4, gl.getParameter(gl.MAX_SAMPLES)) : 0;
        const storage = (format: number) => {
            const r = gl.createRenderbuffer()!;
            gl.bindRenderbuffer(gl.RENDERBUFFER, r);
            gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, width, height);
            return r;
        };
        const texture = (w: number, h: number, format: number, base: number, type: number, filter: number) => {
            const x = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, x);
            gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, base, type, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return x;
        };
        const color = storage(gl.RGBA8), depthBuffer = storage(gl.DEPTH_COMPONENT24);
        const msaa = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

        const scene = texture(width, height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
        const depth = texture(width, height, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
        const resolved = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, resolved);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scene, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);

        const ao = texture(aoWidth, aoHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
        const aoBuffer = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, aoBuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ao, 0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return this.target = { width, height, samples, msaa, color, depthBuffer, resolved, scene, depth, aoBuffer, ao, aoWidth, aoHeight };
    }

    private free() {
        const gl = this.gl, t = this.target;
        if (!t) return;
        for (const f of [t.msaa, t.resolved, t.aoBuffer]) gl.deleteFramebuffer(f);
        for (const r of [t.color, t.depthBuffer]) gl.deleteRenderbuffer(r);
        for (const x of [t.scene, t.depth, t.ao]) gl.deleteTexture(x);
        this.target = undefined;
    }

    private async compile(name: string, source: { vertex: string; fragment: string }): Promise<Program> {
        const program = await this.layer.createProgram(name, source.vertex, source.fragment);
        const uniforms: Program["uniforms"] = {};
        for (const n of NAMES) uniforms[n] = this.gl.getUniformLocation(program, n);
        return { program, uniforms };
    }
}

/** `n` points in the +z hemisphere, more of them near the centre (fixed seed: same look every run) */
function makeKernel(n: number) {
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++)
    {
        let x, y, z, l;
        do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd(); l = Math.hypot(x, y, z); } while (l > 1 || l < .1);
        const k = i / n, s = (.1 + .9 * k * k) / l;
        out.set([x * s, y * s, z * s], i * 3);
    }
    return out;
}

/** 4x4 inverse (column major in, column major out) */
function invert(out: Float32Array, m: Float32Array) {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06, d = det ? 1 / det : 0;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return out;
}
