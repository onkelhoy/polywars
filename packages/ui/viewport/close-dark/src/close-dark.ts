import type { Layer3D } from "@papit/game-engine";

type V3 = ArrayLike<number>;
/** a segment cast: `t` 0..1 along it, null = clear (same shape as `@polywar/ballistics` Cast) */
export type CloseCast = (from: [number, number, number], to: [number, number, number]) => { t: number } | null;

export type CloseDarkSetting = {
    /** distances (m) where it starts to darken and where it is fully dark. Defaults .45 / .12 */
    start?: number;
    full?: number;
    /** the dark colour. Default near black, a little warm */
    colour?: [number, number, number];
    /** how gritty the dithered edge is, 0..1. Default .5 */
    grit?: number;
};

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
    vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
    vUv = p * .5 + .5;
    gl_Position = vec4(p, 0.0, 1.0);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float amount, grit, aspect, time;
uniform vec3 colour;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
    // dark grows out from the centre: a disc whose radius follows the amount, the rest of the view still lit
    vec2 p = (vUv - .5) * vec2(aspect, 1.0);
    float radius = amount * amount * 1.4 * max(aspect, 1.0), d = length(p);
    float edge = .25 + .25 * (1.0 - amount);
    float k = 1.0 - smoothstep(radius - edge, radius, d);
    k *= smoothstep(0.0, .15, amount);
    // dithered: per pixel noise (a slow crawl) decides lit or dark near the edge: a gritty fade, not a smooth one
    float n = hash(floor(gl_FragCoord.xy) + floor(time * 24.0));
    float g = mix(k, step(n, k), grit);
    float a = clamp(g * (.4 + .6 * amount), 0.0, 1.0);
    outColor = vec4(colour, a);
}`;

/**
 * Right up against something (face in a wall, lying with the cheek on the ground) the view goes dark from the
 * centre out, with a dithered grit edge, instead of the near plane cutting into the surface and showing
 * what is behind. `update(dt, eye, look, cast, floor)` probes a few short rays round the look plus the height
 * over the ground; `draw()` last thing in the frame (over everything, like `Daze`).
 */
export class CloseDark {
    private gl: WebGL2RenderingContext;
    private program?: WebGLProgram;
    private u: Record<string, WebGLUniformLocation | null> = {};
    private vao: WebGLVertexArrayObject;
    private s: Required<CloseDarkSetting>;
    private time = 0;
    /** 0..1 how dark now (eased) */
    amount = 0;
    /** m to the nearest surface probed last */
    distance = Infinity;

    constructor(layer: Layer3D, setting: CloseDarkSetting = {}) {
        this.s = { start: .45, full: .12, colour: [.025, .02, .018], grit: .5, ...setting };
        const gl = this.gl = layer.gl;
        this.vao = gl.createVertexArray()!;
        layer.createProgram(`pw-close-dark-${Math.random().toString(36).slice(2)}`, VERTEX, FRAGMENT).then(p => {
            this.program = p;
            for (const n of ["amount", "grit", "aspect", "time", "colour"]) this.u[n] = gl.getUniformLocation(p, n);
        });
    }

    /**
     * `eye` world, `look` unit view direction, `cast` the world's segment cast, `floor` the ground height at
     * x / z (optional: an eye under it is dark). Probes the look and 4 round it (~35°).
     */
    update(dt: number, eye: V3, look: V3, cast?: CloseCast, floor?: (x: number, z: number) => number) {
        this.time += dt;
        const reach = this.s.start + .1;
        let best = Infinity;
        // under the ground (a clipped eye): fully dark
        if (floor && eye[1] < floor(eye[0], eye[2])) best = 0;
        if (cast)
        {
            // a side and an up perpendicular to the look
            const lx = look[0], ly = look[1], lz = look[2];
            let sx = -lz, sz = lx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
            const ux = ly * sz, uy = lz * sx - lx * sz, uz = -ly * sx;
            const dirs: [number, number, number][] = [[lx, ly, lz]];
            for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
                dirs.push([lx + (sx * a + ux * b) * .7, ly + uy * b * .7, lz + (sz * a + uz * b) * .7]);
            for (const d of dirs)
            {
                const l = Math.hypot(d[0], d[1], d[2]) || 1;
                const to: [number, number, number] = [eye[0] + d[0] / l * reach, eye[1] + d[1] / l * reach, eye[2] + d[2] / l * reach];
                const hit = cast([eye[0], eye[1], eye[2]], to);
                if (hit) best = Math.min(best, hit.t * reach);
            }
        }
        this.distance = best;
        const want = Math.min(1, Math.max(0, (this.s.start - best) / (this.s.start - this.s.full)));
        // in fast (a face into a wall), out a bit slower
        this.amount += (want - this.amount) * Math.min(1, dt * (want > this.amount ? 14 : 6));
    }

    draw() {
        const gl = this.gl;
        if (!this.program || this.amount <= .01) return;
        const vp = gl.getParameter(gl.VIEWPORT) as Int32Array;
        gl.useProgram(this.program);
        gl.uniform1f(this.u.amount, this.amount);
        gl.uniform1f(this.u.grit, this.s.grit);
        gl.uniform1f(this.u.aspect, vp[2] / Math.max(1, vp[3]));
        gl.uniform1f(this.u.time, this.time);
        gl.uniform3fv(this.u.colour, this.s.colour);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
    }
}
