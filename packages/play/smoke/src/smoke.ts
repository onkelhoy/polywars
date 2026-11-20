import type { Layer3D } from "@papit/game-engine";
import { PRESETS, WHITE } from "./presets";
import type { BurstOptions, Colour, Emitter, Layer, Preset, SmokeLook, SmokeSetting, Vec3, View } from "./types";

// puff fields (one Float32Array, STRIDE per puff)
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, R0 = 8, R1 = 9, GROW = 10, DRAG = 11, LIFT = 12,
    SWIRL = 13, STRETCH = 14, CR = 15, CG = 16, CB = 17, BRIGHT = 18, DIM = 19, SHRINK = 20, GROUND = 21, SEED = 22;
const STRIDE = 23;
// instance: x y z radius | stretch xyz seed | r g b bright
const INSTANCE = 12;
/** the blob's reach (field 0) in puff radii; tight = bumpy edges, little filler. A lone puff at the default threshold ends near its radius */
const REACH = 1.25;

// pass 1: every puff adds a soft blob into the field (normal, weight | colour, bright | depth)
const PUFF_VERTEX = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 puff;
layout(location = 2) in vec4 motion;
layout(location = 3) in vec4 tone;
uniform mat4 view, projection;
out vec2 vUv;
out vec3 vView;
out float vRadius;
out vec4 vTone;
void main() {
    vec3 c = (view * vec4(puff.xyz, 1.0)).xyz;
    // stretched along the screen way it moves (speed + wind): head stays, tail trails
    vec2 d = (mat3(view) * motion.xyz).xy;
    float l = min(length(d), 4.0);
    vec2 ax = l > 1e-4 ? normalize(d) : vec2(1.0, 0.0), ay = vec2(-ax.y, ax.x);
    float k = 1.0 + l;
    vec2 local = corner * ${REACH.toFixed(3)};
    vec2 o = (ax * local.x * k + ay * local.y - ax * (k - 1.0) * .5) * puff.w;
    vView = c + vec3(o, 0.0);
    vUv = local;
    vRadius = puff.w;
    vTone = tone;
    gl_Position = projection * vec4(vView, 1.0);
}`;
const PUFF_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vView;
in float vRadius;
in vec4 vTone;
layout(location = 0) out vec4 field;
layout(location = 1) out vec4 tone;
layout(location = 2) out vec4 depth;
void main() {
    float s = length(vUv) / ${REACH.toFixed(3)};
    if (s >= 1.0) discard;
    float w = (1.0 - s * s) * (1.0 - s * s);
    float r = length(vUv);
    vec3 n = r < 1.0 ? vec3(vUv, sqrt(1.0 - r * r)) : vec3(vUv / r, 0.0);
    // normals lean to the nearest puff: the balls still read inside the merged shape
    field = vec4(n * w * w, w);
    tone = vTone * w;
    depth = vec4(-(vView.z + n.z * vRadius) * w, 0.0, 0.0, 0.0);
}`;

// pass 2: cut the field at the threshold, toon shade the merged surface
const MERGE_VERTEX = `#version 300 es
out vec2 vUv;
void main() { vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0); vUv = p * .5 + .5; gl_Position = vec4(p, 0.0, 1.0); }`;
const MERGE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D fieldMap, toneMap, depthMap;
uniform vec3 sun, shade;
uniform float threshold, highlight;
uniform vec2 project;
out vec4 outColor;
void main() {
    vec4 f = texture(fieldMap, vUv);
    float w = f.w, aa = fwidth(w) * .75 + 1e-4;
    float cover = smoothstep(threshold - aa, threshold + aa, w);
    if (cover <= 0.0) discard;
    vec3 n = normalize(f.xyz + vec3(0.0, 0.0, 1e-4));
    vec4 t = texture(toneMap, vUv) / w;
    vec3 base = t.rgb;
    float bright = t.a, l = dot(n, sun);
    vec3 col;
    if (l > .62) col = mix(base, vec3(1.0), highlight * (.45 + .55 * bright));
    else if (l > .15) col = mix(base, vec3(1.0), highlight * .25 * bright);
    else if (l > -.3) col = base * mix(vec3(1.0), shade, .5);
    else col = base * shade;
    outColor = vec4(col * cover, cover);
    float d = max(texture(depthMap, vUv).r / w, .01);
    gl_FragDepth = ((project.x * -d + project.y) / d) * .5 + .5;
}`;

let count = 0;
const rand = (r: [number, number]) => r[0] === r[1] ? r[0] : r[0] + Math.random() * (r[1] - r[0]);
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Stylized toon smoke. Puffs are soft blobs added into one field, cut at a threshold: near puffs merge with
 * filler between them, lone ones stay round balls, stretched ones deform along their way. The merged shape gets
 * flat bands (white top, body, cool shadow) and the scene's depth. Puffs burst out, brake, rise, get dragged by
 * the wind, roll in on themselves and shrink away.
 * `update(dt)` then `draw(view)` each frame (after the opaque scene).
 */
export class Smoke {
    readonly presets: Record<string, Preset>;
    readonly look: SmokeLook = { sun: [.35, .85, .4], wind: [0, 0, 0], shade: [.72, .74, .84], highlight: .8, threshold: .13, resolution: .5 };
    /** time scale (slow motion for tuning) */
    speed = 1;
    private gl: WebGL2RenderingContext;
    private puffProgram?: WebGLProgram;
    private mergeProgram?: WebGLProgram;
    private uniforms: Record<string, WebGLUniformLocation | null> = {};
    private max: number;
    private data: Float32Array;
    private live = 0;
    private instances: Float32Array;
    private vao: WebGLVertexArrayObject;
    private empty: WebGLVertexArrayObject;
    private buffer: WebGLBuffer;
    private quad: WebGLBuffer;
    private target?: { fbo: WebGLFramebuffer; textures: WebGLTexture[]; width: number; height: number };
    private ground: (x: number, z: number) => number;
    private emitters: (Emitter & { preset: Preset; carry: number[]; on: boolean })[] = [];
    private time = 0;
    private sunView = new Float32Array(3);

    constructor(layer: Layer3D, setting: SmokeSetting = {}) {
        const gl = this.gl = layer.gl;
        gl.getExtension("EXT_color_buffer_float");
        this.max = setting.puffs ?? 4000;
        this.ground = setting.ground ?? (() => 0);
        this.presets = { ...PRESETS, ...setting.presets };
        this.data = new Float32Array(this.max * STRIDE);
        this.instances = new Float32Array(this.max * INSTANCE);
        const id = count++;
        layer.createProgram(`pw-smoke-puff-${id}`, PUFF_VERTEX, PUFF_FRAGMENT).then(program => {
            this.puffProgram = program;
            for (const n of ["view", "projection"]) this.uniforms[n] = gl.getUniformLocation(program, n);
        });
        layer.createProgram(`pw-smoke-merge-${id}`, MERGE_VERTEX, MERGE_FRAGMENT).then(program => {
            this.mergeProgram = program;
            for (const n of ["fieldMap", "toneMap", "depthMap", "sun", "shade", "threshold", "highlight", "project"]) this.uniforms[n] = gl.getUniformLocation(program, n);
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
        at(1, 4, 0); at(2, 4, 4); at(3, 4, 8);
        gl.bindVertexArray(null);
        this.empty = gl.createVertexArray()!;
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
            const life = d[o + LIFE];
            if (age >= life) { this.remove(i); continue; }
            const damp = Math.exp(-d[o + DRAG] * dt);
            d[o + VX] *= damp; d[o + VY] = d[o + VY] * damp + d[o + LIFT] * dt; d[o + VZ] *= damp;
            // the flow: a swirling field that gets stronger as the puff ages (rolls in on itself),
            // the wind drags more the older and higher it is
            const x = d[o + PX], y = d[o + PY], z = d[o + PZ], k = age / life;
            const s = d[o + SWIRL] * (.4 + 1.6 * k), seed = d[o + SEED];
            const fx = Math.sin(z * .37 + t * .7 + seed) * Math.cos(y * .41 - t * .3);
            const fy = Math.sin(x * .33 - t * .5) * Math.cos(z * .29 + t * .4 + seed) * .6;
            const fz = Math.sin(y * .39 + t * .6) * Math.cos(x * .31 + t * .2 + seed);
            const drag = Math.min(1, .3 + k * 1.4) * (1 + Math.max(0, y - this.ground(x, z)) * .03);
            d[o + PX] = x + (d[o + VX] + fx * s + w[0] * drag) * dt;
            d[o + PY] = y + (d[o + VY] + fy * s + w[1] * drag) * dt;
            d[o + PZ] = z + (d[o + VZ] + fz * s + w[2] * drag) * dt;
            if (d[o + GROUND])
            {
                // sit on the ground, flat bottomed: a little sunk, slide along it
                const floor = this.ground(d[o + PX], d[o + PZ]) + this.radius(o) * .1;
                if (d[o + PY] < floor) { d[o + PY] = floor; if (d[o + VY] < 0) d[o + VY] = 0; }
            }
        }
    }

    draw(view: View) {
        const gl = this.gl;
        if (!this.puffProgram || !this.mergeProgram) return;
        const d = this.data, out = this.instances, w = this.look.wind;
        let n = 0;
        for (let i = 0; i < this.live; i++)
        {
            const o = i * STRIDE, age = d[o + AGE];
            if (age < 0) continue;
            const t = age / d[o + LIFE];
            const radius = this.radius(o) * (1 - smoothstep(d[o + SHRINK], 1, t));
            if (radius <= .001) continue;
            const k = n++ * INSTANCE, st = d[o + STRETCH], wk = .3 + t;
            out[k] = d[o + PX]; out[k + 1] = d[o + PY]; out[k + 2] = d[o + PZ]; out[k + 3] = radius;
            out[k + 4] = (d[o + VX] + w[0] * wk) * st; out[k + 5] = (d[o + VY] + w[1] * wk) * st; out[k + 6] = (d[o + VZ] + w[2] * wk) * st; out[k + 7] = d[o + SEED];
            out[k + 8] = d[o + CR]; out[k + 9] = d[o + CG]; out[k + 10] = d[o + CB];
            out[k + 11] = d[o + BRIGHT] * (1 - smoothstep(0, d[o + DIM], t));
        }
        if (!n) return;

        // where the scene draws: put back after
        const screen = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const port = gl.getParameter(gl.VIEWPORT) as Int32Array;
        const target = this.resize(Math.max(1, Math.round(port[2] * this.look.resolution)), Math.max(1, Math.round(port[3] * this.look.resolution)));

        // pass 1: the field
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        gl.viewport(0, 0, target.width, target.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.puffProgram);
        gl.uniformMatrix4fv(this.uniforms.view, false, new Float32Array(view.viewMatrix as ArrayLike<number>));
        gl.uniformMatrix4fv(this.uniforms.projection, false, new Float32Array(view.projectionMatrix as ArrayLike<number>));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, out, 0, n * INSTANCE);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(this.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

        // pass 2: merge onto the scene, its depth tests against the scene's
        gl.bindFramebuffer(gl.FRAMEBUFFER, screen);
        gl.viewport(port[0], port[1], port[2], port[3]);
        const v = view.viewMatrix, s = this.look.sun, p = view.projectionMatrix;
        for (let r = 0; r < 3; r++) this.sunView[r] = v[r] * s[0] + v[4 + r] * s[1] + v[8 + r] * s[2];
        const l = Math.hypot(this.sunView[0], this.sunView[1], this.sunView[2]) || 1;
        for (let r = 0; r < 3; r++) this.sunView[r] /= l;
        gl.useProgram(this.mergeProgram);
        target.textures.forEach((texture, i) => {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, texture);
        });
        gl.uniform1i(this.uniforms.fieldMap, 0);
        gl.uniform1i(this.uniforms.toneMap, 1);
        gl.uniform1i(this.uniforms.depthMap, 2);
        gl.uniform3fv(this.uniforms.sun, this.sunView);
        gl.uniform3fv(this.uniforms.shade, this.look.shade);
        gl.uniform1f(this.uniforms.threshold, this.look.threshold);
        gl.uniform1f(this.uniforms.highlight, this.look.highlight);
        gl.uniform2f(this.uniforms.project, p[10], p[14]);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this.empty);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0);
    }

    destroy() {
        const gl = this.gl;
        gl.deleteVertexArray(this.vao);
        gl.deleteVertexArray(this.empty);
        gl.deleteBuffer(this.buffer);
        gl.deleteBuffer(this.quad);
        if (this.target) { gl.deleteFramebuffer(this.target.fbo); this.target.textures.forEach(t => gl.deleteTexture(t)); }
    }

    /** the field buffer: 3 half float targets */
    private resize(width: number, height: number) {
        if (this.target && this.target.width === width && this.target.height === height) return this.target;
        const gl = this.gl;
        if (this.target) { gl.deleteFramebuffer(this.target.fbo); this.target.textures.forEach(t => gl.deleteTexture(t)); }
        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        const textures = [0, 1, 2].map(i => {
            const t = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
            return t;
        });
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
        return this.target = { fbo, textures, width, height };
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
