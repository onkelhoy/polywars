import type { Layer3D } from "@papit/game-engine";
import type { GPUMesh } from "@papit/game-mesh";
import { TEXTURED_UNIFORMS, bindMaps, type Maps } from "@polywar/textured";
import { SHADERS } from "./shaders";

export type Vec3 = [number, number, number];

/**
 * Sun + hemisphere ambient + one point lamp, with fog. Colours are linear.
 * `toon` > 0 quantises sun and lamp into that many bands. A lamp strength of 0 turns it off.
 */
export type Light = {
    sunDirection: Vec3;
    sunColor: Vec3;
    sunStrength: number;
    sky: Vec3;
    ground: Vec3;
    ambient: number;
    lampPosition: Vec3;
    lampColor: Vec3;
    lampStrength: number;
    /** metres until the lamp reaches 0 */
    lampRange: number;
    fogColor: Vec3;
    fogDensity: number;
    toon: number;
};

export const DAYLIGHT: Light = {
    sunDirection: [.5, .8, .35],
    sunColor: [1, .95, .85],
    sunStrength: 1,
    sky: [.6, .66, .75],
    ground: [.32, .3, .26],
    ambient: .6,
    lampPosition: [0, 1, 1],
    lampColor: [1, .8, .55],
    lampStrength: 0,
    lampRange: 3,
    fogColor: [.7, .78, .85],
    fogDensity: 0,
    toon: 0,
};

/** What the renderer needs from a camera; `@papit/game-engine`'s `Camera` fits. */
export type View = {
    viewMatrix: ArrayLike<number>;
    projectionMatrix: ArrayLike<number>;
    worldPosition?: { x: number; y: number; z: number };
};

/**
 * Anything that draws itself with its own shader, e.g. a material sample (`GrassPatch`).
 * `size`: bounds x y z, base at y 0, centred on x / z.
 */
export type Drawable = { size: Vec3 | [number, number, number]; draw(view: View, light: Light, time: number): void; destroy?(): void };
/** makes a `Drawable` for a layer (each WebGL context needs its own) */
export type Scene = (layer: Layer3D) => Drawable;

/** `maps`: albedo / normal / spec / ao textures (see @polywar/textured), none = vertex colour only */
export type DrawOptions = { joints?: Float32Array; tint?: [number, number, number, number]; unlit?: boolean; maps?: Maps };

/**
 * Instances for `drawInstanced`: `STRIDE` floats each (x y z scale yaw tint sway, one free) in `buffer`, from instance `first`.
 * `wind`: x z direction + strength, `swayHeight`: model height that sways fully, `fade`: start / end metres (instances shrink away), `time` seconds.
 * `billboard`: each instance turns the mesh's +z to the camera (yaw ignored), for flat far cards.
 */
export type Instances = { buffer: WebGLBuffer; first: number; count: number; time?: number; wind?: Vec3; swayHeight?: number; fade?: [number, number]; surface?: Partial<Surface>; billboard?: boolean };
/**
 * Instanced prop surface: `bands` toon bands with `soft` edges 0..1 (0 = light's own `toon` / smooth),
 * `grit` brightness noise in world space 0..1 (a few % is plenty), `gloss` sun highlight 0..1.
 * Given a surface, the default view highlight is off (matte unless `gloss`).
 */
export type Surface = { bands: number; soft: number; grit: number; gloss: number };
export const INSTANCE_STRIDE = 8;

/**
 * Far cards for `drawCards`: `CARD_STRIDE` floats each in `buffer` (see the cards shader):
 * `x y z scale`, `yaw tint sway far`, `halfWidth bottom top topWidth` (1 quad, 0 triangle), `r g b swayHeight`.
 * `fadePart`: last part of each card's `far` where it shrinks away.
 */
export type Cards = { buffer: WebGLBuffer; first?: number; count: number; time?: number; wind?: Vec3; fadePart?: number; surface?: Partial<Surface> };
export const CARD_STRIDE = 16;

type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> };

const NAMES = ["model", "view", "projection", "jointMatrices", "sunDirection", "sunColor", "sunStrength", "sky", "ground", "ambient",
    "lampPosition", "lampColor", "lampStrength", "lampRange", "fogColor", "fogDensity", "toon", "eye", "tint", "unlit", "mirrored", "wind", "fade", "time", "swayHeight", "bands", "soft", "grit", "gloss", "surfaced", "billboard", "fadePart", ...TEXTURED_UNIFORMS];

let renderers = 0;

/** Draws `@papit/game-mesh` GPU meshes, plain or skinned, with one light. Programs come from the layer (async, see `ready`). */
export class Renderer {
    light: Light = structuredClone(DAYLIGHT);
    readonly gl: WebGL2RenderingContext;
    /** resolves once the shader programs are linked; draws before that are skipped */
    readonly ready: Promise<void>;
    private programs?: { mesh: Program; skin: Program; instanced: Program; cards: Program };
    /** unit quad for `drawCards` (made on first use) */
    private quad?: { vao: WebGLVertexArrayObject; index: WebGLBuffer; vertex: WebGLBuffer };
    private current?: Program;
    private view?: View;
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16), model: new Float32Array(16) };

    constructor(readonly layer: Layer3D) {
        this.gl = layer.gl;
        const id = `pw-renderer-${renderers++}`;
        this.ready = Promise.all([this.compile(id + "-mesh", SHADERS.mesh), this.compile(id + "-skin", SHADERS.skin), this.compile(id + "-instanced", SHADERS.instanced), this.compile(id + "-cards", SHADERS.cards)])
            .then(([mesh, skin, instanced, cards]) => { this.programs = { mesh, skin, instanced, cards }; });
    }

    /** Clear (optional colour) and set the camera for the next draws. */
    /** Camera matrices may be float64 (game-engine); they are copied to float32 here. */
    begin(view: View, clear: [number, number, number, number] | null = [0, 0, 0, 0]) {
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
        if (clear)
        {
            gl.clearColor(...clear);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
        this.view = view;
        this.current = undefined;
    }

    draw(mesh: GPUMesh, model: ArrayLike<number>, options: DrawOptions = {}, mode?: number) {
        if (!this.programs) return;
        const p = this.use(options.joints ? this.programs.skin : this.programs.mesh);
        const gl = this.gl;
        this.f32.model.set(model);
        gl.uniformMatrix4fv(p.uniforms.model, false, this.f32.model);
        if (options.joints) gl.uniformMatrix4fv(p.uniforms.jointMatrices, false, options.joints);
        gl.uniform4fv(p.uniforms.tint, options.tint ?? [1, 1, 1, 1]);
        gl.uniform1i(p.uniforms.unlit, options.unlit ? 1 : 0);
        // a mirroring matrix (negative determinant) flips the triangle winding: front faces then read as back faces
        const m = this.f32.model, det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
        gl.uniform1i(p.uniforms.mirrored, det < 0 ? 1 : 0);
        bindMaps(gl, p.uniforms, options.maps);
        if (mode === undefined) return mesh.draw();
        gl.bindVertexArray(mesh.vao);
        gl.drawArrays(mode, 0, mesh.count);
        gl.bindVertexArray(null);
    }

    /** Many copies of one static mesh: `model` is the part's model space matrix, the instances place, turn (y) and scale it. */
    drawInstanced(mesh: GPUMesh, model: ArrayLike<number>, instances: Instances, options: Omit<DrawOptions, "joints"> = {}) {
        if (!this.programs || instances.count <= 0) return;
        const p = this.use(this.programs.instanced), gl = this.gl, i = instances;
        this.f32.model.set(model);
        gl.uniformMatrix4fv(p.uniforms.model, false, this.f32.model);
        gl.uniform4fv(p.uniforms.tint, options.tint ?? [1, 1, 1, 1]);
        gl.uniform1i(p.uniforms.unlit, options.unlit ? 1 : 0);
        gl.uniform1i(p.uniforms.mirrored, 0);
        gl.uniform3fv(p.uniforms.wind, i.wind ?? [1, 0, 0]);
        gl.uniform2fv(p.uniforms.fade, i.fade ?? [0, 0]);
        gl.uniform1f(p.uniforms.time, i.time ?? 0);
        gl.uniform1f(p.uniforms.swayHeight, i.swayHeight ?? 1);
        const f = i.surface ?? {};
        gl.uniform1f(p.uniforms.bands, f.bands ?? 0);
        gl.uniform1f(p.uniforms.soft, f.soft ?? 0);
        gl.uniform1f(p.uniforms.grit, f.grit ?? 0);
        gl.uniform1f(p.uniforms.gloss, f.gloss ?? 0);
        gl.uniform1i(p.uniforms.surfaced, i.surface ? 1 : 0);
        gl.uniform1i(p.uniforms.billboard, i.billboard ? 1 : 0);
        bindMaps(gl, p.uniforms, options.maps);
        gl.bindVertexArray(mesh.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, i.buffer);
        const bytes = INSTANCE_STRIDE * 4, at = i.first * bytes;
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 4, gl.FLOAT, false, bytes, at);
        gl.vertexAttribDivisor(6, 1);
        gl.enableVertexAttribArray(7);
        gl.vertexAttribPointer(7, 4, gl.FLOAT, false, bytes, at + 16);
        gl.vertexAttribDivisor(7, 1);
        if (mesh.indexType === null) gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.count, i.count);
        else gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, mesh.indexType, 0, i.count);
        // leave the mesh's VAO as upload made it
        gl.disableVertexAttribArray(6);
        gl.disableVertexAttribArray(7);
        gl.bindVertexArray(null);
    }

    /** Far cards of any number of models in one call (all camera facing, shaped and coloured per instance). */
    drawCards(cards: Cards) {
        if (!this.programs || cards.count <= 0) return;
        const p = this.use(this.programs.cards), gl = this.gl, c = cards;
        gl.uniform4fv(p.uniforms.tint, [1, 1, 1, 1]);
        gl.uniform1i(p.uniforms.unlit, 0);
        gl.uniform1i(p.uniforms.mirrored, 0);
        gl.uniform3fv(p.uniforms.wind, c.wind ?? [1, 0, 0]);
        gl.uniform1f(p.uniforms.fadePart, c.fadePart ?? 0);
        gl.uniform1f(p.uniforms.time, c.time ?? 0);
        const f = c.surface ?? {};
        gl.uniform1f(p.uniforms.bands, f.bands ?? 0);
        gl.uniform1f(p.uniforms.soft, f.soft ?? 0);
        gl.uniform1f(p.uniforms.grit, f.grit ?? 0);
        gl.uniform1f(p.uniforms.gloss, f.gloss ?? 0);
        gl.uniform1i(p.uniforms.surfaced, c.surface ? 1 : 0);
        bindMaps(gl, p.uniforms, undefined);
        const q = this.quad ??= this.makeQuad();
        gl.bindVertexArray(q.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, c.buffer);
        const bytes = CARD_STRIDE * 4, at = (c.first ?? 0) * bytes;
        for (let k = 0; k < 4; k++)
        {
            gl.enableVertexAttribArray(6 + k);
            gl.vertexAttribPointer(6 + k, 4, gl.FLOAT, false, bytes, at + k * 16);
            gl.vertexAttribDivisor(6 + k, 1);
        }
        gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, c.count);
        gl.bindVertexArray(null);
    }

    destroy() {
        if (!this.quad) return;
        const gl = this.gl;
        gl.deleteVertexArray(this.quad.vao);
        gl.deleteBuffer(this.quad.vertex);
        gl.deleteBuffer(this.quad.index);
        this.quad = undefined;
    }

    private makeQuad() {
        const gl = this.gl, vao = gl.createVertexArray()!, vertex = gl.createBuffer()!, index = gl.createBuffer()!;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertex);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        return { vao, vertex, index };
    }

    private use(p: Program) {
        if (this.current === p) return p;
        const gl = this.gl, l = this.light, v = this.view!;
        gl.useProgram(p.program);
        this.f32.view.set(v.viewMatrix);
        this.f32.projection.set(v.projectionMatrix);
        gl.uniformMatrix4fv(p.uniforms.view, false, this.f32.view);
        gl.uniformMatrix4fv(p.uniforms.projection, false, this.f32.projection);
        gl.uniform3fv(p.uniforms.sunDirection, l.sunDirection);
        gl.uniform3fv(p.uniforms.sunColor, l.sunColor);
        gl.uniform3fv(p.uniforms.sky, l.sky);
        gl.uniform3fv(p.uniforms.ground, l.ground);
        gl.uniform3fv(p.uniforms.fogColor, l.fogColor);
        gl.uniform1f(p.uniforms.fogDensity, l.fogDensity);
        gl.uniform1f(p.uniforms.toon, l.toon);
        gl.uniform1f(p.uniforms.sunStrength, l.sunStrength);
        gl.uniform1f(p.uniforms.ambient, l.ambient);
        gl.uniform3fv(p.uniforms.lampPosition, l.lampPosition);
        gl.uniform3fv(p.uniforms.lampColor, l.lampColor);
        gl.uniform1f(p.uniforms.lampStrength, l.lampStrength);
        gl.uniform1f(p.uniforms.lampRange, l.lampRange);
        const e = v.worldPosition ?? { x: 0, y: 0, z: 0 };
        gl.uniform3f(p.uniforms.eye, e.x, e.y, e.z);
        this.current = p;
        return p;
    }

    private async compile(name: string, source: { vertex: string; fragment: string }): Promise<Program> {
        const program = await this.layer.createProgram(name, source.vertex, source.fragment);
        const uniforms: Program["uniforms"] = {};
        for (const n of NAMES) uniforms[n] = this.gl.getUniformLocation(program, n);
        return { program, uniforms };
    }
}
