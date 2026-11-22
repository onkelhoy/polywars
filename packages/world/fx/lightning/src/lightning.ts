import type { Layer3D } from "@papit/game-engine";
import type { LightningLook, LightningOptions, Strike, StrikeOptions, Vec3 } from "./types";

export const LIGHTNING_LOOK: LightningLook = { core: [1, 1, 1], glow: [.55, .62, 1], width: 1.6, minWidth: .0012 };

/** a segment: from, to, width, when it lights up (s after the start), main channel 1 / branch 0 */
type Segment = { a: Vec3; b: Vec3; w: number; t: number; main: number };
type Bolt = Strike & { segments: Segment[]; strokes: number[] };

/** pushes a → b as 3 pieces with small sideways kinks (lightning is jagged at every scale) */
function jagged(out: Segment[], a: Vec3, b: Vec3, w: number, t: number, main: number) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), k = len * .12, R = Math.random;
    let p = a;
    for (let i = 1; i <= 3; i++)
    {
        const f = i / 3, q: Vec3 = i === 3 ? b : [a[0] + (b[0] - a[0]) * f + (R() - .5) * k, a[1] + (b[1] - a[1]) * f + (R() - .5) * k, a[2] + (b[2] - a[2]) * f + (R() - .5) * k];
        out.push({ a: p, b: q, w, t, main });
        p = q;
    }
}

const VS = `#version 300 es
layout(location = 0) in vec3 a;
layout(location = 1) in vec3 b;
layout(location = 2) in vec2 wl; // width, light 0..1
uniform mat4 view, projection;
uniform vec3 eye;
uniform float minWidth, mainWidth;
out vec2 vUv;
out float vLight;
void main() {
    int c = gl_VertexID; // 0..5
    vec2 q = vec2(c == 1 || c == 2 || c == 4 ? 1.0 : -1.0, c == 2 || c == 4 || c == 5 ? 1.0 : 0.0);
    vec3 p = mix(a, b, q.y);
    vec3 axis = normalize(b - a + 1e-5), to = normalize(eye - p);
    vec3 side = normalize(cross(axis, to) + 1e-6);
    // glow halo: 6x the core, never thinner than a pixel or so far off
    float rel = sqrt(clamp(wl.x / mainWidth, 0.0, 1.0));
    float w = max(wl.x, length(eye - p) * minWidth * rel) * 6.0;
    vUv = vec2(q.x, q.y);
    vLight = wl.y * (.35 + .65 * rel);
    gl_Position = projection * view * vec4(p + side * q.x * w, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec2 vUv;
in float vLight;
uniform vec3 core, glow;
out vec4 outColor;
void main() {
    float x = abs(vUv.x);
    // core + a halo that really reaches 0 at the ribbon's edge (no boxes), in display space (no gamma lift)
    float c = smoothstep(.16, .0, x), g = (1.0 - smoothstep(0.0, 1.0, x)) * exp(-x * 5.0);
    vec3 col = (core * c * 1.3 + glow * g * .55) * vLight;
    outColor = vec4(col, 0.0);
}`;

type View = { viewMatrix: ArrayLike<number>; projectionMatrix: ArrayLike<number>; worldPosition?: { x: number; y: number; z: number } };

/**
 * Lightning bolts. `ground`: a stepped leader feels its way down from the cloud base in branching steps
 * (~.1-.2 s), the return stroke lights the main channel white, then it flickers in 1-4 re-strokes.
 * `spider`: a long channel that crawls almost level along the cloud base for kilometres, branching out
 * (straight-ish from afar, a strange crawling web from under it). `flash` / `flashAt` light the sky + clouds;
 * `storm` 0..1 strikes at random round the eye, `onstrike` tells the host (thunder: distance / speed of sound).
 * Draw after the world (additive, depth tested).
 */
export class Lightning {
    readonly look: LightningLook;
    readonly bolts: Bolt[] = [];
    /** 0..1 random strikes */
    storm = 0;
    /** cloud base for random strikes, m */
    base = 1500;
    /** a bolt started */
    onstrike?: (strike: Strike) => void;
    /** 0..~1 how bright the sky is from lightning now, seen from the last eye */
    flash = 0;
    /** unit, towards the brightest bolt */
    flashAt: Vec3 = [0, 1, 0];
    private o: Required<LightningOptions>;
    private gl: WebGL2RenderingContext;
    private program?: WebGLProgram;
    private u: Record<string, WebGLUniformLocation | null> = {};
    private vao: WebGLVertexArrayObject;
    private buf: WebGLBuffer;
    private data: Float32Array;
    private eye: Vec3 = [0, 0, 0];
    private wait = 3;
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };

    constructor(layer: Layer3D, options: LightningOptions = {}, look: Partial<LightningLook> = {}) {
        this.o = { ground: () => 0, segments: 16000, ...options };
        this.look = { ...LIGHTNING_LOOK, ...look };
        const gl = this.gl = layer.gl;
        this.data = new Float32Array(this.o.segments * 8);
        this.vao = gl.createVertexArray()!;
        this.buf = gl.createBuffer()!;
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
        for (const [i, n, off] of [[0, 3, 0], [1, 3, 12], [2, 2, 24]])
        {
            gl.enableVertexAttribArray(i);
            gl.vertexAttribPointer(i, n, gl.FLOAT, false, 32, off);
            gl.vertexAttribDivisor(i, 1);
        }
        gl.bindVertexArray(null);
        layer.createProgram(`pw-lightning-${Math.random().toString(36).slice(2)}`, VS, FS).then(p => {
            this.program = p;
            for (const n of ["view", "projection", "eye", "minWidth", "mainWidth", "core", "glow"]) this.u[n] = gl.getUniformLocation(p, n);
        });
    }

    /** a bolt at x / z now */
    strike(x: number, z: number, options: StrikeOptions = {}): Strike {
        const kind = options.kind ?? "ground", base = options.base ?? this.base, R = Math.random;
        const segments: Segment[] = [];
        let bolt: Bolt;
        if (kind === "ground")
        {
            const floor = this.o.ground(x, z), top: Vec3 = [x + (R() - .5) * 400, Math.max(floor + 300, base + 200 * R()), z + (R() - .5) * 400];
            // the leader: steps down, aimed at the touch point, jittered; branches peel off and die in the air
            const leader = .08 + R() * .1;
            // main: zigzags toward the touch point; branches fork sideways off it, keep some of its fall,
            // taper and die in the air; they fork again (3 levels)
            const walk = (from: Vec3, aim: Vec3 | null, dir: Vec3, width: number, t0: number, main: number, steps: number, depth: number) => {
                let p = from, t = t0, w = width, d = dir;
                for (let i = 0; i < steps; i++)
                {
                    const step = (main ? 22 : 14) + R() * (main ? 40 : 26);
                    if (aim)
                    {
                        const to: Vec3 = [aim[0] - p[0], aim[1] - p[1], aim[2] - p[2]], l = Math.hypot(...to) || 1;
                        if (l < step) { jagged(segments, p, aim, w, t, main); return; }
                        d = [to[0] / l, to[1] / l, to[2] / l];
                    }
                    // a kink each step, kept roughly on course
                    const k: Vec3 = [d[0] + (R() - .5) * 1.2, d[1] + (R() - .5) * .4, d[2] + (R() - .5) * 1.2], m = Math.hypot(...k) || 1;
                    const q: Vec3 = [p[0] + k[0] / m * step, p[1] + k[1] / m * step, p[2] + k[2] / m * step];
                    if (q[1] < this.o.ground(q[0], q[2])) return;
                    t += leader * step / (top[1] - floor);
                    jagged(segments, p, q, w, t, main);
                    if (depth < 3 && R() < (main ? .11 : .07))
                    {
                        const a = R() * Math.PI * 2, out = .8 + R() * .8;
                        const bd: Vec3 = [d[0] * .4 + Math.cos(a) * out, Math.min(-.25, d[1] * .6), d[2] * .4 + Math.sin(a) * out];
                        walk(q, null, bd, w * .4, t, 0, 4 + Math.floor(R() * (main ? 18 : 9)), depth + 1);
                    }
                    if (!main) w *= .92;
                    p = q;
                }
            };
            walk(top, [x, floor, z], [0, -1, 0], this.look.width, 0, 1, 400, 0);
            const strokes = [leader];
            for (let i = 0, n = 1 + Math.floor(R() * 4); i < n; i++) strokes.push(strokes[strokes.length - 1] + .04 + R() * .12);
            bolt = { kind, position: [x, floor, z], age: 0, life: strokes[strokes.length - 1] + .25, hit: leader, segments, strokes };
        }
        else
        {
            // spider: crawls near level along the base, forks spread sideways, a few droop
            const heading = options.heading ?? R() * Math.PI * 2, length = options.length ?? 6000 + R() * 12000, speed = 18000 + R() * 15000;
            // one trunk crawling near level, gently bending; forks spread off it at an angle, fork again,
            // taper, some sag down a little; everything stays joined to the trunk
            const walk = (from: Vec3, h: number, len: number, width: number, t0: number, main: number, depth: number) => {
                let p = from, t = t0, done = 0, w = width, sag = main ? 0 : (R() - .7) * 12;
                while (done < len && segments.length < this.o.segments)
                {
                    const step = (main ? 70 : 45) + R() * (main ? 110 : 70);
                    h += (R() - .5) * (main ? .45 : .7);
                    const y = Math.min(base + 150, Math.max(base - 220, p[1] + (R() - .5) * step * .25 + sag));
                    const q: Vec3 = [p[0] + Math.cos(h) * step, y, p[2] + Math.sin(h) * step];
                    t += step / speed;
                    jagged(segments, p, q, w, t, main);
                    done += step;
                    if (depth < 3 && R() < (main ? .14 : .08))
                        walk(q, h + (R() < .5 ? -1 : 1) * (.35 + R() * .8), Math.min(len - done, len) * (.12 + R() * .2), w * .45, t, 0, depth + 1);
                    if (!main) w *= .96;
                    p = q;
                }
            };
            const start: Vec3 = [x - Math.cos(heading) * length / 2, base, z - Math.sin(heading) * length / 2];
            walk(start, heading, length, this.look.width * .8, 0, 1, 0);
            const end = segments.reduce((m, s) => Math.max(m, s.t), 0);
            bolt = { kind, position: [x, base, z], age: 0, life: end + .6 + R() * .5, hit: end * .6, segments, strokes: [end * .6, end + .1] };
        }
        this.bolts.push(bolt);
        this.onstrike?.(bolt);
        return bolt;
    }

    update(dt: number) {
        for (const b of this.bolts) b.age += dt;
        for (let i = this.bolts.length - 1; i >= 0; i--) if (this.bolts[i].age > this.bolts[i].life) this.bolts.splice(i, 1);
        if (this.storm > .01)
        {
            this.wait -= dt * (.3 + this.storm * 1.7);
            if (this.wait <= 0)
            {
                this.wait = 3 + Math.random() * 14;
                const a = Math.random() * Math.PI * 2, d = 400 + Math.pow(Math.random(), 1 + this.storm * 2) * 14000 * (1.2 - this.storm * .6);
                this.strike(this.eye[0] + Math.cos(a) * d, this.eye[2] + Math.sin(a) * d, { kind: Math.random() < .35 ? "spider" : "ground", base: this.base });
            }
        }
        // the flash: each bolt's light now, dimmer far off
        let f = 0, best = 0;
        for (const b of this.bolts)
        {
            const l = this.light(b, -1), d = Math.hypot(b.position[0] - this.eye[0], b.position[2] - this.eye[2]);
            const v = l * (b.kind === "spider" ? 1.3 : 1) / (1 + d / 2500);
            f += v;
            if (v > best) { best = v; const y = b.position[1] - this.eye[1] + 800, n = Math.hypot(b.position[0] - this.eye[0], y, b.position[2] - this.eye[2]) || 1; this.flashAt = [(b.position[0] - this.eye[0]) / n, y / n, (b.position[2] - this.eye[2]) / n]; }
        }
        this.flash = Math.min(1.5, f);
    }

    /** how lit a bolt (main 1, branch 0, -1 = the whole bolt) is now: the leader glows faint, strokes flash and fade */
    private light(b: Bolt, main: number) {
        const t = b.age;
        if (t < b.strokes[0]) return main === 0 ? .5 : .3;
        let v = 0;
        for (const s of b.strokes) if (t >= s) v = Math.max(v, Math.exp(-(t - s) / .035) * (s === b.strokes[0] ? 1 : .8));
        // the channel glows on a little between strokes
        v = Math.max(v, .12 * Math.max(0, 1 - (t - b.strokes[0]) / (b.life - b.strokes[0])));
        return main === 0 ? v * .75 : v;
    }

    draw(camera: View) {
        const e = camera.worldPosition ?? { x: 0, y: 0, z: 0 };
        this.eye = [e.x, e.y, e.z];
        if (!this.program || !this.bolts.length) return;
        const gl = this.gl, d = this.data;
        let n = 0;
        for (const b of this.bolts)
        {
            const main = this.light(b, 1), branch = this.light(b, 0);
            for (const s of b.segments)
            {
                if (n >= this.o.segments) break;
                if (s.t > b.age) continue;
                // before the return stroke only the leader tips glow faint
                let l = s.main ? main : branch;
                // spider: the crawling tip burns bright, the path behind it stays lit and flickers until it fades
                if (b.kind === "spider")
                {
                    const since = b.age - s.t, fade = Math.max(0, 1 - b.age / b.life);
                    l = Math.max(l, (Math.exp(-since / .12) * 1.2 + .5 * (.75 + .25 * Math.sin(b.age * 70 + s.t * 40))) * fade * (s.main ? 1 : .8));
                }
                if (l < .01) continue;
                const o = n++ * 8;
                d[o] = s.a[0]; d[o + 1] = s.a[1]; d[o + 2] = s.a[2]; d[o + 3] = s.b[0]; d[o + 4] = s.b[1]; d[o + 5] = s.b[2]; d[o + 6] = s.w; d[o + 7] = l;
            }
        }
        if (!n) return;
        this.f32.view.set(camera.viewMatrix);
        this.f32.projection.set(camera.projectionMatrix);
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.u.view, false, this.f32.view);
        gl.uniformMatrix4fv(this.u.projection, false, this.f32.projection);
        gl.uniform3f(this.u.eye, e.x, e.y, e.z);
        gl.uniform1f(this.u.minWidth, this.look.minWidth);
        gl.uniform1f(this.u.mainWidth, this.look.width);
        gl.uniform3fv(this.u.core, this.look.core);
        gl.uniform3fv(this.u.glow, this.look.glow);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * 8);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
}
