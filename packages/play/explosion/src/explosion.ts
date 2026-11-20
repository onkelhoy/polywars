import type { Layer3D } from "@papit/game-engine";
import type { Layer } from "@polywar/smoke";
import { Vector3 } from "@papit/vector";
import { ShockFront } from "./front";
import { icosahedron, icosahedronBary, ring, spike } from "./meshes";
import type { Blast, Colour, ExplodeOptions, ExplosionLook, ExplosionSetting, FlashLight, SmokeLike, Vec3, View } from "./types";

// hot instance: a xyz radius | tint rgb heat (<0 lit solid, >1.5 white) | stretch xyz seed
const HOT = 12;
const GRAVITY = 9.81;

const HOT_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec4 a;
layout(location = 2) in vec4 b;
layout(location = 3) in vec4 c;
uniform mat4 view, projection;
uniform int mode;
out vec3 vWorld;
out vec4 vTone;
void main() {
    vec3 p;
    if (mode == 0) {
        // a ball turned about its own random axis, stretched along its way
        float s = c.w;
        vec3 axis = normalize(vec3(sin(s * 12.9), cos(s * 7.3), sin(s * 3.1 + 1.0)));
        float co = cos(s), si = sin(s);
        p = (position * co + cross(axis, position) * si + axis * dot(axis, position) * (1.0 - co)) * a.w;
        float l = min(length(c.xyz), 4.0);
        if (l > 1e-4) { vec3 d = normalize(c.xyz); p += d * dot(p, d) * l; }
        p += a.xyz;
    } else {
        // a spike from a.xyz along c.xyz, a.w wide at the base
        vec3 d = normalize(c.xyz);
        vec3 u = normalize(cross(d, abs(d.y) < .9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), v = cross(d, u);
        p = a.xyz + d * length(c.xyz) * position.y + (u * position.x + v * position.z) * a.w;
    }
    vWorld = p;
    vTone = b;
    gl_Position = projection * view * vec4(p, 1.0);
}`;
const HOT_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorld;
in vec4 vTone;
uniform vec3 sun, eye;
out vec4 outColor;
void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    float h = vTone.a;
    if (h < 0.0) {
        // a solid (rock): three flat bands
        float l = dot(n, sun);
        outColor = vec4(vTone.rgb * (l > .5 ? 1.15 : l > 0.0 ? .82 : .5), 1.0);
        return;
    }
    if (h > 1.5) { outColor = vec4(vTone.rgb, 1.0); return; }
    // fire: hotter on the faces that look at you, hard steps (no gradients)
    float f = h + (abs(dot(n, normalize(eye - vWorld))) - .55) * .5;
    vec3 c = f > .9 ? vec3(1.0, .98, .88) : f > .72 ? vec3(1.0, .85, .42) : f > .52 ? vec3(1.0, .56, .16)
        : f > .34 ? vec3(.86, .28, .07) : f > .2 ? vec3(.42, .16, .08) : vec3(.17, .14, .13);
    outColor = vec4(c * vTone.rgb, 1.0);
}`;

const MARK_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 colour;
uniform mat4 view, projection;
out vec3 vColour;
void main() {
    vColour = colour;
    gl_Position = projection * view * vec4(position, 1.0);
}`;
const MARK_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColour;
out vec4 outColor;
void main() { outColor = vec4(vColour, 1.0); }`;

const SHOCK_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 bary;
uniform mat4 view, projection;
uniform vec3 centre, tip, eye;
uniform float radius, width;
uniform int mode;
out vec3 vWorld;
out float vSide;
void main() {
    vec3 p;
    if (mode == 0) p = centre + position * radius;
    // a thin line from centre (tail) to tip, turned to face the eye
    else if (mode == 2) {
        p = mix(centre, tip, position.x);
        vec3 side = normalize(cross(tip - centre, eye - p));
        p += side * position.y * width;
        vSide = position.x;
    }
    // ring: x z on the unit circle, side 0 at the front, 1 behind it
    else p = centre + vec3(position.x, 0.0, position.y) * (radius - position.z * width) + vec3(0.0, .06, 0.0);
    vWorld = p;
    if (mode != 2) vSide = position.z;
    gl_Position = projection * view * vec4(p, 1.0);
}`;
const SHOCK_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorld;
in float vSide;
uniform mat4 view;
uniform vec3 eye, centre;
uniform float alpha, radius, bend, low, top;
uniform vec4 viewport;
uniform sampler2D scene;
uniform int mode, bent;
out vec4 outColor;
void main() {
    if (mode == 0) {
        if (vWorld.y < centre.y) discard;
        // smooth (the sphere's normal, not the facets)
        vec3 n = normalize(vWorld - centre);
        float rim = 1.0 - abs(dot(n, normalize(eye - vWorld))), w = fwidth(rim);
        // a white line on the edge: strongest at the ground (the air shoved along it), fading up, whitest again at the top
        float e = clamp((vWorld.y - centre.y) / radius, 0.0, 1.0);
        float where = low * (1.0 - smoothstep(0.0, .5, e)) + top * smoothstep(.45, 1.0, e);
        float line = smoothstep(.86 - w, .97, rim) * where;
        vec3 behind = vec3(1.0);
        float a = line;
        if (bent == 1) {
            // light bends through the shell: what is behind shifts along the edge, most just inside it
            vec3 vn = mat3(view) * n;
            vec2 uv = (gl_FragCoord.xy - viewport.xy) / viewport.zw;
            behind = texture(scene, uv - vn.xy * bend * rim * rim * (1.0 - rim * .5)).rgb * 1.04;
            a = 1.0;
        }
        outColor = vec4(mix(behind, vec3(1.0), line), a * alpha);
        return;
    }
    // grit line: dark, clear at the tail
    if (mode == 2) { outColor = vec4(.08, .07, .06, alpha * vSide); return; }
    // ring: a crisp bright front edge, a soft trail behind it
    float a = (1.0 - smoothstep(0.0, .3, vSide)) * .85 + (1.0 - vSide) * .2;
    outColor = vec4(1.0, 1.0, 1.0, a * alpha);
}`;

type Live = Blast & {
    shock: ShockFront; fire: number[][]; spikes: number[][]; dust: Colour; kicked: number; stages: Set<string>;
    fireLife: number; fireball: number; surge: number;
};
type Chunk = { p: Vec3; v: Vec3; r: number; seed: number; trail?: { position: Vec3; rate: number; stop(): void }; landed: number; spin: number };

let count = 0;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: Colour, b: Colour, t: number): Colour => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Fast, scary low poly explosions. `power` (kg TNT) sets the size, the speed and which stages run:
 * a very short flash, a fireball that pops and chars, a shock shell that bends the light with a white edge line (ground, top) + a ground ring
 * that kicks dust as it passes, a ground surge thrown out and swirling (bigger puffs to the rim, a ring),
 * then the vacuum: the middle is sucked up into a column. Big ones grow a mushroom cap, massive ones throw
 * rock on arcs with smoke trails that thicken. Smoke goes to the host's `@polywar/smoke`.
 * `update(dt)` then `draw(view)` each frame (after opaque things: the shock is see through).
 */
export class Explosion {
    readonly look: ExplosionLook = {
        sun: [.35, .85, .4], shock: 1, bend: .04, lineLow: 1, lineTop: .7,
        dust: [.74, .67, .5], smoke: [.52, .5, .48], char: [.24, .22, .21], rock: [.36, .31, .27],
    };
    /** time scale (slow motion for tuning) */
    speed = 1;
    /** live lights (flash, fireball) for the host's renderer */
    readonly lights: FlashLight[] = [];
    /** a mark left on the ground: clear grass there (`grass.clear(x, z, radius)`), later dig */
    onmark?: (x: number, z: number, radius: number) => void;
    /** marks kept at most (oldest go) */
    maxMarks = 200;
    private marks: number[][] = [];
    private markProgram?: { program: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
    private markBuffer: WebGLBuffer;
    private markVao: WebGLVertexArrayObject;
    private markCount = 0;
    /** every blast as it goes off (wire sound, force here) */
    onexplode?: (blast: Blast) => void;
    readonly blasts: Live[] = [];
    private chunks: Chunk[] = [];
    /** black streaks: grit and small stones, x y z vx vy vz age life */
    private grit: number[][] = [];
    private gl: WebGL2RenderingContext;
    private smoke: SmokeLike;
    private ground: (x: number, z: number) => number;
    private maxChunks: number;
    private hot?: { program: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
    private shock?: { program: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
    private ball: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; vertices: number };
    private spikeMesh: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer; vertices: number };
    private bubble: { vao: WebGLVertexArrayObject; vertices: number };
    private ringMesh: { vao: WebGLVertexArrayObject; vertices: number };
    private lineMesh: { vao: WebGLVertexArrayObject; vertices: number };
    private balls = new Float32Array(1024 * HOT);
    private spikeData = new Float32Array(256 * HOT);
    private sun = new Float32Array(3);
    private screen?: { texture: WebGLTexture; w: number; h: number };
    private eye = new Float32Array(3);

    constructor(layer: Layer3D, setting: ExplosionSetting) {
        const gl = this.gl = layer.gl;
        this.smoke = setting.smoke;
        this.ground = setting.ground ?? (() => 0);
        this.maxChunks = setting.chunks ?? 200;
        const id = count++;
        layer.createProgram(`pw-explosion-hot-${id}`, HOT_VERTEX, HOT_FRAGMENT).then(program => {
            const u: Record<string, WebGLUniformLocation | null> = {};
            for (const n of ["view", "projection", "mode", "sun", "eye"]) u[n] = gl.getUniformLocation(program, n);
            this.hot = { program, u };
        });
        layer.createProgram(`pw-explosion-shock-${id}`, SHOCK_VERTEX, SHOCK_FRAGMENT).then(program => {
            const u: Record<string, WebGLUniformLocation | null> = {};
            for (const n of ["view", "projection", "mode", "eye", "centre", "tip", "radius", "width", "alpha", "bend", "low", "top", "viewport", "scene", "bent"]) u[n] = gl.getUniformLocation(program, n);
            this.shock = { program, u };
        });
        layer.createProgram(`pw-explosion-mark-${id}`, MARK_VERTEX, MARK_FRAGMENT).then(program => {
            this.markProgram = { program, u: { view: gl.getUniformLocation(program, "view"), projection: gl.getUniformLocation(program, "projection") } };
        });
        this.markVao = gl.createVertexArray()!;
        gl.bindVertexArray(this.markVao);
        this.markBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.markBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        gl.bindVertexArray(null);
        this.ball = this.instanced(icosahedron(0), 1024);
        this.spikeMesh = this.instanced(spike(), 256);
        this.bubble = this.plain(icosahedronBary(3), [[0, 3, 0], [1, 3, 3]], 6);
        this.ringMesh = this.plain(ring(96), [[0, 3, 0], [1, 1, 3]], 4);
        this.lineMesh = this.plain(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0]), [[0, 3, 0]], 3);
    }

    private instanced(geometry: Float32Array, max: number) {
        const gl = this.gl, vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, max * HOT * 4, gl.DYNAMIC_DRAW);
        for (let i = 0; i < 3; i++)
        {
            gl.enableVertexAttribArray(i + 1);
            gl.vertexAttribPointer(i + 1, 4, gl.FLOAT, false, HOT * 4, i * 16);
            gl.vertexAttribDivisor(i + 1, 1);
        }
        gl.bindVertexArray(null);
        return { vao, buffer, vertices: geometry.length / 3 };
    }

    private plain(geometry: Float32Array, attributes: number[][], stride: number) {
        const gl = this.gl, vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
        for (const [location, n, offset] of attributes)
        {
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, n, gl.FLOAT, false, stride * 4, offset * 4);
        }
        gl.bindVertexArray(null);
        return { vao, vertices: geometry.length / stride };
    }

    /** set one off at `at` (on the ground) */
    explode(at: ArrayLike<number>, options: ExplodeOptions = {}): Blast {
        const power = Math.max(.01, options.power ?? 5), s = Math.cbrt(power), slow = Math.sqrt(s);
        const lw = Math.log10(power);
        const position: Vec3 = [at[0], at[1], at[2]];
        const blast: Live = {
            position, power, scale: s, slow, age: 0, front: 0,
            mushroom: smoothstep(2.3, 4, lw), volcano: smoothstep(2.1, 5, lw),
            shock: new ShockFront(power), fire: [], spikes: [], dust: options.dust ?? this.look.dust, kicked: 0, stages: new Set(),
            fireball: 1.5 * s, fireLife: .16 * slow, surge: 7 * s ** .9,
        };
        // fireball: a few blobs that pop out and char
        const n = Math.round(8 + 8 * blast.mushroom);
        for (let i = 0; i < n; i++)
        {
            const u = new Vector3(rand(-1, 1), rand(.1, 1), rand(-1, 1)).normalize();
            const k = rand(.1, .65) * blast.fireball;
            // x y z r  vx vy vz  life seed grow
            blast.fire.push([position[0] + u.x * k, position[1] + u.y * k, position[2] + u.z * k, blast.fireball * rand(.4, .75),
                u.x * blast.fireball * 3 / slow, u.y * blast.fireball * (3 + 4 * blast.mushroom) / slow, u.z * blast.fireball * 3 / slow,
                blast.fireLife * rand(.7, 1.3), Math.random() * 100]);
        }
        // dark lines: grit and small stones, low and fast, arcing down, fading out
        for (let i = 0, n = 14 + Math.round(10 * Math.random() + 6 * Math.min(1, lw / 3)); i < n; i++)
        {
            const a = Math.random() * Math.PI * 2, up = rand(.08, .8), v = rand(28, 70) * s ** .35;
            this.grit.push([position[0], position[1] + .1 * s, position[2], Math.cos(a) * Math.cos(up) * v, Math.sin(up) * v, Math.sin(a) * Math.cos(up) * v, 0, rand(.25, .7) * slow, .025 * Math.max(1, s ** .5)]);
        }
        // white spikes: thin, fast, gone in a blink
        for (let i = 0; i < 10 + Math.round(6 * Math.random()); i++)
        {
            const u = new Vector3(rand(-1, 1), rand(.15, 1.1), rand(-1, 1)).normalize();
            blast.spikes.push([u.x, u.y, u.z, rand(.6, 1.2), rand(.05, .09) * slow]);
        }
        this.blasts.push(blast);
        this.mark(position, s);
        this.onexplode?.(blast);
        return blast;
    }

    /**
     * A scorch on the ground: a ragged low poly burn (dark middle, a lighter churned rim, a few dark rays out),
     * following the ground. Cheap: one buffer for all marks, rebuilt when one is added.
     */
    private mark(at: Vec3, s: number) {
        const radius = 1.3 * s, n = 14, burn = this.look.char, soil = mix(this.look.dust, this.look.char, .55), tris: number[] = [];
        const y = (x: number, z: number) => this.ground(x, z) + .02 + radius * .002;
        const put = (x: number, z: number, c: Colour, lift = 0) => tris.push(x, y(x, z) + lift, z, c[0], c[1], c[2]);
        const rim = Array.from({ length: n }, () => rand(.75, 1.15)), core = Array.from({ length: n }, () => rand(.45, .7));
        for (let i = 0; i < n; i++)
        {
            const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2, j = (i + 1) % n;
            const p = (k: number, angle: number) => [at[0] + Math.cos(angle) * radius * k, at[2] + Math.sin(angle) * radius * k];
            const [ox, oz] = p(rim[i], a), [px, pz] = p(rim[j], b), [ix, iz] = p(core[i], a), [qx, qz] = p(core[j], b);
            // churned rim ring
            put(ox, oz, soil); put(px, pz, soil); put(qx, qz, soil, .001);
            put(ox, oz, soil); put(qx, qz, soil, .001); put(ix, iz, soil, .001);
            // burnt middle
            put(at[0], at[2], burn, .002); put(ix, iz, burn, .002); put(qx, qz, burn, .002);
            // a dark ray out now and then
            if (Math.random() < .35)
            {
                const m = (a + b) / 2, [tx, tz] = p(rim[i] * rand(1.3, 1.8), m), w = .09;
                const [lx, lz] = p(core[i] * .9, m - w), [rx, rz] = p(core[i] * .9, m + w);
                put(lx, lz, burn, .003); put(tx, tz, burn, .003); put(rx, rz, burn, .003);
            }
        }
        this.marks.push(tris);
        while (this.marks.length > this.maxMarks) this.marks.shift();
        const all = new Float32Array(this.marks.flat()), gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.markBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, all, gl.DYNAMIC_DRAW);
        this.markCount = all.length / 6;
        this.onmark?.(at[0], at[2], radius * 1.15);
    }

    /** 0..1 how blinding the flashes are at `eye` now (a white overlay on the host's screen) */
    glare(eye: ArrayLike<number>) {
        let g = 0;
        for (const b of this.blasts)
        {
            const f = this.flash(b);
            if (!f) continue;
            const d = Math.hypot(eye[0] - b.position[0], eye[1] - b.position[1], eye[2] - b.position[2]) / (b.scale * 60);
            g += f / (1 + d * d);
        }
        return Math.min(1, g);
    }

    /** 0..1 flash of a blast: on hard, gone in ~50 ms */
    private flash(b: Live) {
        const t = b.age / (.045 * b.slow ** .5);
        return t > 3 ? 0 : Math.exp(-t * t);
    }

    clear() {
        this.blasts.length = 0;
        for (const c of this.chunks) c.trail?.stop();
        this.chunks.length = 0;
        this.grit.length = 0;
        this.marks.length = 0;
        this.markCount = 0;
        this.lights.length = 0;
    }

    update(dt: number) {
        dt *= this.speed;
        this.lights.length = 0;
        for (let i = this.blasts.length - 1; i >= 0; i--)
        {
            const b = this.blasts[i];
            b.age += dt;
            b.front = b.shock.step(dt);
            this.stages(b);
            for (const f of b.fire)
            {
                const damp = Math.exp(-6 / b.slow * dt);
                f[4] *= damp; f[5] = f[5] * damp + b.fireball * .8 * b.mushroom / b.slow * dt; f[6] *= damp;
                f[0] += f[4] * dt; f[1] += f[5] * dt; f[2] += f[6] * dt;
            }
            const f = this.flash(b), heat = Math.max(0, 1 - b.age / b.fireLife);
            if (f > .01 || heat > 0)
                this.lights.push({
                    position: [b.position[0], b.position[1] + b.fireball, b.position[2]], colour: f > .3 ? [1, .97, .9] : [1, .62, .3],
                    intensity: f * 12 + heat * 3, range: b.scale * (30 + 30 * f),
                });
            if (b.age > 30 * b.slow && b.stages.has("suck")) this.blasts.splice(i, 1);
        }
        this.fly(dt);
        for (let i = this.grit.length - 1; i >= 0; i--)
        {
            const g = this.grit[i];
            if ((g[6] += dt) > g[7]) { this.grit.splice(i, 1); continue; }
            g[4] -= GRAVITY * dt;
            g[0] += g[3] * dt; g[1] += g[4] * dt; g[2] += g[5] * dt;
            if (g[1] < this.ground(g[0], g[2])) g[7] = g[6];
        }
    }

    /** runs each stage once, when its time comes */
    private stages(b: Live) {
        const at = b.position, s = b.scale, T = b.slow, z = b.front / s, once = (name: string, when: boolean) => when && !b.stages.has(name) && !!b.stages.add(name);
        const smoke = this.smoke, L = this.look, m = b.mushroom;

        if (once("surge", true))
        {
            const Rs = b.surge, drag = 2.6 / T, out = Rs * drag;
            // the surge: thrown out flat, swirling round, rolling; small and fast inside, big and late on the rim
            const layers: Layer[] = [
                { count: 46, shape: "ring", radius: .3 * s, outward: [out * .78, out * .98], tangent: [out * .08, out * .16], jitter: .12, speed: [0, .3 * s / T], spread: .3, life: [2.24 * T, 3.22 * T], size: [.25 * s, .9 * s], grow: 5 / T, drag, lift: .25 * s / T ** 2, swirl: .5 * s / T, roll: 1.2 * s / T, tumble: 2.2 / T, stretch: .05 * T / s, colour: b.dust, bright: 1, dim: .5 },
                { count: 34, shape: "ring", radius: .5 * s, outward: [out * .95, out * 1.12], tangent: [out * .1, out * .2], jitter: .12, speed: [0, .5 * s / T], spread: .3, life: [2.8 * T, 4.06 * T], delay: [0, .04 * T], size: [.3 * s, 1.9 * s], grow: 1.1 / T, drag, lift: .35 * s / T ** 2, swirl: .7 * s / T, roll: 1.6 * s / T, tumble: 1.6 / T, stretch: .04 * T / s, colour: mix(b.dust, L.smoke, .25), bright: 1, dim: .55 },
                // low wisps streaking out first, ground hugging
                { count: 20, link: false, shape: "ring", radius: .3 * s, outward: [out * 1.1, out * 1.5], tangent: [out * .1, out * .2], speed: [0, .1], spread: .2, life: [0.35 * T, 0.63 * T], size: [.08 * s, .22 * s], grow: 6 / T, drag: drag * 1.3, swirl: 0, stretch: .1 * T / s, shrink: .4, colour: b.dust, bright: .8, dim: .6 },
            ];
            smoke.burst({ layers }, at);
        }

        // the fireball chars: dark puffs where it was (they ride up with a mushroom)
        if (once("char", b.age > b.fireLife * .8))
        {
            const r = b.fireball;
            smoke.burst({ layers: [{ count: Math.round(10 + 20 * m), shape: "sphere", radius: r * .6, direction: [0, 1, 0], spread: .4, speed: [r * .3 / T, r * (1 + 3 * m) / T], life: [1.75 * T, 2.8 * T], size: [r * .35, r * .7], grow: 3 / T, drag: 1.6 / T, lift: r * .3 * (1 + 2 * m) / T ** 2, swirl: .4 * s / T, stretch: .03 * T / s, colour: L.char, bright: .5, dim: .5 }] }, [at[0], at[1] + r * .3, at[2]]);
        }

        // the vacuum: what was pushed out comes back in and goes up the middle, with a pop of smoke from the centre
        if (once("suck", b.age > .85 * T))
        {
            const Rs = b.surge, H = s * (3 + 8 * m) * (1 + 2 * m);
            smoke.field(at, { radius: Rs * .5, height: H, inward: Rs * .6 / T ** 2, up: Rs * (1.1 + 2 * m) / T ** 2, spin: Rs * .3 / T ** 2, life: 3.5 * T });
            const v = H * 1.6 / T;
            smoke.burst({ layers: [
                { count: Math.round(18 + 22 * m), shape: "sphere", radius: .3 * b.fireball, direction: [0, 1, 0], spread: .18, speed: [v * .4, v], life: [2.45 * T, 3.85 * T], delay: [0, .5 * T], size: [.35 * s, 1.2 * s * (1 + m)], grow: 2 / T, drag: 1.4 / T, lift: .4 * s / T ** 2, swirl: .6 * s / T, stretch: .02 * T / s, colour: mix(b.dust, L.smoke, .5), bright: .9, dim: .5 },
            ] }, at);
        }

        // mushroom: a cap that keeps rising and rolls over itself, fed by a stem
        if (m > 0 && once("cap", b.age > b.fireLife * .6))
        {
            const r = b.fireball, H = s * 5 * (1 + 2 * m), drag = .8 / T, v = H * drag * 1.1;
            smoke.burst({ layers: [
                { count: Math.round(40 + 80 * m), shape: "sphere", radius: r * .9, direction: [0, 1, 0], spread: .12, speed: [v * .85, v * 1.1], outward: [r * .2 / T, r * 1.2 / T], life: [4.2 * T, 5.6 * T], size: [r * .45, r * 1.1], grow: 1.4 / T, drag, lift: H * .04 / T ** 2, swirl: .8 * s / T, roll: r * 1.6 / T, tumble: -1 / T, stretch: .01 * T / s, colour: mix(L.char, L.smoke, .55), bright: 1, dim: .6 },
                { count: Math.round(30 * m), shape: "sphere", radius: r * .35, direction: [0, 1, 0], spread: .05, speed: [v * .2, v * .75], life: [3.5 * T, 4.9 * T], delay: [0, 1.2 * T], size: [r * .3, r * .6], grow: 1.4 / T, drag, lift: H * .03 / T ** 2, swirl: .5 * s / T, stretch: .01 * T / s, colour: mix(b.dust, L.smoke, .6), bright: .9, dim: .5 },
            ] }, at);
        }

        // volcano: rock thrown in a few jets, smoke trails behind
        if (b.volcano > 0 && once("rock", true))
        {
            const jets = 2 + Math.round(Math.random() * 4 * b.volcano), per = Math.round(1 + 7 * b.volcano), reach = 9 * s;
            for (let j = 0; j < jets; j++)
            {
                const a = Math.random() * Math.PI * 2, up = rand(.75, 1.25);
                const jet = new Vector3(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up));
                for (let i = 0; i < per && this.chunks.length < this.maxChunks; i++)
                {
                    const d = new Vector3(jet.x + rand(-.15, .15), jet.y + rand(-.1, .1), jet.z + rand(-.15, .15)).normalize();
                    const v = Math.sqrt(GRAVITY * reach) * rand(.6, 1.15), r = .2 * s ** .7 * rand(.5, 1.3);
                    const p: Vec3 = [at[0] + d.x * b.fireball * .3, at[1] + b.fireball * .3, at[2] + d.z * b.fireball * .3];
                    const trail = smoke.emitter({ layers: [{ count: 8, direction: [0, 1, 0], spread: .3, speed: [0, .3], life: [6, 10], size: [r * 1.5, r * 7], grow: .4, drag: 1.5, lift: .25, swirl: .3, stretch: .02, colour: mix(L.char, L.smoke, .4), bright: .8, dim: .5 }] }, p);
                    this.chunks.push({ p, v: [d.x * v, d.y * v, d.z * v], r, seed: Math.random() * 100, trail, landed: 0, spin: rand(4, 10) });
                }
            }
        }

        // the ground ring kicks dust where it passes
        const step = Math.max(1.2, s * 1.3);
        if (z > 1.2 && z < 16 && b.front - b.kicked > step)
        {
            b.kicked = b.front;
            const k = Math.round(10 + 8 * Math.min(1, b.front / (40 * s))), fade = 1 - smoothstep(4, 16, z);
            for (let i = 0; i < k; i++)
            {
                if (Math.random() > .6) continue;
                const a = Math.random() * Math.PI * 2, x = at[0] + Math.cos(a) * b.front, zz = at[2] + Math.sin(a) * b.front;
                const r = s * (.12 + .22 * fade);
                smoke.burst({ layers: [{ count: 1, direction: [Math.cos(a), .5, Math.sin(a)], spread: .3, speed: [r * 2, r * 4], life: [.5, .9], size: [r * .4, r], grow: 6, drag: 3, lift: .2, swirl: .2, stretch: .08, colour: b.dust, bright: .9, dim: .6, shrink: .5, link: false }] }, [x, this.ground(x, zz), zz]);
            }
        }
    }

    private fly(dt: number) {
        for (let i = this.chunks.length - 1; i >= 0; i--)
        {
            const c = this.chunks[i];
            if (c.landed)
            {
                if ((c.landed += dt) > 4) this.chunks.splice(i, 1);
                continue;
            }
            const drag = Math.exp(-.08 * dt);
            c.v[0] *= drag; c.v[1] = c.v[1] * drag - GRAVITY * dt; c.v[2] *= drag;
            c.p[0] += c.v[0] * dt; c.p[1] += c.v[1] * dt; c.p[2] += c.v[2] * dt;
            if (c.trail) { c.trail.position = [c.p[0], c.p[1], c.p[2]]; c.trail.rate = Math.min(1, Math.hypot(c.v[0], c.v[1], c.v[2]) / 25); }
            const g = this.ground(c.p[0], c.p[2]);
            if (c.p[1] <= g + c.r)
            {
                c.p[1] = g + c.r * .5;
                c.landed = dt;
                c.trail?.stop();
                c.trail = undefined;
                const r = c.r * 4;
                this.smoke.burst({ layers: [{ count: 4, shape: "sphere", radius: c.r, direction: [0, 1, 0], spread: .7, speed: [r, r * 3], life: [1.2, 2.2], size: [r * .3, r], grow: 4, drag: 2.5, lift: .2, swirl: .3, colour: this.look.dust, bright: .9 }] }, c.p);
            }
        }
    }

    draw(view: View) {
        const gl = this.gl;
        if (!this.hot || !this.shock) return;
        const vm = view.viewMatrix, viewM = new Float32Array(vm as ArrayLike<number>), projection = new Float32Array(view.projectionMatrix as ArrayLike<number>);
        // eye from the view matrix: -Rᵀ t
        this.eye[0] = -(vm[0] * vm[12] + vm[1] * vm[13] + vm[2] * vm[14]);
        this.eye[1] = -(vm[4] * vm[12] + vm[5] * vm[13] + vm[6] * vm[14]);
        this.eye[2] = -(vm[8] * vm[12] + vm[9] * vm[13] + vm[10] * vm[14]);
        const sun = new Vector3(this.look.sun[0], this.look.sun[1], this.look.sun[2]).normalize();
        this.sun[0] = sun.x; this.sun[1] = sun.y; this.sun[2] = sun.z;

        // hot things: flash, fireball, spikes, rock
        const B = this.balls, S = this.spikeData;
        let n = 0, ns = 0;
        const ball = (x: number, y: number, z: number, r: number, tint: Colour, heat: number, seed: number, sx = 0, sy = 0, sz = 0) => {
            if (n >= 1024) return;
            const k = n++ * HOT;
            B[k] = x; B[k + 1] = y; B[k + 2] = z; B[k + 3] = r;
            B[k + 4] = tint[0]; B[k + 5] = tint[1]; B[k + 6] = tint[2]; B[k + 7] = heat;
            B[k + 8] = sx; B[k + 9] = sy; B[k + 10] = sz; B[k + 11] = seed;
        };
        for (const b of this.blasts)
        {
            const p = b.position, f = this.flash(b);
            if (f > .05) ball(p[0], p[1] + b.fireball * .4, p[2], b.fireball * (.6 + 1.1 * (1 - f)), [1, 1, 1], 2, 1);
            for (const fb of b.fire)
            {
                const t = b.age / fb[7];
                if (t >= 1) continue;
                // pops to full size in a blink, then shrinks as it chars
                const r = fb[3] * (1 - Math.exp(-b.age * 60 / b.slow)) * (1 - smoothstep(.55, 1, t) * .7);
                ball(fb[0], fb[1], fb[2], r, [1, 1, 1], 1.05 - t * 1.1, fb[8] + b.age * 3, fb[4] * .01, fb[5] * .01, fb[6] * .01);
            }
            for (const sp of b.spikes)
            {
                const t = b.age / sp[4];
                if (t >= 1 || ns >= 256) continue;
                const len = b.fireball * sp[3] * (1.5 + 5 * Math.sqrt(t)), k = ns++ * HOT, o = b.fireball * .3 * t;
                S[k] = p[0] + sp[0] * o; S[k + 1] = p[1] + sp[1] * o; S[k + 2] = p[2] + sp[2] * o; S[k + 3] = b.fireball * .07 * (1 - t);
                S[k + 4] = S[k + 5] = S[k + 6] = 1; S[k + 7] = 2;
                S[k + 8] = sp[0] * len; S[k + 9] = sp[1] * len; S[k + 10] = sp[2] * len; S[k + 11] = 0;
            }
        }
        for (const c of this.chunks)
        {
            const shrink = c.landed ? 1 - smoothstep(2.5, 4, c.landed) : 1;
            if (shrink > 0) ball(c.p[0], c.p[1], c.p[2], c.r * shrink, this.look.rock, -1, c.seed + (c.landed ? 0 : performance.now() * .001 * c.spin));
        }

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
        if (this.markProgram && this.markCount)
        {
            // pulled toward the eye a little: no fighting with the ground
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(-2, -4);
            gl.useProgram(this.markProgram.program);
            gl.uniformMatrix4fv(this.markProgram.u.view, false, viewM);
            gl.uniformMatrix4fv(this.markProgram.u.projection, false, projection);
            gl.bindVertexArray(this.markVao);
            gl.drawArrays(gl.TRIANGLES, 0, this.markCount);
            gl.disable(gl.POLYGON_OFFSET_FILL);
        }
        const { program, u } = this.hot;
        gl.useProgram(program);
        gl.uniformMatrix4fv(u.view, false, viewM);
        gl.uniformMatrix4fv(u.projection, false, projection);
        gl.uniform3fv(u.sun, this.sun);
        gl.uniform3fv(u.eye, this.eye);
        if (n)
        {
            gl.uniform1i(u.mode, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.ball.buffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, B, 0, n * HOT);
            gl.bindVertexArray(this.ball.vao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, this.ball.vertices, n);
        }
        if (ns)
        {
            gl.uniform1i(u.mode, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.spikeMesh.buffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, S, 0, ns * HOT);
            gl.bindVertexArray(this.spikeMesh.vao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, this.spikeMesh.vertices, ns);
        }

        // shock: a see through shell that bends what is behind it + ground rings
        const sh = this.shock, live = this.blasts.filter(b => b.front / b.scale < 24);
        if (!live.length && !this.grit.length) return;
        const vp = gl.getParameter(gl.VIEWPORT) as Int32Array, bending = this.look.bend > 0 && live.some(b => b.front / b.scale < 9);
        if (bending)
        {
            // the frame so far, to look through
            if (!this.screen || this.screen.w !== vp[2] || this.screen.h !== vp[3])
            {
                if (this.screen) gl.deleteTexture(this.screen.texture);
                const texture = gl.createTexture()!;
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vp[2], vp[3], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                this.screen = { texture, w: vp[2], h: vp[3] };
            }
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.screen.texture);
            gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, vp[0], vp[1], vp[2], vp[3]);
        }
        gl.useProgram(sh.program);
        gl.uniformMatrix4fv(sh.u.view, false, viewM);
        gl.uniformMatrix4fv(sh.u.projection, false, projection);
        gl.uniform3fv(sh.u.eye, this.eye);
        gl.uniform1f(sh.u.bend, this.look.bend);
        gl.uniform1f(sh.u.low, this.look.lineLow);
        gl.uniform1f(sh.u.top, this.look.lineTop);
        gl.uniform4f(sh.u.viewport, vp[0], vp[1], vp[2], vp[3]);
        gl.uniform1i(sh.u.scene, 0);
        gl.uniform1i(sh.u.bent, bending ? 1 : 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (const b of live)
        {
            const z = b.front / b.scale, p = b.position;
            gl.uniform3f(sh.u.centre, p[0], this.ground(p[0], p[2]), p[2]);
            gl.uniform1f(sh.u.radius, b.front);
            const bubble = (1 - smoothstep(1.5, 9, z)) * this.look.shock;
            if (bubble > .01)
            {
                gl.uniform1i(sh.u.mode, 0);
                gl.uniform1f(sh.u.alpha, bubble);
                gl.bindVertexArray(this.bubble.vao);
                gl.drawArrays(gl.TRIANGLES, 0, this.bubble.vertices);
            }
            const ringA = (1 - smoothstep(3, 24, z)) * this.look.shock;
            if (ringA > .01)
            {
                gl.uniform1i(sh.u.mode, 1);
                gl.uniform1f(sh.u.width, b.front * .06 + .15 * b.scale);
                gl.uniform1f(sh.u.alpha, ringA);
                gl.bindVertexArray(this.ringMesh.vao);
                gl.drawArrays(gl.TRIANGLES, 0, this.ringMesh.vertices);
            }
        }
        // grit: thin dark lines, the tail behind it along its way, fading out
        if (this.grit.length)
        {
            gl.uniform1i(sh.u.mode, 2);
            gl.bindVertexArray(this.lineMesh.vao);
            for (const g of this.grit)
            {
                const t = g[6] / g[7], lag = Math.min(g[6], .1);
                gl.uniform3f(sh.u.centre, g[0] - g[3] * lag, g[1] - g[4] * lag, g[2] - g[5] * lag);
                gl.uniform3f(sh.u.tip, g[0], g[1], g[2]);
                gl.uniform1f(sh.u.width, g[8]);
                gl.uniform1f(sh.u.alpha, (1 - t) * .9);
                gl.drawArrays(gl.TRIANGLES, 0, this.lineMesh.vertices);
            }
        }
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
    }
}
