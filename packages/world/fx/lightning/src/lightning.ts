import type { Layer3D } from "@papit/game-engine";
import type { LightningLook, LightningOptions, Strike, StrikeOptions, Vec3 } from "./types";

export const LIGHTNING_LOOK: LightningLook = { core: [1, 1, 1], glow: [.55, .62, 1], width: 1.6, minWidth: .0012 };

/** a segment: from, to, width, when it lights up (s after the start), main channel 1 / branch 0 */
type Segment = { a: Vec3; b: Vec3; w: number; t: number; main: number };
type Bolt = Strike & { segments: Segment[]; strokes: number[] };

const VS = `#version 300 es
layout(location = 0) in vec3 a;
layout(location = 1) in vec3 b;
layout(location = 2) in vec2 wl; // width, light 0..1
uniform mat4 view, projection;
uniform vec3 eye;
uniform float minWidth;
out vec2 vUv;
out float vLight;
void main() {
    int c = gl_VertexID; // 0..5
    vec2 q = vec2(c == 1 || c == 2 || c == 4 ? 1.0 : -1.0, c == 2 || c == 4 || c == 5 ? 1.0 : 0.0);
    vec3 p = mix(a, b, q.y);
    vec3 axis = normalize(b - a + 1e-5), to = normalize(eye - p);
    vec3 side = normalize(cross(axis, to) + 1e-6);
    // glow halo: 6x the core, never thinner than a pixel or so far off
    float w = max(wl.x, length(eye - p) * minWidth) * 6.0;
    vUv = vec2(q.x, q.y);
    vLight = wl.y;
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
    float c = smoothstep(.2, .0, x), g = exp(-x * 4.0) * .5;
    vec3 col = (core * c * 1.6 + glow * g) * vLight;
    outColor = vec4(pow(col, vec3(1.0 / 2.2)), 0.0);
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
        this.o = { ground: () => 0, segments: 6000, ...options };
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
            for (const n of ["view", "projection", "eye", "minWidth", "core", "glow"]) this.u[n] = gl.getUniformLocation(p, n);
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
            const walk = (from: Vec3, aim: Vec3 | null, width: number, t0: number, main: number, steps: number) => {
                let p = from, t = t0;
                for (let i = 0; i < steps; i++)
                {
                    const step = 25 + R() * 45;
                    let d: Vec3 = aim ? [aim[0] - p[0], aim[1] - p[1], aim[2] - p[2]] : [(R() - .5) * 2, -.7 - R() * .3, (R() - .5) * 2];
                    const l = Math.hypot(...d) || 1;
                    if (aim && l < step) { segments.push({ a: p, b: aim, w: width, t, main }); return; }
                    d = [d[0] / l + (R() - .5) * 1.1, d[1] / l + (R() - .5) * .5, d[2] / l + (R() - .5) * 1.1];
                    const m = Math.hypot(...d) || 1, q: Vec3 = [p[0] + d[0] / m * step, p[1] + d[1] / m * step, p[2] + d[2] / m * step];
                    if (q[1] < this.o.ground(q[0], q[2])) return;
                    t += leader * step / (top[1] - floor);
                    segments.push({ a: p, b: q, w: width, t, main });
                    if (R() < (main ? .1 : .05) && width > .2) walk(q, null, width * .45, t, 0, 4 + Math.floor(R() * 14));
                    p = q;
                }
            };
            walk(top, [x, floor, z], this.look.width, 0, 1, 400);
            const strokes = [leader];
            for (let i = 0, n = 1 + Math.floor(R() * 4); i < n; i++) strokes.push(strokes[strokes.length - 1] + .04 + R() * .12);
            bolt = { kind, position: [x, floor, z], age: 0, life: strokes[strokes.length - 1] + .25, segments, strokes };
        }
        else
        {
            // spider: crawls near level along the base, forks spread sideways, a few droop
            const heading = options.heading ?? R() * Math.PI * 2, length = options.length ?? 6000 + R() * 12000, speed = 18000 + R() * 15000;
            const walk = (from: Vec3, h: number, len: number, width: number, t0: number, main: number) => {
                let p = from, t = t0, done = 0;
                while (done < len && segments.length < this.o.segments)
                {
                    const step = 60 + R() * 120;
                    h += (R() - .5) * .9;
                    const q: Vec3 = [p[0] + Math.cos(h) * step, Math.min(base + 250, Math.max(base - 250, p[1] + (R() - .55) * step * .5)), p[2] + Math.sin(h) * step];
                    t += step / speed;
                    segments.push({ a: p, b: q, w: width, t, main });
                    done += step;
                    if (R() < (main ? .12 : .04) && width > .25) walk(q, h + (R() < .5 ? -1 : 1) * (.5 + R()), len * (.15 + R() * .3), width * .55, t, 0);
                    p = q;
                }
            };
            const start: Vec3 = [x - Math.cos(heading) * length / 2, base, z - Math.sin(heading) * length / 2];
            walk(start, heading, length, this.look.width * .8, 0, 1);
            const end = segments.reduce((m, s) => Math.max(m, s.t), 0);
            bolt = { kind, position: [x, base, z], age: 0, life: end + .4 + R() * .4, segments, strokes: [end * .6, end + .1] };
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
        if (t < b.strokes[0]) return main === 0 ? .35 : .15;
        let v = 0;
        for (const s of b.strokes) if (t >= s) v = Math.max(v, Math.exp(-(t - s) / .035) * (s === b.strokes[0] ? 1 : .8));
        // the channel glows on a little between strokes
        v = Math.max(v, .12 * Math.max(0, 1 - (t - b.strokes[0]) / (b.life - b.strokes[0])));
        return main === 0 ? v * .45 : v;
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
                const l = s.main ? main : branch;
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
