import type { GPUMesh } from "@papit/game-mesh";
import { SHADERS } from "./shaders";

export type Vec3 = [number, number, number];

/** Sun + hemisphere light with fog. `toon` > 0 quantises the sun into that many bands. */
export type Light = {
    sunDirection: Vec3;
    sunColor: Vec3;
    sky: Vec3;
    ground: Vec3;
    fogColor: Vec3;
    fogDensity: number;
    toon: number;
};

export const DAYLIGHT: Light = {
    sunDirection: [.5, .8, .35],
    sunColor: [.7, .66, .58],
    sky: [.55, .6, .68],
    ground: [.3, .28, .24],
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

export type DrawOptions = { joints?: Float32Array; tint?: [number, number, number, number]; unlit?: boolean };

type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> };

const NAMES = ["model", "view", "projection", "jointMatrices", "sunDirection", "sunColor", "sky", "ground", "fogColor", "fogDensity", "toon", "eye", "tint", "unlit"];

/** Draws `@papit/game-mesh` GPU meshes, plain or skinned, with one light. */
export class Renderer {
    light: Light = structuredClone(DAYLIGHT);
    private programs: { mesh: Program; skin: Program };
    private current?: Program;
    private view?: View;
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16), model: new Float32Array(16) };

    constructor(readonly gl: WebGL2RenderingContext) {
        this.programs = { mesh: this.compile(SHADERS.mesh), skin: this.compile(SHADERS.skin) };
    }

    /** Clear (optional colour) and set the camera for the next draws. */
    /** Camera matrices may be float64 (game-engine); they are copied to float32 here. */
    begin(view: View, clear: [number, number, number, number] | null = [0, 0, 0, 0]) {
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        if (clear)
        {
            gl.clearColor(...clear);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
        this.view = view;
        this.current = undefined;
    }

    draw(mesh: GPUMesh, model: ArrayLike<number>, options: DrawOptions = {}, mode?: number) {
        const p = this.use(options.joints ? this.programs.skin : this.programs.mesh);
        const gl = this.gl;
        this.f32.model.set(model);
        gl.uniformMatrix4fv(p.uniforms.model, false, this.f32.model);
        if (options.joints) gl.uniformMatrix4fv(p.uniforms.jointMatrices, false, options.joints);
        gl.uniform4fv(p.uniforms.tint, options.tint ?? [1, 1, 1, 1]);
        gl.uniform1i(p.uniforms.unlit, options.unlit ? 1 : 0);
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
        const e = v.worldPosition ?? { x: 0, y: 0, z: 0 };
        gl.uniform3f(p.uniforms.eye, e.x, e.y, e.z);
        this.current = p;
        return p;
    }

    private compile(source: { vertex: string; fragment: string }): Program {
        const gl = this.gl;
        const shader = (type: number, text: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, text);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("render: " + gl.getShaderInfoLog(s));
            return s;
        };
        const program = gl.createProgram()!;
        gl.attachShader(program, shader(gl.VERTEX_SHADER, source.vertex));
        gl.attachShader(program, shader(gl.FRAGMENT_SHADER, source.fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("render: " + gl.getProgramInfoLog(program));
        const uniforms: Program["uniforms"] = {};
        for (const name of NAMES) uniforms[name] = gl.getUniformLocation(program, name);
        return { program, uniforms };
    }
}
