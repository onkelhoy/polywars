import type { Layer3D } from "@papit/game-engine";
import { PRESETS, WHITE } from "./presets";
import type { BurstOptions, CloudKind, CloudOptions, Colour, Emitter, Layer, Preset, SmokeLook, SmokeSetting, Vec3, View } from "./types";

// puff fields (one Float32Array, STRIDE per puff)
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, R0 = 8, R1 = 9, GROW = 10, DRAG = 11, LIFT = 12,
    SWIRL = 13, STRETCH = 14, CR = 15, CG = 16, CB = 17, BRIGHT = 18, DIM = 19, SHRINK = 20, GROUND = 21, SEED = 22,
    ID = 23, PARENT = 24, OX = 25, OZ = 26, GROUP = 27, ROLL = 28, SPIN = 29, FLAT = 30, TOP = 31, SKY = 32, DETAIL = 33, CX = 34, CY = 35, CZ = 36;
const STRIDE = 37;
// puff instance: x y z radius | stretch xyz seed | r g b bright | angle, bottom squash, top squash, sky shade
const PUFF = 16;
// tube instance: a xyz radius | b xyz radius | r g b bright
const TUBE = 12;

const SHADE = `
uniform vec3 sun, shade, skyShade;
uniform float highlight;
vec3 toon(vec3 p, vec3 base, float bright, float sky, vec3 centre) {
    vec3 shade = mix(shade, skyShade, sky);
    if (sky > .5) {
        // the facet's normal leans to the way out of its big mass: lobes on one mass light as one body
        vec3 m = normalize(normalize(cross(dFdx(p), dFdy(p))) * .4 + normalize(p - centre) * .6);
        float k = smoothstep(-.25, .8, dot(m, sun));
        return mix(base * shade, mix(base, vec3(1.0), highlight * .6 * bright), k);
    }
    // flat: one normal per face
    vec3 n = normalize(cross(dFdx(p), dFdy(p)));
    float l = dot(n, sun);
    if (l > .55) return mix(base, vec3(1.0), highlight * (.35 + .65 * bright));
    if (l > .1) return mix(base, vec3(1.0), highlight * .25 * bright);
    if (l > -.35) return base * mix(vec3(1.0), shade, .5);
    return base * shade;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec4 vTone;
in float vSky;
in vec3 vCentre;
out vec4 outColor;
${SHADE}
void main() { outColor = vec4(toon(vWorld, vTone.rgb, vTone.a, vSky, vCentre), 1.0); }`;

const PUFF_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec4 puff;
layout(location = 2) in vec4 motion;
layout(location = 3) in vec4 tone;
layout(location = 4) in vec4 spin;
uniform mat4 view, projection;
out vec3 vWorld;
out vec4 vTone;
out float vSky;
out vec3 vCentre;
void main() {
    // turned about its own random axis
    float seed = motion.w;
    vec3 axis = normalize(vec3(sin(seed * 12.9), cos(seed * 7.3), sin(seed * 3.1 + 1.0)));
    float c = cos(spin.x), s = sin(spin.x);
    vec3 p = position * c + cross(axis, position) * s + axis * dot(axis, position) * (1.0 - c);
    p *= puff.w;
    // squashed flat underneath (cloud bases)
    p.y *= p.y < 0.0 ? spin.y : spin.z;
    // stretched along its way
    // clouds: motion is the centre of the lobe's mass (no stretch)
    float l = spin.w > .5 ? 0.0 : min(length(motion.xyz), 3.0);
    vCentre = motion.xyz;
    if (l > 1e-4) { vec3 d = normalize(motion.xyz); p += d * dot(p, d) * l; }
    vWorld = puff.xyz + p;
    vTone = tone;
    vSky = spin.w;
    gl_Position = projection * view * vec4(vWorld, 1.0);
}`;

const TUBE_VERTEX = `#version 300 es
layout(location = 0) in vec3 ring;
layout(location = 1) in vec4 a;
layout(location = 2) in vec4 b;
layout(location = 3) in vec4 tone;
uniform mat4 view, projection;
uniform float thickness;
out vec3 vWorld;
out vec4 vTone;
out float vSky;
out vec3 vCentre;
void main() {
    vec3 axis = b.xyz - a.xyz;
    vec3 d = normalize(axis);
    vec3 u = normalize(cross(d, abs(d.y) < .9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), v = cross(d, u);
    float t = ring.z, r = mix(a.w, b.w, t) * thickness;
    vWorld = mix(a.xyz, b.xyz, t) + (u * ring.x + v * ring.y) * r;
    vTone = tone;
    vSky = 0.0;
    vCentre = vWorld;
    gl_Position = projection * view * vec4(vWorld, 1.0);
}`;

let count = 0;
const rand = (r: [number, number]) => r[0] === r[1] ? r[0] : r[0] + Math.random() * (r[1] - r[0]);
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Stylized low poly smoke. Every puff is a flat shaded icosahedron (toon bands per face: white top, body,
 * cool shadow), joined to its parent puff by a low poly tube while they are close: a body that fills between
 * the balls, with lone balls at the ends. Puffs burst out, brake, rise, swirl on curl noise, roll (explosion caps),
 * get dragged by the wind, and shrink away. Opaque, two instanced draws.
 * `update(dt)` then `draw(view)` each frame.
 */
export class Smoke {
    readonly presets: Record<string, Preset>;
    readonly look: SmokeLook = { sun: [.35, .85, .4], wind: [0, 0, 0], shade: [.78, .8, .87], skyShade: [.62, .72, .9], highlight: .8, detail: 0, thickness: .62, reach: 1.6, swirl: 1 };
    /** time scale (slow motion for tuning) */
    speed = 1;
    private gl: WebGL2RenderingContext;
    private puffProgram?: WebGLProgram;
    private tubeProgram?: WebGLProgram;
    private uniforms: Record<string, Record<string, WebGLUniformLocation | null>> = { puff: {}, tube: {} };
    private max: number;
    private data: Float32Array;
    private live = 0;
    private puffs: Float32Array;
    private round: Float32Array;
    private tubes: Float32Array;
    private meshes: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; geometry: WebGLBuffer; vertices: number }[];
    private tube: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; geometry: WebGLBuffer; vertices: number };
    private ground: (x: number, z: number) => number;
    private emitters: (Emitter & { preset: Preset; carry: number[]; last: number[]; on: boolean })[] = [];
    private time = 0;
    private ids = 1;
    private groups = 1;
    private slots = new Map<number, number>();
    private sun = new Float32Array(3);

    constructor(layer: Layer3D, setting: SmokeSetting = {}) {
        const gl = this.gl = layer.gl;
        this.max = setting.puffs ?? 4000;
        this.ground = setting.ground ?? (() => 0);
        this.presets = { ...PRESETS, ...setting.presets };
        this.data = new Float32Array(this.max * STRIDE);
        this.puffs = new Float32Array(this.max * PUFF);
        this.round = new Float32Array(this.max * PUFF);
        this.tubes = new Float32Array(this.max * TUBE);
        const id = count++, names = ["view", "projection", "sun", "shade", "highlight", "thickness", "skyShade"];
        layer.createProgram(`pw-smoke-puff-${id}`, PUFF_VERTEX, FRAGMENT).then(program => {
            this.puffProgram = program;
            for (const n of names) this.uniforms.puff[n] = gl.getUniformLocation(program, n);
        });
        layer.createProgram(`pw-smoke-tube-${id}`, TUBE_VERTEX, FRAGMENT).then(program => {
            this.tubeProgram = program;
            for (const n of names) this.uniforms.tube[n] = gl.getUniformLocation(program, n);
        });
        this.meshes = [icosahedron(0), icosahedron(1)].map(g => this.mesh(g, 3, PUFF, [[1, 4, 0], [2, 4, 4], [3, 4, 8], [4, 4, 12]]));
        this.tube = this.mesh(tubeRing(6), 3, TUBE, [[1, 4, 0], [2, 4, 4], [3, 4, 8]]);
    }

    private mesh(geometry: Float32Array, size: number, stride: number, attributes: number[][]) {
        const gl = this.gl, vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);
        const g = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, g);
        gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, size, gl.FLOAT, false, 0, 0);
        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.max * stride * 4, gl.DYNAMIC_DRAW);
        for (const [location, n, offset] of attributes)
        {
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, n, gl.FLOAT, false, stride * 4, offset * 4);
            gl.vertexAttribDivisor(location, 1);
        }
        gl.bindVertexArray(null);
        return { vao, buffer, geometry: g, vertices: geometry.length / size };
    }

    /** puffs alive */
    get count() { return this.live; }

    /** a one shot: every layer of `preset` (a name or a preset) at `at`; each puff joins the nearest one spawned before it */
    burst(preset: string | Preset, at: ArrayLike<number>, options: BurstOptions = {}) {
        const p = typeof preset === "string" ? this.presets[preset] : preset;
        if (!p) return;
        const group = this.groups++, spawned: number[] = [];
        for (const layer of p.layers)
            for (let i = 0; i < layer.count; i++)
            {
                const slot = this.spawn(layer, at, options.scale ?? 1, options.velocity, options.colour, group);
                if (slot < 0) return;
                if (layer.link !== false)
                {
                    const d = this.data, o = slot * STRIDE;
                    let best = -1, near = Infinity;
                    for (const other of spawned)
                    {
                        const q = other * STRIDE, k = (d[q + PX] - d[o + PX]) ** 2 + (d[q + PY] - d[o + PY]) ** 2 + (d[q + PZ] - d[o + PZ]) ** 2;
                        if (k < near) { near = k; best = other; }
                    }
                    if (best >= 0) d[o + PARENT] = d[best * STRIDE + ID];
                    spawned.push(slot);
                }
            }
    }

    /** a running source: each layer's `count` is puffs per second, each puff joined to the one before */
    emitter(preset: string | Preset, at: ArrayLike<number>, options: BurstOptions = {}): Emitter {
        const p = typeof preset === "string" ? this.presets[preset] : preset;
        const layers = p?.layers ?? [];
        const e = {
            preset: p ?? { layers: [] }, position: [at[0], at[1], at[2]] as Vec3, rate: 1, scale: options.scale ?? 1,
            velocity: options.velocity ?? [0, 0, 0] as Vec3, colour: options.colour, carry: layers.map(() => Math.random()), last: layers.map(() => 0), on: true,
            stop: () => { e.on = false; this.emitters = this.emitters.filter(x => x !== e); },
        };
        this.emitters.push(e);
        return e;
    }

    /**
     * A cloud (low poly, like a painted one): a few big round masses (`kind` sets their layout), round lobes only on
     * their upper outer surface, big in the body and smaller to the edges, everything flat along one bottom line.
     * `size` m sets the scale; `density` 0..1 makes it greyer (and flatter for `overcast`). Lives until `clear`,
     * drifts with the wind. Kinds: `cumulus` a big lone tower, `fair` a small fluffy one, `bank` wide and low with a
     * flat sheet under it, `overcast` a dense grey flat layer.
     */
    cloud(at: ArrayLike<number>, size: number, options: CloudOptions = {}) {
        const kind = options.kind ?? "cumulus", density = options.density ?? (kind === "overcast" ? .7 : .2);
        const masses = skeleton(kind, size, options.height ?? 1, (options.lean ?? 0) * size);
        const grey = kind === "overcast" ? .45 + density * .45 : density * .3;
        const colour = options.colour ?? [WHITE[0] - grey * .3, WHITE[1] - grey * .29, WHITE[2] - grey * .25] as Colour;
        const top = kind === "overcast" ? .6 - density * .2 : kind === "bank" ? .85 : 1;
        const layer: Layer = { count: 1, speed: [0, 0], life: [Infinity, Infinity], size: [1, 1], grow: 100, drag: 0, swirl: 0, stretch: 0, colour, bright: 1 - grey * .6, dim: Infinity, ground: false, jitter: 0, spin: 0, link: false };
        const d = this.data;
        let centre = [0, 0, 0];
        const put = (x: number, y: number, z: number, r: number, flat = 1, squash = top) => {
            const slot = this.spawn(layer, [at[0] + x, at[1] + y, at[2] + z], 1);
            if (slot < 0) return;
            const o = slot * STRIDE;
            d[o + R0] = d[o + R1] = r;
            // nothing below the bottom line
            d[o + FLAT] = Math.max(.08, Math.min(flat, y / r));
            d[o + TOP] = squash;
            d[o + SKY] = 1;
            d[o + DETAIL] = 0;
            d[o + CX] = at[0] + centre[0]; d[o + CY] = at[1] + centre[1]; d[o + CZ] = at[2] + centre[2];
        };
        for (const m of masses)
        {
            // a core fills it
            centre = [m[0], m[1] - m[3] * .2, m[2]];
            put(m[0], m[1], m[2], m[3] * .95);
            // lobes evenly over the upper surface (fibonacci sphere), none under, none buried in a neighbour
            const n = Math.round(4 + 7 * m[3] / size);
            for (let i = 0; i < n; i++)
            {
                const y = 1 - (i + .5) / n * 2, ring = Math.sqrt(1 - y * y), a = i * 2.39996 + m[0];
                const u = [Math.cos(a) * ring, y, Math.sin(a) * ring];
                if (u[1] < -.3) continue;
                const p = [m[0] + u[0] * m[3] * .62, m[1] + u[1] * m[3] * .62, m[2] + u[2] * m[3] * .62];
                if (masses.some(q => q !== m && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < q[3] * .85)) continue;
                put(p[0], p[1], p[2], m[3] * (.55 + Math.random() * .12));
            }
        }
    }

    /** a sky of clouds: `count` scattered round `at` from `near` to `far` m out, kinds mixed by `cover` 0..1 (more = flatter, greyer) */
    sky(at: ArrayLike<number>, options: { count?: number; near?: number; far?: number; height?: number; cover?: number } = {}) {
        const count = options.count ?? 10, near = options.near ?? 1200, far = options.far ?? 3000, cover = options.cover ?? .3;
        for (let i = 0; i < count; i++)
        {
            const a = Math.random() * Math.PI * 2, k = near + Math.random() * (far - near), r = Math.random();
            const kind: CloudKind = r < cover * .6 ? "overcast" : r < cover ? "bank" : r < .55 + cover * .3 ? "fair" : "cumulus";
            const size = kind === "fair" ? 60 + Math.random() * 60 : kind === "cumulus" ? 180 + Math.random() * 200 : 140 + Math.random() * 120;
            this.cloud([at[0] + Math.cos(a) * k, (options.height ?? 220) + Math.random() * 80, at[2] + Math.sin(a) * k], size, { kind, density: cover, lean: (Math.random() - .5) * .8 });
        }
    }

    /** drop every puff and emitter */
    clear() {
        this.live = 0;
        this.emitters.length = 0;
        this.slots.clear();
    }

    /** one puff of `layer`; returns its slot (-1 when full) */
    spawn(layer: Layer, at: ArrayLike<number>, scale = 1, velocity?: ArrayLike<number>, colour?: Colour, group = 0) {
        if (this.live >= this.max) return -1;
        const slot = this.live++, o = slot * STRIDE, d = this.data;
        const jitter = layer.jitter ?? .3, j = () => 1 + (Math.random() * 2 - 1) * jitter;
        const radius = (layer.radius ?? 0) * scale;
        let x = 0, y = 0, z = 0;
        const angle = Math.random() * Math.PI * 2;
        let ox = Math.cos(angle), oz = Math.sin(angle);
        if (layer.shape === "ring") { x = ox * radius; z = oz * radius; }
        else if (layer.shape === "sphere")
        {
            const u = random3(), k = radius * Math.cbrt(Math.random());
            x = u[0] * k; y = Math.abs(u[1]) * k; z = u[2] * k;
            const l = Math.hypot(x, z);
            if (l > 1e-4) { ox = x / l; oz = z / l; }
        }
        d[o + PX] = at[0] + x; d[o + PY] = at[1] + y; d[o + PZ] = at[2] + z;
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
        const c = colour ?? layer.colour ?? WHITE, shade = 1 + (Math.random() - .5) * .05;
        d[o + CR] = c[0] * shade; d[o + CG] = c[1] * shade; d[o + CB] = c[2] * shade;
        d[o + BRIGHT] = layer.bright ?? 1;
        d[o + DIM] = layer.dim ?? .5;
        d[o + SHRINK] = layer.shrink ?? .6;
        d[o + GROUND] = layer.ground === false ? 0 : 1;
        d[o + SEED] = Math.random() * 100;
        const id = this.ids++;
        d[o + ID] = id; d[o + PARENT] = 0;
        d[o + OX] = at[0]; d[o + OZ] = at[2];
        d[o + GROUP] = layer.roll ? group : 0;
        d[o + ROLL] = (layer.roll ?? 0) * scale;
        d[o + SPIN] = layer.spin ?? 1;
        d[o + FLAT] = 1;
        d[o + TOP] = 1;
        d[o + SKY] = 0;
        d[o + DETAIL] = -1;
        this.slots.set(id, slot);
        return slot;
    }

    update(dt: number) {
        dt *= this.speed;
        this.time += dt;
        for (const e of this.emitters)
            e.preset.layers.forEach((layer, i) => {
                e.carry[i] += layer.count * e.rate * dt;
                while (e.carry[i] >= 1)
                {
                    e.carry[i]--;
                    const slot = this.spawn(layer, e.position, e.scale, e.velocity, e.colour);
                    if (slot < 0) continue;
                    if (layer.link !== false) this.data[slot * STRIDE + PARENT] = e.last[i];
                    e.last[i] = this.data[slot * STRIDE + ID];
                }
            });

        const d = this.data, w = this.look.wind, swirl = this.look.swirl;
        // vortex rings: each rolling burst's centre and ring radius
        const rings = new Map<number, number[]>();
        for (let i = 0; i < this.live; i++)
        {
            const o = i * STRIDE, g = d[o + GROUP];
            if (!g || d[o + AGE] < 0) continue;
            let r = rings.get(g);
            if (!r) rings.set(g, r = [0, 0, 0]);
            r[0] += d[o + PY]; r[1] += Math.hypot(d[o + PX] - d[o + OX], d[o + PZ] - d[o + OZ]); r[2]++;
        }
        for (const r of rings.values()) { r[0] /= r[2]; r[1] = r[1] / r[2] * .8; }

        for (let i = this.live - 1; i >= 0; i--)
        {
            const o = i * STRIDE;
            const age = d[o + AGE] += dt;
            if (age < 0) continue;
            const life = d[o + LIFE];
            if (age >= life) { this.remove(i); continue; }
            const damp = Math.exp(-d[o + DRAG] * dt);
            d[o + VX] *= damp; d[o + VY] = d[o + VY] * damp + d[o + LIFT] * dt; d[o + VZ] *= damp;
            const x = d[o + PX], y = d[o + PY], z = d[o + PZ], k = age / life;
            let mx = d[o + VX], my = d[o + VY], mz = d[o + VZ];
            // curl noise at the puff's own scale, stronger with age
            const s = d[o + SWIRL] * swirl * (.4 + 1.6 * k);
            if (s > 0)
            {
                const c = curl(x, y, z, .5 / Math.max(.2, d[o + R1]), this.time * .25);
                mx += c[0] * s; my += c[1] * s; mz += c[2] * s;
            }
            // roll round the ring: up the middle, out over the top, down the outside, in along the bottom
            const ring = d[o + GROUP] ? rings.get(d[o + GROUP]) : undefined;
            if (ring)
            {
                const hx = x - d[o + OX], hz = z - d[o + OZ], h = Math.hypot(hx, hz) || 1;
                const rx = h - ring[1], ry = y - ring[0], rl = Math.hypot(rx, ry) || 1;
                const roll = d[o + ROLL] * Math.min(1, age);
                const vr = ry / rl * roll, vy = -rx / rl * roll;
                mx += hx / h * vr; my += vy; mz += hz / h * vr;
            }
            // the wind drags it more the older and higher it is
            const drag = Math.min(1, .3 + k * 1.4) * (1 + Math.max(0, y - this.ground(x, z)) * .03);
            d[o + PX] = x + (mx + w[0] * drag) * dt;
            d[o + PY] = y + (my + w[1] * drag) * dt;
            d[o + PZ] = z + (mz + w[2] * drag) * dt;
            if (d[o + SKY]) { d[o + CX] += d[o + PX] - x; d[o + CY] += d[o + PY] - y; d[o + CZ] += d[o + PZ] - z; }
            if (d[o + GROUND])
            {
                const floor = this.ground(d[o + PX], d[o + PZ]) + this.radius(o) * .2;
                if (d[o + PY] < floor) { d[o + PY] = floor; if (d[o + VY] < 0) d[o + VY] = 0; }
            }
        }
    }

    draw(view: View) {
        const gl = this.gl;
        if (!this.puffProgram || !this.tubeProgram) return;
        const d = this.data, T = this.tubes, w = this.look.wind, reach = this.look.reach;
        const shown = new Float32Array(this.live);
        let n = 0, n1 = 0;
        for (let i = 0; i < this.live; i++)
        {
            const o = i * STRIDE, age = d[o + AGE];
            if (age < 0) continue;
            const t = age / d[o + LIFE];
            const radius = this.radius(o) * (1 - smoothstep(d[o + SHRINK], 1, t));
            if (radius <= .001) continue;
            shown[i] = radius;
            const detail = d[o + DETAIL] < 0 ? this.look.detail : d[o + DETAIL];
            const P = detail ? this.round : this.puffs, k = (detail ? n1++ : n++) * PUFF, st = d[o + STRETCH], wk = .3 + t;
            P[k] = d[o + PX]; P[k + 1] = d[o + PY]; P[k + 2] = d[o + PZ]; P[k + 3] = radius;
            if (d[o + SKY]) { P[k + 4] = d[o + CX]; P[k + 5] = d[o + CY]; P[k + 6] = d[o + CZ]; }
            else { P[k + 4] = (d[o + VX] + w[0] * wk) * st; P[k + 5] = (d[o + VY] + w[1] * wk) * st; P[k + 6] = (d[o + VZ] + w[2] * wk) * st; } P[k + 7] = d[o + SEED];
            P[k + 8] = d[o + CR]; P[k + 9] = d[o + CG]; P[k + 10] = d[o + CB];
            P[k + 11] = d[o + BRIGHT] * (1 - smoothstep(0, d[o + DIM], t));
            P[k + 12] = d[o + SPIN] ? d[o + SEED] + age * (.4 + (d[o + SEED] % 1) * .6) * d[o + SPIN] : 0;
            P[k + 13] = d[o + FLAT];
            P[k + 14] = d[o + TOP];
            P[k + 15] = d[o + SKY];
        }
        if (!n && !n1) return;
        // tubes: puff to parent while both show and they are close
        let m = 0;
        for (let i = 0; i < this.live; i++)
        {
            const ra = shown[i];
            if (!ra) continue;
            const o = i * STRIDE, parent = this.slots.get(d[o + PARENT]);
            if (parent === undefined) continue;
            const rb = shown[parent];
            if (!rb) continue;
            const q = parent * STRIDE;
            const dist = Math.hypot(d[q + PX] - d[o + PX], d[q + PY] - d[o + PY], d[q + PZ] - d[o + PZ]);
            if (dist < .01 || dist > (ra + rb) * reach) continue;
            const k = m++ * TUBE;
            T[k] = d[o + PX]; T[k + 1] = d[o + PY]; T[k + 2] = d[o + PZ]; T[k + 3] = ra;
            T[k + 4] = d[q + PX]; T[k + 5] = d[q + PY]; T[k + 6] = d[q + PZ]; T[k + 7] = rb;
            T[k + 8] = (d[o + CR] + d[q + CR]) / 2; T[k + 9] = (d[o + CG] + d[q + CG]) / 2; T[k + 10] = (d[o + CB] + d[q + CB]) / 2;
            T[k + 11] = Math.min(d[o + BRIGHT] * (1 - smoothstep(0, d[o + DIM], d[o + AGE] / d[o + LIFE])), d[q + BRIGHT] * (1 - smoothstep(0, d[q + DIM], d[q + AGE] / d[q + LIFE])));
        }

        const s = this.look.sun, l = Math.hypot(s[0], s[1], s[2]) || 1;
        this.sun[0] = s[0] / l; this.sun[1] = s[1] / l; this.sun[2] = s[2] / l;
        const viewM = new Float32Array(view.viewMatrix as ArrayLike<number>), projection = new Float32Array(view.projectionMatrix as ArrayLike<number>);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
        const pass = (program: WebGLProgram, u: Record<string, WebGLUniformLocation | null>, mesh: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; vertices: number }, data: Float32Array, floats: number, instances: number) => {
            gl.useProgram(program);
            gl.uniformMatrix4fv(u.view, false, viewM);
            gl.uniformMatrix4fv(u.projection, false, projection);
            gl.uniform3fv(u.sun, this.sun);
            gl.uniform3fv(u.shade, this.look.shade);
            gl.uniform3fv(u.skyShade, this.look.skyShade);
            gl.uniform1f(u.highlight, this.look.highlight);
            gl.uniform1f(u.thickness, this.look.thickness);
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, instances * floats);
            gl.bindVertexArray(mesh.vao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertices, instances);
        };
        if (n) pass(this.puffProgram, this.uniforms.puff, this.meshes[0], this.puffs, PUFF, n);
        if (n1) pass(this.puffProgram, this.uniforms.puff, this.meshes[1], this.round, PUFF, n1);
        if (m) pass(this.tubeProgram, this.uniforms.tube, this.tube, T, TUBE, m);
        gl.bindVertexArray(null);
    }

    destroy() {
        this.clear();
        const gl = this.gl;
        for (const x of [...this.meshes, this.tube]) { gl.deleteVertexArray(x.vao); gl.deleteBuffer(x.buffer); gl.deleteBuffer(x.geometry); }
    }

    /** grown radius (before the shrink): a fast pop that eases out */
    private radius(o: number) {
        const d = this.data, age = Math.max(0, d[o + AGE]);
        return d[o + R0] + (d[o + R1] - d[o + R0]) * (1 - Math.exp(-age * d[o + GROW]));
    }

    private remove(i: number) {
        const last = --this.live, d = this.data;
        this.slots.delete(d[i * STRIDE + ID]);
        if (i !== last)
        {
            d.copyWithin(i * STRIDE, last * STRIDE, last * STRIDE + STRIDE);
            this.slots.set(d[i * STRIDE + ID], i);
        }
    }
}

/** a smooth vector potential; its curl is a swirling flow with no sources or sinks (Bridson 2007, curl noise) */
function potential(x: number, y: number, z: number, t: number, out: number[], k: number) {
    out[k] = Math.sin(y * 1.3 + t) * Math.cos(z * .9 - t * .7) + .5 * Math.sin(z * 2.3 + x * .7 + t * 1.3);
    out[k + 1] = Math.sin(z * 1.1 - t * .8) * Math.cos(x * 1.2 + t * .5) + .5 * Math.sin(x * 2.1 - y * .6 + t * 1.1);
    out[k + 2] = Math.sin(x * .95 + t * .6) * Math.cos(y * 1.4 - t * .9) + .5 * Math.sin(y * 2.2 + z * .8 - t * 1.2);
}
const field = new Array(18).fill(0);
function curl(x: number, y: number, z: number, frequency: number, t: number): Vec3 {
    const e = .1, f = frequency;
    x *= f; y *= f; z *= f;
    potential(x + e, y, z, t, field, 0); potential(x - e, y, z, t, field, 3);
    potential(x, y + e, z, t, field, 6); potential(x, y - e, z, t, field, 9);
    potential(x, y, z + e, t, field, 12); potential(x, y, z - e, t, field, 15);
    const k = 1 / (2 * e);
    // curl = (dPz/dy - dPy/dz, dPx/dz - dPz/dx, dPy/dx - dPx/dy)
    return [
        ((field[8] - field[11]) - (field[13] - field[16])) * k * .5,
        ((field[12] - field[15]) - (field[2] - field[5])) * k * .5,
        ((field[1] - field[4]) - (field[6] - field[9])) * k * .5,
    ];
}

/** unit icosahedron, `subdivisions` times split, flat triangle list */
function icosahedron(subdivisions: number) {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
        .map(p => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]].map(f => f.map(i => v[i]));
    for (let s = 0; s < subdivisions; s++)
    {
        const mid = (a: number[], b: number[]) => { const m = [a[0] + b[0], a[1] + b[1], a[2] + b[2]], l = Math.hypot(m[0], m[1], m[2]); return [m[0] / l, m[1] / l, m[2] / l]; };
        faces = faces.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
    }
    return new Float32Array(faces.flat(2));
}

/** an open tube: `sides` quads round, (cos, sin, t along) per vertex */
function tubeRing(sides: number) {
    const out: number[] = [];
    for (let i = 0; i < sides; i++)
    {
        const a = i / sides * Math.PI * 2, b = (i + 1) / sides * Math.PI * 2;
        const p = (angle: number, t: number) => out.push(Math.cos(angle), Math.sin(angle), t);
        p(a, 0); p(b, 0); p(b, 1); p(a, 0); p(b, 1); p(a, 1);
    }
    return new Float32Array(out);
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

/** the big masses a cloud is built on: [x, y, z, radius], y up from its bottom line */
function skeleton(kind: CloudKind, size: number, height: number, lean: number): number[][] {
    const r = () => Math.random(), S = size, out: number[][] = [];
    const add = (x: number, y: number, z: number, radius: number) => out.push([x, y, z, radius * S]);
    if (kind === "cumulus")
    {
        // a base row, shoulders, a body that climbs (and leans), a head
        for (let i = 0; i < 4; i++) { const x = (i / 3 - .5) * 1.6 * S, mid = 1 - Math.abs(i / 3 - .5); add(x, (.24 + .08 * mid) * S, (r() - .5) * .3 * S, .4 + .12 * mid); }
        add(-.6 * S, .62 * S, (r() - .5) * .3 * S, .36); add(.6 * S, .58 * S, (r() - .5) * .3 * S, .34);
        add(lean * .3, .95 * S * height, 0, .52); add(lean * .65, 1.38 * S * height, (r() - .5) * .2 * S, .46);
        for (let i = 0; i < 3; i++) add(lean + (i - 1) * .34 * S, (1.78 + (i === 1 ? .16 : 0)) * S * height, (r() - .5) * .3 * S, .34 + (i === 1 ? .06 : 0));
    }
    else if (kind === "fair")
    {
        add(0, .3 * S, 0, .5); add(-.45 * S, .2 * S, (r() - .5) * .3 * S, .34); add(.45 * S, .2 * S, (r() - .5) * .3 * S, .36);
        if (r() < .5) add((r() - .5) * .4 * S, .55 * S, 0, .3);
    }
    else if (kind === "bank")
    {
        for (let i = 0; i < 7; i++) { const t = i / 6 - .5, mid = 1 - Math.abs(t) * 2; add(t * 3.2 * S, (.18 + .1 * mid) * S, (r() - .5) * .5 * S, .3 + .15 * mid); }
        for (let i = 0; i < 2; i++) add((r() - .5) * 1.2 * S, .5 * S, (r() - .5) * .3 * S, .3);
    }
    else
    {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) add((i / 3 - .5) * 3 * S + (r() - .5) * .3 * S, (.16 + r() * .06) * S, (j / 2 - .5) * 2 * S, .42 + r() * .08);
    }
    return out;
}
