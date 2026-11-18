import type { Layer3D } from "@papit/game-engine";
import type { Lights } from "./lights";

/** what a glow pass needs from a camera (`@papit/game-engine`'s `Camera` fits) */
export type GlowView = { viewMatrix: ArrayLike<number>; projectionMatrix: ArrayLike<number> };

/** `size` metres of a glow at strength 1, `intensity` 0..1 how bright its middle gets */
export type GlowOptions = { size: number; intensity: number };

const VERTEX = `#version 300 es
layout(location = 0) in vec2 corner;
uniform mat4 view, projection;
uniform vec4 light;
uniform float size;
out vec2 vUv;
void main() {
    vUv = corner;
    vec4 c = view * vec4(light.xyz, 1.0);
    // a little toward the eye so the bulb's own mesh doesn't cut it
    c.xyz += normalize(-c.xyz) * size * .3;
    c.xy += corner * size;
    gl_Position = projection * c;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 color;
uniform float intensity;
out vec4 outColor;
void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    // bright core, soft halo
    float g = (exp(-r * r * 18.0) * .9 + pow(1.0 - r, 3.0) * .35) * intensity;
    outColor = vec4(color * g, 0.0);
}`;

let glows = 0;

/**
 * A soft additive glow on each light (camera facing, depth tested so walls hide it, no depth write): a cheap stand-in
 * for bloom on light bulbs. Draw after the scene.
 */
export class Glow {
    options: GlowOptions;
    private program?: WebGLProgram;
    private u: Record<string, WebGLUniformLocation | null> = {};
    private vao: WebGLVertexArrayObject;
    readonly ready: Promise<void>;

    constructor(readonly layer: Layer3D, options: Partial<GlowOptions> = {}) {
        this.options = { size: .45, intensity: .8, ...options };
        const gl = layer.gl;
        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this.ready = layer.createProgram(`pw-light-glow-${glows++}`, VERTEX, FRAGMENT).then(p => {
            this.program = p;
            for (const n of ["view", "projection", "light", "size", "color", "intensity"]) this.u[n] = gl.getUniformLocation(p, n);
        });
    }

    draw(view: GlowView, lights: Lights) {
        const gl = this.layer.gl, p = this.program;
        if (!p || !lights.list.length) return;
        gl.useProgram(p);
        gl.uniformMatrix4fv(this.u.view, false, Float32Array.from(view.viewMatrix));
        gl.uniformMatrix4fv(this.u.projection, false, Float32Array.from(view.projectionMatrix));
        gl.uniform1f(this.u.intensity, this.options.intensity);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.depthMask(false);
        gl.bindVertexArray(this.vao);
        for (const l of lights.list)
        {
            if (l.on === false || l.strength <= 0) continue;
            const s = Math.min(2, Math.sqrt(l.strength));
            gl.uniform4f(this.u.light, l.position[0], l.position[1], l.position[2], 0);
            gl.uniform1f(this.u.size, this.options.size * s);
            gl.uniform3f(this.u.color, l.color[0], l.color[1], l.color[2]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}
