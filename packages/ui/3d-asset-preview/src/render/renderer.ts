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

/** `maps`: albedo / normal / spec / ao textures (see @polywar/textured), none = vertex colour only */
export type DrawOptions = { joints?: Float32Array; tint?: [number, number, number, number]; unlit?: boolean; maps?: Maps };

type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> };

const NAMES = ["model", "view", "projection", "jointMatrices", "sunDirection", "sunColor", "sunStrength", "sky", "ground", "ambient",
    "lampPosition", "lampColor", "lampStrength", "lampRange", "fogColor", "fogDensity", "toon", "eye", "tint", "unlit", "mirrored", ...TEXTURED_UNIFORMS];

let renderers = 0;

/** Draws `@papit/game-mesh` GPU meshes, plain or skinned, with one light. Programs come from the layer (async, see `ready`). */
export class Renderer {
    light: Light = structuredClone(DAYLIGHT);
    readonly gl: WebGL2RenderingContext;
    /** resolves once the shader programs are linked; draws before that are skipped */
    readonly ready: Promise<void>;
    private programs?: { mesh: Program; skin: Program };
    private current?: Program;
    private view?: View;
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16), model: new Float32Array(16) };

    constructor(readonly layer: Layer3D) {
        this.gl = layer.gl;
        const id = `pw-renderer-${renderers++}`;
        this.ready = Promise.all([this.compile(id + "-mesh", SHADERS.mesh), this.compile(id + "-skin", SHADERS.skin)])
            .then(([mesh, skin]) => { this.programs = { mesh, skin }; });
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
