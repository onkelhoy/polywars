import type { Layer3D } from "@papit/game-engine";
import type { Colour, ImpactsSetting, SurfaceLook, Vec3, View } from "./types";

const dirt: SurfaceLook = { bits: 10, bitColour: [.22, .16, .1], bitSpeed: 4, bitLife: .7, puff: 4, puffColour: [.45, .38, .3], puffSize: .35, mark: .07, markColour: [.05, .04, .03], rimColour: [.2, .15, .1] };

/** default looks; `default` for unknown surfaces */
export const SURFACES: Record<string, SurfaceLook> = {
    default: dirt,
    ground: dirt,
    wood: { bits: 8, bitColour: [.55, .4, .22], bitSpeed: 3.5, bitLife: .8, puff: 2, puffColour: [.5, .42, .3], puffSize: .2, mark: .03, markColour: [.06, .04, .02], rimColour: [.7, .55, .35] },
    metal: { bits: 14, bitColour: [1, .7, .25], bitSpeed: 7, bitLife: .3, sparks: true, puff: 1, puffColour: [.5, .5, .5], puffSize: .12, mark: .025, markColour: [.12, .12, .12], rimColour: [.75, .75, .75] },
    stone: { bits: 9, bitColour: [.45, .44, .42], bitSpeed: 5, bitLife: .6, puff: 3, puffColour: [.6, .58, .55], puffSize: .3, mark: .035, markColour: [.18, .18, .18], rimColour: [.6, .6, .6] },
    flesh: { bits: 10, bitColour: [.4, .02, .02], bitSpeed: 2.5, bitLife: .5, puff: 3, puffColour: [.5, .05, .05], puffSize: .25, mark: .04, markColour: [.18, .01, .01], rimColour: [.3, .02, .02] },
    water: { bits: 14, bitColour: [.8, .85, .9], bitSpeed: 4, bitLife: .6, puff: 2, puffColour: [.85, .9, .95], puffSize: .3, mark: 0, markColour: [0, 0, 0], rimColour: [0, 0, 0] },
};

type Particle = { p: Vec3; v: Vec3; age: number; life: number; size: number; grow: number; colour: Colour; glow: boolean; drag: number; gravity: number };

const FLOATS = 7; // x y z r g b a (premultiplied)
const MARK_VERTICES = 18; // 6 triangles

const VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 2) in vec4 color;
uniform mat4 view, projection;
out vec4 vColor;
void main() { vColor = color; gl_Position = projection * view * vec4(position, 1.0); }`;
const FRAGMENT = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() { float a = vColor.a; outColor = vec4(pow(vColor.rgb / max(a, 1e-4), vec3(1.0 / 2.2)) * a, a); }`;

let count = 0;

/**
 * What bullets leave: tracer streaks, bits and dust off a hit (only near the camera), marks on the surface,
 * muzzle flashes. One unlit draw for all of it; call `draw(view)` after the scene each frame.
 */
export class Impacts {
    readonly surfaces: Record<string, SurfaceLook>;
    readonly far: number;
    private gl: WebGL2RenderingContext;
    private program?: WebGLProgram;
    private uniforms: Record<string, WebGLUniformLocation | null> = {};
    private particles: Particle[] = [];
    private maxParticles: number;
    private streaks: { head: Vec3; tail: Vec3; width: number; colour: Colour }[] = [];
    private dynamic: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; data: Float32Array };
    private marks: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; count: number; next: number; max: number };
    private eye: Vec3 = [0, 0, 0];

    constructor(layer: Layer3D, setting: ImpactsSetting = {}) {
        this.gl = layer.gl;
        this.far = setting.far ?? 150;
        this.maxParticles = setting.particles ?? 3000;
        this.surfaces = { ...SURFACES, ...setting.surfaces };
        layer.createProgram(`pw-impacts-${count++}`, VERTEX, FRAGMENT).then(program => {
            this.program = program;
            for (const n of ["view", "projection"]) this.uniforms[n] = this.gl.getUniformLocation(program, n);
        });
        this.dynamic = { ...this.vao(1024 * 6 * FLOATS), data: new Float32Array(1024 * 6 * FLOATS) };
        const max = setting.marks ?? 600;
        this.marks = { ...this.vao(max * MARK_VERTICES * FLOATS), count: 0, next: 0, max };
    }

    private vao(floats: number) {
        const gl = this.gl, vao = gl.createVertexArray()!, buffer = gl.createBuffer()!;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, FLOATS * 4, 0);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, FLOATS * 4, 12);
        gl.bindVertexArray(null);
        return { vao, buffer };
    }

    /** a bullet hit: bits + dust (when near the camera) and a mark; `direction` the bullet's way (for the spray) */
    hit(point: Vec3, normal: Vec3, surface = "default", direction?: Vec3) {
        const look = this.surfaces[surface] ?? this.surfaces.default;
        const d = Math.hypot(point[0] - this.eye[0], point[1] - this.eye[1], point[2] - this.eye[2]);
        if (look.mark > 0) this.mark(point, normal, look.mark * (.8 + Math.random() * .4), look.markColour, look.rimColour);
        if (d > this.far) return;
        // fewer bits further off: nobody sees them
        const near = Math.max(.25, 1 - d / this.far);
        // bounce off the normal, a little along the bullet's reflection
        let n = normal;
        if (direction)
        {
            const k = 2 * (direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2]);
            const r: Vec3 = [direction[0] - k * normal[0], direction[1] - k * normal[1], direction[2] - k * normal[2]];
            n = normalise([normal[0] + r[0] * .5, normal[1] + r[1] * .5, normal[2] + r[2] * .5]);
        }
        for (let i = 0, c = Math.round(look.bits * near); i < c; i++)
        {
            const v = cone(n, .9, look.bitSpeed * (.4 + Math.random() * .8));
            this.add({ p: [...point], v, age: 0, life: look.bitLife * (.5 + Math.random()), size: look.sparks ? .012 : .02 + Math.random() * .02, grow: 0, colour: look.bitColour, glow: !!look.sparks, drag: look.sparks ? .5 : 1, gravity: look.sparks ? 6 : 9.81 });
        }
        for (let i = 0, c = Math.round(look.puff * near); i < c; i++)
        {
            const v = cone(normal, .6, .4 + Math.random() * .8);
            this.add({ p: [point[0] + normal[0] * .05, point[1] + normal[1] * .05, point[2] + normal[2] * .05], v, age: 0, life: .8 + Math.random() * .8, size: look.puffSize * .4, grow: look.puffSize * 1.5, colour: look.puffColour, glow: false, drag: 3, gravity: -.3 });
        }
    }

    /** a muzzle flash at `at` firing along `direction` (unit), `size` m */
    flash(at: Vec3, direction: Vec3, size = .12) {
        for (let i = 0; i < 4; i++)
        {
            const s = size * (1 - i * .2);
            this.add({ p: [at[0] + direction[0] * s * i * .8, at[1] + direction[1] * s * i * .8, at[2] + direction[2] * s * i * .8], v: [0, 0, 0], age: 0, life: .045, size: s, grow: 0, colour: [1, .75, .35], glow: true, drag: 0, gravity: 0 });
        }
        for (let i = 0; i < 2; i++)
            this.add({ p: [...at], v: cone(direction, .5, 1 + Math.random()), age: 0, life: .6 + Math.random() * .4, size: .05, grow: .4, colour: [.6, .6, .6], glow: false, drag: 4, gravity: -.4 });
    }

    /**
     * Tracer streaks this frame: one per bullet, from its head back along its velocity.
     * Call each frame before `draw` with the bullets that show one.
     */
    tracers(bullets: Iterable<{ position: Vec3; velocity: Vec3; age: number }>, colour: Colour = [1, .8, .45]) {
        this.streaks.length = 0;
        for (const b of bullets)
        {
            const v = b.velocity, speed = Math.hypot(v[0], v[1], v[2]);
            if (speed < 1 || b.age < .02) continue; // out of the muzzle first, not from the eye
            const length = Math.min(speed * .035, 30, b.age * speed);
            const tail: Vec3 = [b.position[0] - v[0] / speed * length, b.position[1] - v[1] / speed * length, b.position[2] - v[2] / speed * length];
            const d = Math.hypot(b.position[0] - this.eye[0], b.position[1] - this.eye[1], b.position[2] - this.eye[2]);
            this.streaks.push({ head: [...b.position], tail, width: Math.max(.015, d * .0018), colour });
        }
    }

    /** drop every particle and mark */
    clear() {
        this.particles.length = 0;
        this.marks.count = this.marks.next = 0;
    }

    update(dt: number) {
        const list = this.particles;
        for (let i = list.length - 1; i >= 0; i--)
        {
            const q = list[i];
            q.age += dt;
            if (q.age >= q.life) { list[i] = list[list.length - 1]; list.pop(); continue; }
            const damp = Math.exp(-q.drag * dt);
            q.v[0] *= damp; q.v[1] = q.v[1] * damp - q.gravity * dt; q.v[2] *= damp;
            q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
            q.size += q.grow * dt;
        }
    }

    draw(view: View) {
        const gl = this.gl;
        if (!this.program) return;
        const e = view.worldPosition;
        if (e) { this.eye[0] = e.x; this.eye[1] = e.y; this.eye[2] = e.z; }
        const v = view.viewMatrix;
        const right: Vec3 = [v[0], v[4], v[8]], up: Vec3 = [v[1], v[5], v[9]];

        // fill: streaks then particles, camera facing quads
        let data = this.dynamic.data, at = 0;
        const need = (this.streaks.length + this.particles.length) * 24 * FLOATS;
        if (need > data.length)
        {
            data = this.dynamic.data = new Float32Array(need * 2);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic.buffer);
            gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
        }
        const vertex = (p: Vec3, c: Colour, a: number) => {
            data[at++] = p[0]; data[at++] = p[1]; data[at++] = p[2];
            data[at++] = c[0] * a; data[at++] = c[1] * a; data[at++] = c[2] * a; data[at++] = a;
        };
        const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, ca: Colour, aa: number, cb: Colour, ab: number) => {
            vertex(a, ca, aa); vertex(b, ca, aa); vertex(c, cb, ab);
            vertex(a, ca, aa); vertex(c, cb, ab); vertex(d, cb, ab);
        };
        for (const s of this.streaks)
        {
            // width across the streak, facing the eye
            const d: Vec3 = [s.head[0] - s.tail[0], s.head[1] - s.tail[1], s.head[2] - s.tail[2]];
            const toEye: Vec3 = [this.eye[0] - s.head[0], this.eye[1] - s.head[1], this.eye[2] - s.head[2]];
            const side = normalise(cross(d, toEye)), w = s.width;
            const o: Vec3 = [side[0] * w, side[1] * w, side[2] * w];
            quad(add(s.head, o, 1), add(s.head, o, -1), add(s.tail, o, -1), add(s.tail, o, 1), [1, .95, .8], 1, s.colour, 0);
        }
        for (const q of this.particles)
        {
            const t = q.age / q.life, h = q.size / 2;
            const alpha = q.glow ? 1 - t * t : (1 - t) * (q.grow > 0 ? .55 : 1);
            const colour: Colour = q.glow ? [q.colour[0] * (1.4 - t * .6), q.colour[1] * (1.4 - t), q.colour[2] * (1.2 - t)] : q.colour;
            const rx = right[0] * h, ry = right[1] * h, rz = right[2] * h, ux = up[0] * h, uy = up[1] * h, uz = up[2] * h;
            const p = q.p;
            if (q.grow > 0)
            {
                // dust / smoke: a soft disc, solid in the middle, gone at the rim
                const centre: Vec3 = [p[0], p[1], p[2]], a = alpha * Math.min(1, q.age * 20);
                const rim = (k: number): Vec3 => {
                    const t = k / 8 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
                    return [p[0] + (rx * c + ux * s) * 1.2, p[1] + (ry * c + uy * s) * 1.2, p[2] + (rz * c + uz * s) * 1.2];
                };
                for (let k = 0; k < 8; k++) { vertex(centre, colour, a); vertex(rim(k), colour, 0); vertex(rim(k + 1), colour, 0); }
                continue;
            }
            quad([p[0] - rx - ux, p[1] - ry - uy, p[2] - rz - uz], [p[0] + rx - ux, p[1] + ry - uy, p[2] + rz - uz],
                [p[0] + rx + ux, p[1] + ry + uy, p[2] + rz + uz], [p[0] - rx + ux, p[1] - ry + uy, p[2] - rz + uz], colour, alpha, colour, alpha);
        }

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniforms.view, false, new Float32Array(view.viewMatrix as ArrayLike<number>));
        gl.uniformMatrix4fv(this.uniforms.projection, false, new Float32Array(view.projectionMatrix as ArrayLike<number>));
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        if (this.marks.count)
        {
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(-2, -4);
            gl.bindVertexArray(this.marks.vao);
            gl.drawArrays(gl.TRIANGLES, 0, this.marks.count * MARK_VERTICES);
            gl.disable(gl.POLYGON_OFFSET_FILL);
        }
        if (at)
        {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamic.buffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, at);
            gl.bindVertexArray(this.dynamic.vao);
            gl.drawArrays(gl.TRIANGLES, 0, at / FLOATS);
        }
        gl.bindVertexArray(null);
        gl.depthMask(true);
    }

    /** a mark on a surface: a dark hole, a rim round it */
    mark(point: Vec3, normal: Vec3, radius: number, centre: Colour, rim: Colour) {
        const m = this.marks, data = new Float32Array(MARK_VERTICES * FLOATS);
        // a frame on the surface, turned at random
        const a = normalise(Math.abs(normal[1]) < .9 ? cross(normal, [0, 1, 0]) : cross(normal, [1, 0, 0])), b = cross(normal, a);
        const turn = Math.random() * Math.PI;
        const c: Vec3 = [point[0] + normal[0] * .004, point[1] + normal[1] * .004, point[2] + normal[2] * .004];
        let at = 0;
        const put = (p: Vec3, col: Colour, alpha: number) => {
            data[at++] = p[0]; data[at++] = p[1]; data[at++] = p[2];
            data[at++] = col[0] * alpha; data[at++] = col[1] * alpha; data[at++] = col[2] * alpha; data[at++] = alpha;
        };
        const ring = (k: number): Vec3 => {
            const t = turn + k / 6 * Math.PI * 2, r = radius * (.75 + ((k * 7919) % 5) / 10);
            const x = Math.cos(t) * r, y = Math.sin(t) * r;
            return [c[0] + a[0] * x + b[0] * y, c[1] + a[1] * x + b[1] * y, c[2] + a[2] * x + b[2] * y];
        };
        for (let k = 0; k < 6; k++) { put(c, centre, 1); put(ring(k), rim, .55); put(ring(k + 1), rim, .55); }
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, m.next * MARK_VERTICES * FLOATS * 4, data);
        m.next = (m.next + 1) % m.max;
        m.count = Math.min(m.count + 1, m.max);
    }

    destroy() {
        const gl = this.gl;
        for (const x of [this.dynamic, this.marks]) { gl.deleteVertexArray(x.vao); gl.deleteBuffer(x.buffer); }
    }

    private add(p: Particle) {
        if (this.particles.length >= this.maxParticles) this.particles.shift();
        this.particles.push(p);
    }
}

function normalise(v: Vec3): Vec3 {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function add(a: Vec3, b: Vec3, k: number): Vec3 {
    return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}
/** a random direction within `spread` (0..1, 1 = a half sphere) of `n`, times `speed` */
function cone(n: Vec3, spread: number, speed: number): Vec3 {
    const r: Vec3 = normalise([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]);
    const d = normalise([n[0] + r[0] * spread, n[1] + r[1] * spread, n[2] + r[2] * spread]);
    return [d[0] * speed, d[1] * speed, d[2] * speed];
}
