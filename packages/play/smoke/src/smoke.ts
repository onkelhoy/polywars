import type { Layer3D } from "@papit/game-engine";
import { PRESETS, WHITE } from "./presets";
import type { BurstOptions, Colour, Emitter, Layer, Preset, SmokeLook, SmokeSetting, Vec3, View } from "./types";

// puff fields (one Float32Array, STRIDE per puff)
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, R0 = 8, R1 = 9, GROW = 10, DRAG = 11, LIFT = 12,
    SWIRL = 13, STRETCH = 14, CR = 15, CG = 16, CB = 17, BRIGHT = 18, DIM = 19, SHRINK = 20, ERODE = 21, GROUND = 22, SEED = 23;
const STRIDE = 24;
// instance: x y z radius | stretch xyz seed | r g b bright | erode
const INSTANCE = 13;

const VERTEX = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 puff;
layout(location = 2) in vec4 motion;
layout(location = 3) in vec4 tone;
layout(location = 4) in float erode;
uniform mat4 view, projection;
out vec2 vUv;
out vec3 vView;
out float vRadius, vSeed, vErode;
out vec4 vTone;
void main() {
    vec3 c = (view * vec4(puff.xyz, 1.0)).xyz;
    // stretch along the screen way it moves, tail trails behind, head stays
    vec2 d = (mat3(view) * motion.xyz).xy;
    float l = min(length(d), 3.0);
    vec2 ax = l > 1e-4 ? normalize(d) : vec2(1.0, 0.0), ay = vec2(-ax.y, ax.x);
    float k = 1.0 + l;
    vec2 local = corner * 1.12;
    vec2 o = (ax * local.x * k + ay * local.y - ax * (k - 1.0) * .5) * puff.w;
    vView = c + vec3(o, 0.0);
    vUv = local;
    vRadius = puff.w;
    vSeed = motion.w;
    vTone = tone;
    vErode = erode;
    gl_Position = projection * vec4(vView, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vView;
in float vRadius, vSeed, vErode;
in vec4 vTone;
uniform mat4 projection;
uniform vec3 sun, shade;
uniform float outline, band;
out vec4 outColor;

float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main() {
    // lumpy rim
    float lump = 1.0 + (noise(vec3(vUv * 2.3, vSeed * 13.0)) - .5) * .14;
    float r = length(vUv) / lump;
    if (r > 1.0) discard;
    // late in life the edges get eaten: noise holes growing in from the rim
    float keep = noise(vec3(vUv * 3.2 + vSeed * 5.0, vSeed * 7.0)) * .7 + (1.0 - r) * .6 - vErode * 1.3;
    if (keep < 0.0) discard;
    vec3 n = vec3(vUv / lump, sqrt(max(0.0, 1.0 - r * r)));
    n = normalize(n);
    // toon bands as crescents, cut by circles shifted toward the sun on screen (like drawn smoke)
    vec2 sd = length(sun.xy) > .05 ? normalize(sun.xy) : vec2(0.0, 1.0);
    vec2 q = vUv / lump;
    float facing = sun.z * .3;
    float lit = length(q - sd * (band + .35 + facing)) - 1.0;
    float core = length(q + sd * (.55 - band)) - 1.2;
    float spot = length(q - sd * .5) - .38 * vTone.a;
    vec3 base = vTone.rgb;
    float b = vTone.a;
    vec3 col;
    if (r > 1.0 - outline || (vErode > 0.0 && keep < outline * 1.5)) col = base * shade * .55;
    else if (spot < 0.0 && b > .3) col = mix(base, vec3(1.0), .6 * b);
    else if (lit < 0.0) col = mix(base, vec3(1.0), .22 * b);
    else if (core < 0.0) col = base * mix(vec3(1.0), shade, .55);
    else col = base * shade;
    outColor = vec4(col, 1.0);
    // a sphere's depth, so puffs cut into each other (and the ground) with a clean line
    vec4 clip = projection * vec4(vView + vec3(0.0, 0.0, n.z * vRadius), 1.0);
    gl_FragDepth = clip.z / clip.w * .5 + .5;
}`;

let count = 0;
const rand = (r: [number, number]) => r[0] === r[1] ? r[0] : r[0] + Math.random() * (r[1] - r[0]);
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Stylized toon smoke. Every puff is a camera facing sphere: flat tone bands (bright top, body, cool shadow),
 * a dark rim, real depth. Puffs burst out, brake, rise and swirl, stretch along their speed, then go flat,
 * shrink and crumble. Opaque: one instanced draw, no sorting.
 * `update(dt)` then `draw(view)` each frame (after the opaque scene).
 */
export class Smoke {
    readonly presets: Record<string, Preset>;
    readonly look: SmokeLook = { sun: [.35, .85, .4], wind: [0, 0, 0], outline: .06, shade: [.7, .72, .82], band: .05 };
    /** time scale (slow motion for tuning) */
    speed = 1;
    private gl: WebGL2RenderingContext;
    private program?: WebGLProgram;
    private uniforms: Record<string, WebGLUniformLocation | null> = {};
    private max: number;
    private data: Float32Array;
    private live = 0;
    private instances: Float32Array;
    private vao: WebGLVertexArrayObject;
    private buffer: WebGLBuffer;
    private quad: WebGLBuffer;
    private ground: (x: number, z: number) => number;
    private emitters: (Emitter & { preset: Preset; carry: number[]; on: boolean })[] = [];
    private time = 0;
    private sunView = new Float32Array(3);

    constructor(layer: Layer3D, setting: SmokeSetting = {}) {
        const gl = this.gl = layer.gl;
        this.max = setting.puffs ?? 4000;
        this.ground = setting.ground ?? (() => 0);
        this.presets = { ...PRESETS, ...setting.presets };
        this.data = new Float32Array(this.max * STRIDE);
        this.instances = new Float32Array(this.max * INSTANCE);
        layer.createProgram(`pw-smoke-${count++}`, VERTEX, FRAGMENT).then(program => {
            this.program = program;
            for (const n of ["view", "projection", "sun", "shade", "outline", "band"]) this.uniforms[n] = gl.getUniformLocation(program, n);
        });

        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        this.quad = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        this.buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.instances.byteLength, gl.DYNAMIC_DRAW);
        const at = (location: number, size: number, offset: number) => {
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, INSTANCE * 4, offset * 4);
            gl.vertexAttribDivisor(location, 1);
        };
        at(1, 4, 0); at(2, 4, 4); at(3, 4, 8); at(4, 1, 12);
        gl.bindVertexArray(null);
    }

    /** puffs alive */
    get count() { return this.live; }

    /** a one shot: every layer of `preset` (a name or a preset) at `at` */
    burst(preset: string | Preset, at: ArrayLike<number>, options: BurstOptions = {}) {
        const p = typeof preset === "string" ? this.presets[preset] : preset;
        if (!p) return;
        for (const layer of p.layers)
            for (let i = 0; i < layer.count; i++) this.spawn(layer, at, options.scale ?? 1, options.velocity, options.colour);
    }

    /** a running source: each layer's `count` is puffs per second */
    emitter(preset: string | Preset, at: ArrayLike<number>, options: BurstOptions = {}): Emitter {
        const p = typeof preset === "string" ? this.presets[preset] : preset;
        const e = {
            preset: p ?? { layers: [] }, position: [at[0], at[1], at[2]] as Vec3, rate: 1, scale: options.scale ?? 1,
            velocity: options.velocity ?? [0, 0, 0] as Vec3, colour: options.colour, carry: (p?.layers ?? []).map(() => Math.random()), on: true,
            stop: () => { e.on = false; this.emitters = this.emitters.filter(x => x !== e); },
        };
        this.emitters.push(e);
        return e;
    }

    /**
     * A still cloud heap: a flat bottom, puffs piled up highest in the middle. `size` m across (radius),
     * lives until `clear`. Drifts with the wind.
     */
    cloud(at: ArrayLike<number>, size: number, options: { colour?: Colour; puffs?: number; height?: number } = {}) {
        const n = options.puffs ?? Math.round(30 + size * 1.5), height = options.height ?? .7;
        const layer: Layer = { count: 1, speed: [0, 0], life: [Infinity, Infinity], size: [1, 1], grow: 100, drag: 0, swirl: 0, stretch: 0, colour: options.colour ?? WHITE, bright: 1, dim: Infinity, ground: false, jitter: 0 };
        for (let i = 0; i < n; i++)
        {
            const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random());
            const centre = 1 - d * d;
            const r = size * (.12 + .22 * centre) * (.7 + Math.random() * .6);
            const y = size * height * centre * Math.pow(Math.random(), .6);
            const x = Math.cos(a) * d * size, z = Math.sin(a) * d * size * .7;
            const slot = this.spawn(layer, [at[0] + x, at[1] + y + r * .3, at[2] + z], 1);
            if (slot >= 0) this.data[slot * STRIDE + R0] = this.data[slot * STRIDE + R1] = r;
        }
    }

    /** drop every puff and emitter */
    clear() {
        this.live = 0;
        this.emitters.length = 0;
    }

    /** one puff of `layer`; returns its slot (-1 when full) */
    spawn(layer: Layer, at: ArrayLike<number>, scale = 1, velocity?: ArrayLike<number>, colour?: Colour) {
        if (this.live >= this.max) return -1;
        const slot = this.live++, o = slot * STRIDE, d = this.data;
        const jitter = layer.jitter ?? .3, j = () => 1 + (Math.random() * 2 - 1) * jitter;
        // start point
        const radius = (layer.radius ?? 0) * scale;
        let x = 0, y = 0, z = 0, ox = 0, oz = 0;
        const angle = Math.random() * Math.PI * 2;
        ox = Math.cos(angle); oz = Math.sin(angle);
        if (layer.shape === "ring") { x = ox * radius; z = oz * radius; }
        else if (layer.shape === "sphere")
        {
            const u = random3(), k = radius * Math.cbrt(Math.random());
            x = u[0] * k; y = Math.abs(u[1]) * k; z = u[2] * k;
            const l = Math.hypot(x, z) || 1; ox = x / l || ox; oz = z / l || oz;
        }
        d[o + PX] = at[0] + x; d[o + PY] = at[1] + y; d[o + PZ] = at[2] + z;
        // velocity: along the cone, plus flat outward, plus the source's
        const dir = cone(layer.direction ?? [0, 1, 0], layer.spread ?? .3);
        const speed = rand(layer.speed) * scale * j(), out = layer.outward ? rand(layer.outward) * scale * j() : 0;
        d[o + VX] = dir[0] * speed + ox * out + (velocity?.[0] ?? 0);
        d[o + VY] = dir[1] * speed + (velocity?.[1] ?? 0);
        d[o + VZ] = dir[2] * speed + oz * out + (velocity?.[2] ?? 0);
        d[o + AGE] = layer.delay ? -rand(layer.delay) : 0;
        d[o + LIFE] = rand(layer.life);
        const s = scale * j();
        d[o + R0] = layer.size[0] * s; d[o + R1] = layer.size[1] * s;
        d[o + GROW] = layer.grow ?? 3;
        d[o + DRAG] = layer.drag ?? 1;
        d[o + LIFT] = (layer.lift ?? 0) * scale;
        d[o + SWIRL] = (layer.swirl ?? .5) * scale;
        d[o + STRETCH] = layer.stretch ?? .05;
        const c = colour ?? layer.colour, shade = 1 + (Math.random() - .5) * .06;
        d[o + CR] = c[0] * shade; d[o + CG] = c[1] * shade; d[o + CB] = c[2] * shade;
        d[o + BRIGHT] = layer.bright ?? 1;
        d[o + DIM] = layer.dim ?? .5;
        d[o + SHRINK] = layer.shrink ?? .7;
        d[o + ERODE] = layer.erode ?? .55;
        d[o + GROUND] = layer.ground === false ? 0 : 1;
        d[o + SEED] = Math.random() * 100;
        return slot;
    }

    update(dt: number) {
        dt *= this.speed;
        this.time += dt;
        for (const e of this.emitters)
            e.preset.layers.forEach((layer, i) => {
                e.carry[i] += layer.count * e.rate * dt;
                while (e.carry[i] >= 1) { e.carry[i]--; this.spawn(layer, e.position, e.scale, e.velocity, e.colour); }
            });

        const d = this.data, t = this.time, w = this.look.wind;
        for (let i = this.live - 1; i >= 0; i--)
        {
            const o = i * STRIDE;
            const age = d[o + AGE] += dt;
            if (age < 0) continue;
            if (age >= d[o + LIFE]) { this.remove(i); continue; }
            const damp = Math.exp(-d[o + DRAG] * dt);
            d[o + VX] *= damp; d[o + VY] = d[o + VY] * damp + d[o + LIFT] * dt; d[o + VZ] *= damp;
            // a cheap swirling flow field: moves the puff, not its speed (no build up)
            const x = d[o + PX], y = d[o + PY], z = d[o + PZ], s = d[o + SWIRL];
            const fx = Math.sin(z * .37 + t * .7) * Math.cos(y * .41 - t * .3);
            const fy = Math.sin(x * .33 - t * .5) * Math.cos(z * .29 + t * .4) * .6;
            const fz = Math.sin(y * .39 + t * .6) * Math.cos(x * .31 + t * .2);
            d[o + PX] = x + (d[o + VX] + fx * s + w[0]) * dt;
            d[o + PY] = y + (d[o + VY] + fy * s + w[1]) * dt;
            d[o + PZ] = z + (d[o + VZ] + fz * s + w[2]) * dt;
            if (d[o + GROUND])
            {
                // sit on the ground, flat bottomed: a little sunk, slide along it
                const floor = this.ground(d[o + PX], d[o + PZ]) + this.radius(o) * .15;
                if (d[o + PY] < floor) { d[o + PY] = floor; if (d[o + VY] < 0) d[o + VY] = 0; }
            }
        }
    }

    draw(view: View) {
        const gl = this.gl;
        if (!this.program) return;
        const d = this.data, out = this.instances;
        let n = 0;
        for (let i = 0; i < this.live; i++)
        {
            const o = i * STRIDE, age = d[o + AGE];
            if (age < 0) continue;
            const life = d[o + LIFE], t = age / life;
            const radius = this.radius(o) * (1 - smoothstep(d[o + SHRINK], 1, t));
            if (radius <= .001) continue;
            const k = n++ * INSTANCE, st = d[o + STRETCH];
            out[k] = d[o + PX]; out[k + 1] = d[o + PY]; out[k + 2] = d[o + PZ]; out[k + 3] = radius;
            out[k + 4] = d[o + VX] * st; out[k + 5] = d[o + VY] * st; out[k + 6] = d[o + VZ] * st; out[k + 7] = d[o + SEED];
            out[k + 8] = d[o + CR]; out[k + 9] = d[o + CG]; out[k + 10] = d[o + CB];
            out[k + 11] = d[o + BRIGHT] * (1 - smoothstep(0, d[o + DIM], t));
            out[k + 12] = smoothstep(d[o + ERODE], 1, t);
        }
        if (!n) return;

        // sun into view space
        const v = view.viewMatrix, s = this.look.sun;
        for (let r = 0; r < 3; r++) this.sunView[r] = v[r] * s[0] + v[4 + r] * s[1] + v[8 + r] * s[2];
        const l = Math.hypot(this.sunView[0], this.sunView[1], this.sunView[2]) || 1;
        for (let r = 0; r < 3; r++) this.sunView[r] /= l;

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniforms.view, false, new Float32Array(view.viewMatrix as ArrayLike<number>));
        gl.uniformMatrix4fv(this.uniforms.projection, false, new Float32Array(view.projectionMatrix as ArrayLike<number>));
        gl.uniform3fv(this.uniforms.sun, this.sunView);
        gl.uniform3fv(this.uniforms.shade, this.look.shade);
        gl.uniform1f(this.uniforms.outline, this.look.outline);
        gl.uniform1f(this.uniforms.band, this.look.band);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, out, 0, n * INSTANCE);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
        gl.bindVertexArray(null);
    }

    destroy() {
        const gl = this.gl;
        gl.deleteVertexArray(this.vao);
        gl.deleteBuffer(this.buffer);
        gl.deleteBuffer(this.quad);
    }

    /** grown radius (before the shrink): a fast pop that eases out */
    private radius(o: number) {
        const d = this.data, age = Math.max(0, d[o + AGE]);
        return d[o + R0] + (d[o + R1] - d[o + R0]) * (1 - Math.exp(-age * d[o + GROW]));
    }

    private remove(i: number) {
        const last = --this.live;
        if (i !== last) this.data.copyWithin(i * STRIDE, last * STRIDE, last * STRIDE + STRIDE);
    }
}

function random3(): Vec3 {
    const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [Math.cos(a) * r, z, Math.sin(a) * r];
}
/** a unit direction within `spread` (0..1, 1 = a half sphere) of `n` */
function cone(n: ArrayLike<number>, spread: number): Vec3 {
    const r = random3();
    const x = n[0] + r[0] * spread, y = n[1] + r[1] * spread, z = n[2] + r[2] * spread, l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
}
