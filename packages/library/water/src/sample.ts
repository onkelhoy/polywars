import type { Layer3D } from "@papit/game-engine";
import { WaterMaterial, bindUnder } from "./material";
import { CAUSTICS_GLSL, UNDER_GLSL } from "./shaders";
import type { Light, View, WaterLook } from "./types";

type Mesh = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number; indexed: boolean };
type V2 = [number, number];

const EXTENT = 600, CELL = 2, SEA = 0, LAKE = 6;
const LAKE_AT: V2 = [130, -60];
const RIVER: V2[] = [[62, -62], [25, -30], [-10, 0], [-45, 20], [-95, 35]];
const RIVER_WIDTH = 12, RIVER_DEPTH = 1.6;

const coast = (z: number) => -60 + 20 * Math.sin(z * .013) + 8 * Math.sin(z * .041 + 1);
const lakeRadius = (x: number, z: number) => { const a = Math.atan2(z - LAKE_AT[1], x - LAKE_AT[0]); return 70 + 8 * Math.sin(3 * a) + 4 * Math.sin(5 * a + 1); };

/** nearest point on the river line: distance, metres along it, signed distance across */
function onRiver(x: number, z: number) {
    let best = { dist: Infinity, along: 0, across: 0 }, run = 0;
    for (let i = 0; i < RIVER.length - 1; i++)
    {
        const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len)));
        const px = ax + dx * t, pz = az + dz * t, dist = Math.hypot(x - px, z - pz);
        if (dist < best.dist) best = { dist, along: run + t * len, across: ((x - ax) * dz - (z - az) * dx) / len };
        run += len;
    }
    return best;
}

/** metres along the river where it meets the sea */
const MOUTH = (() => {
    let run = 0;
    for (let i = 0; i < RIVER.length - 1; i++)
    {
        const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], len = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s <= len; s += .5) { const t = s / len; if (ax + (bx - ax) * t < coast(az + (bz - az) * t)) return run + s; }
        run += len;
    }
    return run;
})();
const riverSurface = (along: number) => Math.max(SEA, LAKE * (1 - along / MOUTH));

/** the bed: beach into the sea on the west, land rising east, a lake basin, a river carved from the lake to the sea */
function shape(x: number, z: number) {
    const d = x - coast(z);
    let h = d > 0 ? 10 * (1 - Math.exp(-d / 90)) + 2 * Math.sin(z * .02) * (1 - Math.exp(-d / 40)) : -30 * (1 - Math.exp(d / 150));
    const ld = Math.hypot(x - LAKE_AT[0], z - LAKE_AT[1]), r = lakeRadius(x, z), q = ld / r;
    h = Math.min(h, q < 1 ? LAKE - 5 * (1 - q * q) : LAKE + (ld - r) * .12);
    const rv = onRiver(x, z), half = RIVER_WIDTH / 2, surf = riverSurface(rv.along);
    if (rv.dist < half) h = Math.min(h, surf - RIVER_DEPTH * (1 - (rv.dist / half) ** 2));
    else h = Math.min(h, surf + (rv.dist - half) * .3);
    return h;
}

/** two pass chamfer: metres to the nearest node where `source` (grid `n`², `cell` metres) */
function distance(n: number, cell: number, source: (k: number) => boolean) {
    const d = new Float32Array(n * n), D = Math.SQRT2;
    for (let k = 0; k < n * n; k++) d[k] = source(k) ? 0 : 1e9;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    {
        const k = j * n + i;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + 1);
        if (j > 0) { v = Math.min(v, d[k - n] + 1); if (i > 0) v = Math.min(v, d[k - n - 1] + D); if (i < n - 1) v = Math.min(v, d[k - n + 1] + D); }
        d[k] = v;
    }
    for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--)
    {
        const k = j * n + i;
        let v = d[k];
        if (i < n - 1) v = Math.min(v, d[k + 1] + 1);
        if (j < n - 1) { v = Math.min(v, d[k + n] + 1); if (i < n - 1) v = Math.min(v, d[k + n + 1] + D); if (i > 0) v = Math.min(v, d[k + n - 1] + D); }
        d[k] = v;
    }
    for (let k = 0; k < n * n; k++) d[k] *= cell;
    return d;
}

const GROUND_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 color;
layout(location = 2) in float surface;
uniform mat4 view, projection;
out vec3 vWorld;
flat out vec3 vColor;
out float vSurface;
void main() { vWorld = position; vColor = color; vSurface = surface; gl_Position = projection * view * vec4(position, 1.0); }`;

const GROUND_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
flat in vec3 vColor;
in float vSurface;
uniform vec3 sunDirection, sunColor, sky, ground, fogColor, eye;
uniform float sunStrength, ambient, fogDensity, time, caustics;
uniform bool eyeUnder;
${UNDER_GLSL}
${CAUSTICS_GLSL}
out vec4 outColor;
void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;
    vec3 l = normalize(sunDirection);
    float sun = max(dot(n, l), 0.0), wet = vSurface - vWorld.y;
    vec3 light = mix(ground, sky, n.y * .5 + .5) * ambient + sunColor * sunStrength * sun;
    vec3 c = vColor * light;
    if (wet > 0.0) {
        // under water: sunlight fades with depth and takes the water's colour; caustics on top
        c = mix(c, vColor * underColorAt(wet) * 1.4, 1.0 - exp(-wet * .25));
        c += sunColor * sunStrength * causticsAt(vWorld.xz, time) * caustics * sun * exp(-wet * underSun * 1.5);
    }
    float dist = length(vWorld - eye);
    c = eyeUnder ? underFog(c, vWorld, eye) : mix(c, fogColor, 1.0 - exp(-dist * fogDensity));
    outColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;

const SAND: [number, number, number] = [.72, .64, .42], GRASS: [number, number, number] = [.3, .45, .18], MUD: [number, number, number] = [.42, .38, .27], ROCK: [number, number, number] = [.38, .37, .36];

/**
 * A stretch of coast at real scale (600 m square, metres): beach into the sea, a lake 6 m up, a river from the lake to the
 * sea, rocks in the water. The water material alone with what it is meant for (views, gallery). Draw your own models between
 * `drawGround` and `drawWater`; `heightAt` / `surfaceAt` place them.
 */
export class WaterSample {
    readonly material: WaterMaterial;
    readonly size: [number, number, number] = [EXTENT, 20, EXTENT];
    readonly seaLevel = SEA;
    readonly lakeLevel = LAKE;
    caustics = true;
    private gl: WebGL2RenderingContext;
    private n = EXTENT / CELL + 1;
    private heights: Float32Array;
    private ground: Mesh;
    private sea?: Mesh;
    private lake?: Mesh;
    private river?: Mesh;
    private program?: { name: string; program: WebGLProgram; u: Map<string, WebGLUniformLocation | null> };

    constructor(readonly layer: Layer3D, look: Partial<WaterLook> = {}) {
        this.gl = layer.gl;
        this.material = new WaterMaterial(layer, look);
        const n = this.n, half = EXTENT / 2;
        this.heights = new Float32Array(n * n);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.heights[j * n + i] = shape(i * CELL - half, j * CELL - half);
        this.ground = this.buildGround();
        // shore distances on a 1 m grid from the ground the eye sees (the triangles), signed: < 0 over land
        const fn = EXTENT + 1, at = (k: number) => this.heightAt((k % fn) - half, ((k / fn) | 0) - half);
        const signed = (wet: (k: number) => boolean) => {
            const toLand = distance(fn, 1, k => !wet(k)), toWater = distance(fn, 1, wet), out = new Float32Array(fn * fn);
            for (let k = 0; k < out.length; k++) out[k] = wet(k) ? toLand[k] - .5 : .5 - toWater[k];
            return out;
        };
        const sea = signed(k => at(k) < SEA && (k % fn) - half < coast(((k / fn) | 0) - half) + 2);
        const lake = signed(k => { const x = (k % fn) - half, z = ((k / fn) | 0) - half; return at(k) < LAKE && Math.hypot(x - LAKE_AT[0], z - LAKE_AT[1]) < lakeRadius(x, z) + 6; });
        this.sea = this.buildSurface(sea, SEA, true);
        this.lake = this.buildSurface(lake, LAKE, false);
        this.river = this.buildRiver();
        const name = `water-sample-${Math.random().toString(36).slice(2)}`;
        layer.createProgram(name, GROUND_VERTEX, GROUND_FRAGMENT).then(program => this.program = { name, program, u: new Map() });
    }

    /** ground height (the drawn triangles, bilinear) */
    heightAt(x: number, z: number) {
        const n = this.n, half = EXTENT / 2;
        const fx = Math.max(0, Math.min(n - 1.001, (x + half) / CELL)), fz = Math.max(0, Math.min(n - 1.001, (z + half) / CELL));
        const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = this.heights;
        return (h[j * n + i] * (1 - u) + h[j * n + i + 1] * u) * (1 - v) + (h[(j + 1) * n + i] * (1 - u) + h[(j + 1) * n + i + 1] * u) * v;
    }

    /** water surface over x z, or null when dry */
    surfaceAt(x: number, z: number): number | null {
        const h = this.heightAt(x, z), rv = onRiver(x, z);
        if (rv.dist < RIVER_WIDTH / 2 && rv.along < MOUTH && h < riverSurface(rv.along)) return riverSurface(rv.along);
        if (Math.hypot(x - LAKE_AT[0], z - LAKE_AT[1]) < lakeRadius(x, z) + 6) return h < LAKE ? LAKE : null;
        if (x < coast(z) + 2 || Math.abs(x) > EXTENT / 2 || Math.abs(z) > EXTENT / 2) return h < SEA || Math.abs(x) > EXTENT / 2 ? SEA : null;
        return null;
    }

    /** the surface over the eye when it is under water, else null */
    under(eye: { x: number; y: number; z: number }) {
        const s = this.surfaceAt(eye.x, eye.z);
        return s !== null && eye.y < s ? s : null;
    }

    draw(view: View, light: Light, time: number) {
        this.drawGround(view, light, time);
        this.drawWater(view, light, time);
    }

    drawGround(view: View, light: Light, time: number) {
        const gl = this.gl, p = this.program;
        if (!p) return;
        const u = (k: string) => p.u.has(k) ? p.u.get(k)! : (p.u.set(k, gl.getUniformLocation(p.program, k)), p.u.get(k)!);
        const e = view.worldPosition ?? { x: 0, y: 0, z: 0 }, surface = this.under(e);
        gl.useProgram(p.program);
        gl.uniformMatrix4fv(u("view"), false, new Float32Array(view.viewMatrix));
        gl.uniformMatrix4fv(u("projection"), false, new Float32Array(view.projectionMatrix));
        gl.uniform3f(u("eye"), e.x, e.y, e.z);
        gl.uniform3fv(u("sunDirection"), light.sunDirection);
        gl.uniform3fv(u("sunColor"), light.sunColor);
        gl.uniform1f(u("sunStrength"), light.sunStrength);
        gl.uniform3fv(u("sky"), light.sky);
        gl.uniform3fv(u("ground"), light.ground);
        gl.uniform1f(u("ambient"), light.ambient);
        gl.uniform3fv(u("fogColor"), light.fogColor);
        gl.uniform1f(u("fogDensity"), light.fogDensity);
        gl.uniform1f(u("time"), time);
        gl.uniform1f(u("caustics"), this.caustics ? this.material.look.under.caustics : 0);
        gl.uniform1i(u("eyeUnder"), surface !== null ? 1 : 0);
        bindUnder(gl, u, this.material.look.under, surface ?? 0);
        gl.enable(gl.DEPTH_TEST);
        this.mesh(this.ground);
    }

    drawWater(view: View, light: Light, time: number) {
        const gl = this.gl, e = view.worldPosition ?? { x: 0, y: 0, z: 0 }, surface = this.under(e);
        const cull = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (const [m, fresh, level] of [[this.river, true, null], [this.lake, true, LAKE], [this.sea, false, SEA]] as const)
        {
            // from below only the body the eye is in looks like a ceiling; the others draw as seen from above
            const under = surface !== null && (level === null ? false : Math.abs(surface - level) < .01);
            if (m && this.material.use(view, light, time, { fresh, under, surface: surface ?? 0 })) this.mesh(m);
        }
        gl.depthMask(true);
        if (cull) gl.enable(gl.CULL_FACE);
    }

    destroy() {
        for (const m of [this.ground, this.sea, this.lake, this.river]) if (m) { this.gl.deleteVertexArray(m.vao); m.buffers.forEach(b => this.gl.deleteBuffer(b)); }
        this.material.destroy();
        if (this.program) this.layer.deleteProgram(this.program.name);
    }

    // ---- building ----

    private wetLevel(x: number, z: number, h: number) {
        const s = this.surfaceAt(x, z);
        return s !== null && h < s ? s : -1e4;
    }

    private buildGround() {
        const n = this.n, half = EXTENT / 2, pos: number[] = [], col: number[] = [], wet: number[] = [], idx: number[] = [];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
        {
            const x = i * CELL - half, z = j * CELL - half, h = this.heights[j * n + i];
            const lake = Math.hypot(x - LAKE_AT[0], z - LAKE_AT[1]) < lakeRadius(x, z) + 2, river = onRiver(x, z).dist < RIVER_WIDTH / 2 + 2;
            pos.push(x, h, z);
            col.push(...(lake || river ? (h < LAKE - .3 || river ? MUD : SAND) : h < 2.2 ? SAND : GRASS));
            wet.push(this.wetLevel(x, z, h));
            if (i < n - 1 && j < n - 1) { const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
        }
        // rocks: low poly lumps in the shallows, the river and the lake
        const rocks: [number, number, number][] = [[-75, 10, 4], [-82, -12, 2.5], [-70, 40, 1.6], [-90, 60, 3.2], [-64, -40, 1.2], [5, -12, 1.4], [-30, 13, 1.1], [100, -40, 3], [150, -95, 2]];
        let seed = 3;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const t = (1 + Math.sqrt(5)) / 2, ico = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
        const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
        for (const [rx, rz, r] of rocks)
        {
            const base = pos.length / 3, y = this.heightAt(rx, rz), sx = .8 + rand() * .5, sz = .8 + rand() * .5;
            for (const [a, b, c] of ico)
            {
                const k = r / 1.9 * (.8 + rand() * .4), x = rx + a * k * sx, py = y + r * .35 + b * k * .9, z = rz + c * k * sz;
                pos.push(x, py, z);
                col.push(...ROCK);
                wet.push(this.wetLevel(rx, rz, -1e3));
            }
            for (const [a, b, c] of faces) idx.push(base + a, base + b, base + c);
        }
        // flat shading wants each triangle's colour from one vertex: unindex
        const P: number[] = [], C: number[] = [], W: number[] = [];
        for (let q = 0; q < idx.length; q += 3)
        {
            const last = idx[q + 2];
            for (let e = 0; e < 3; e++) { const v = idx[q + e]; P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); C.push(col[last * 3], col[last * 3 + 1], col[last * 3 + 2]); W.push(wet[v]); }
        }
        return this.upload([[P, 3], [C, 3], [W, 1]], null);
    }

    /** a water surface at `level` over every cell near `shore` > 0 (1 m grid); the sea also gets an open ring to the horizon */
    private buildSurface(shore: Float32Array, level: number, ring: boolean) {
        const fn = EXTENT + 1, half = EXTENT / 2, step = 3, pos: number[] = [], info: number[] = [], flow: number[] = [], idx: number[] = [];
        const s = (x: number, z: number) => shore[Math.min(fn - 1, Math.max(0, Math.round(z + half))) * fn + Math.min(fn - 1, Math.max(0, Math.round(x + half)))];
        const quad = (corners: [number, number, number, number][]) => {
            const b = pos.length / 3;
            for (const [x, z, depth, sh] of corners) { pos.push(x, level, z); info.push(depth, sh); flow.push(x, z, 0, 1); }
            idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 2);
        };
        for (let z = -half; z < half; z += step) for (let x = -half; x < half; x += step)
        {
            const cs: V2[] = [[x, z], [x + step, z], [x + step, z + step], [x, z + step]];
            if (cs.every(([a, b]) => s(a, b) < -2)) continue;
            quad(cs.map(([a, b]) => [a, b, level - this.heightAt(a, b), s(a, b)]));
        }
        if (ring)
        {
            const o = 4000, far = 1e4, deep = 40;
            for (const [x0, z0, x1, z1] of [[-o, -o, -half, o], [-half, half, coast(half) + 2, o], [-half, -o, coast(-half) + 2, -half]])
                quad([[x0, z0, deep, far], [x1, z0, deep, far], [x1, z1, deep, far], [x0, z1, deep, far]]);
        }
        return idx.length ? this.upload([[pos, 3], [info, 2], [flow, 4]], idx) : undefined;
    }

    /** a ribbon from the lake's edge to the sea: across / along metres and a speed from the slope */
    private buildRiver() {
        const pos: number[] = [], info: number[] = [], flow: number[] = [], idx: number[] = [], half = RIVER_WIDTH / 2 + 1;
        const pts: V2[] = [];
        for (let i = 0; i < RIVER.length - 1; i++)
        {
            const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], len = Math.hypot(bx - ax, bz - az), steps = Math.ceil(len / 3);
            for (let s = 0; s < steps; s++) pts.push([ax + (bx - ax) * s / steps, az + (bz - az) * s / steps]);
        }
        let along = 0, rows = 0;
        const across = [-1, -.5, 0, .5, 1];
        for (let i = 0; i < pts.length; i++)
        {
            if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            const [x, z] = pts[i];
            // starts out of the lake, ends where it meets the sea
            if (Math.hypot(x - LAKE_AT[0], z - LAKE_AT[1]) < lakeRadius(x, z) - 1 || along > MOUTH + 4) continue;
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            let dx = b[0] - a[0], dz = b[1] - a[1];
            const l = Math.hypot(dx, dz) || 1;
            dx /= l; dz /= l;
            const y = riverSurface(along) + .02, speed = 1.5;
            for (const c of across)
            {
                const px = x - dz * half * c, pz = z + dx * half * c;
                pos.push(px, y, pz);
                info.push(y - this.heightAt(px, pz), half - Math.abs(c) * half - 1);
                flow.push(c * half, along, speed, 0);
            }
            if (rows > 0) { const q = (rows - 1) * 5; for (let c = 0; c < 4; c++) idx.push(q + c, q + c + 5, q + c + 1, q + c + 1, q + c + 5, q + c + 6); }
            rows++;
        }
        return idx.length ? this.upload([[pos, 3], [info, 2], [flow, 4]], idx) : undefined;
    }

    private mesh(m: Mesh) {
        const gl = this.gl;
        gl.bindVertexArray(m.vao);
        if (m.indexed) gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
        else gl.drawArrays(gl.TRIANGLES, 0, m.count);
        gl.bindVertexArray(null);
    }

    private upload(attributes: [number[], number][], indices: number[] | null): Mesh {
        const gl = this.gl, vao = gl.createVertexArray()!, buffers: WebGLBuffer[] = [];
        gl.bindVertexArray(vao);
        attributes.forEach(([values, size], location) => {
            const b = gl.createBuffer()!;
            buffers.push(b);
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        });
        if (indices)
        {
            const ib = gl.createBuffer()!;
            buffers.push(ib);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
        }
        gl.bindVertexArray(null);
        return { vao, buffers, count: indices ? indices.length : attributes[0][0].length / attributes[0][1], indexed: !!indices };
    }
}
