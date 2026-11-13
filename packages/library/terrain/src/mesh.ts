import { BIOMES } from "@polywar/terrain-material";
import type { River, TerrainData } from "./types";

/** `indices`: CPU copy of the triangles (kept for debug views, e.g. a wireframe) */
export type Mesh = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number; indices?: Uint32Array; x: number; y: number; z: number; radius: number };
type Attribute = [Float32Array, number];

export function upload(gl: WebGL2RenderingContext, attributes: Attribute[], indices: Uint32Array, shared?: WebGLBuffer): Omit<Mesh, "x" | "y" | "z" | "radius"> {
    const vao = gl.createVertexArray()!, buffers: WebGLBuffer[] = [];
    gl.bindVertexArray(vao);
    attributes.forEach(([values, size], location) => {
        const b = gl.createBuffer()!;
        buffers.push(b);
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    });
    let ib = shared;
    if (!ib) { ib = gl.createBuffer()!; buffers.push(ib); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    if (!shared) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, buffers, count: indices.length, indices };
}

export function free(gl: WebGL2RenderingContext, meshes: { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[] }[]) {
    for (const m of meshes) { gl.deleteVertexArray(m.vao); m.buffers.forEach(b => gl.deleteBuffer(b)); }
}

/** two triangles per cell, the diagonal alternates (no long ridges along one direction) */
export function grid(cells: number): Uint32Array {
    const v = cells + 1, out = new Uint32Array(cells * cells * 6);
    for (let j = 0, k = 0; j < cells; j++) for (let i = 0; i < cells; i++, k += 6)
    {
        const a = j * v + i;
        if ((i + j) & 1) out.set([a, a + v, a + 1, a + 1, a + v, a + v + 1], k);
        else out.set([a, a + v, a + v + 1, a, a + v + 1, a + 1], k);
    }
    return out;
}

/**
 * Flat ground from the map edge out to `skirt` metres: the far fields or the sea floor, in the edge's most common biome.
 * The inner edge follows the map every `segments`th of a side (the edge is faded flat, so few are needed).
 */
export function skirt(gl: WebGL2RenderingContext, d: TerrainData, level: number, skirtSize: number, fallback: number, segments = 32) {
    const n = d.n, half = d.size / 2, outer = half + skirtSize;
    const sides: ((t: number) => [number, number])[] = [t => [t, 0], t => [n - 1, t], t => [n - 1 - t, n - 1], t => [0, n - 1 - t]];
    const votes = new Map<number, number>();
    for (const side of sides) for (let t = 0; t < n; t++) { const [i, j] = side(t), b = d.biome[j * n + i]; votes.set(b, (votes.get(b) ?? 0) + 1); }
    const biome = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
    const pos: number[] = [], nor: number[] = [], data: number[] = [], idx: number[] = [];
    for (const side of sides)
    {
        const base = pos.length / 3;
        for (let s = 0; s <= segments; s++)
        {
            const [i, j] = side(Math.round(s / segments * (n - 1))), x = i * d.cell - half, z = j * d.cell - half;
            // out to the outer square, straight away from the map side (corners diagonal)
            const k = outer / Math.max(Math.abs(x), Math.abs(z), 1e-6);
            pos.push(x, d.height[j * n + i], z, x * k, level, z * k);
            nor.push(0, 1, 0, 0, 1, 0);
            data.push(biome, 0, .5, .5, biome, 0, .5, .5);
        }
        for (let s = 0; s < segments; s++)
        {
            const a = base + s * 2;
            idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
    }
    const m = upload(gl, [[new Float32Array(pos), 3], [new Float32Array(nor), 3], [new Float32Array(data), 4], [new Float32Array(pos.length / 3).fill(-1), 1], [new Float32Array(pos.length / 3).fill(d.seaLevel), 1]], new Uint32Array(idx));
    return { ...m, x: 0, y: level, z: 0, radius: outer * 1.5 };
}

/**
 * Water surfaces as quads: every cell (of `step` nodes) touching water of `kind` (1 ocean, 2 lake) at its surface level;
 * open water away from shores merged into big quads (quadtree, flat so no cracks).
 * Water material attributes: 1 (depth, shore distance), 2 (world x z, no flow, swell), 3 (toward land). Swell fades out near the map
 * border so the ocean ring (out to `skirt` metres, flat) meets it without gaps.
 */
export function waterMesh(gl: WebGL2RenderingContext, d: TerrainData, kind: 1 | 2, step: number, skirtSize = 0) {
    const n = d.n, half = d.size / 2, pos: number[] = [], info: number[] = [], flow: number[] = [], dir: number[] = [], idx: number[] = [];
    const fade = 12 * step;
    const land = (i: number, j: number) => d.toLand[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
    const quad = (corners: number[][]) => {
        const b = pos.length / 3;
        for (const [x, y, z, depth, shore, waves, gx = 0, gz = 0] of corners) { pos.push(x, y, z); info.push(depth, shore); flow.push(x, z, 0, waves); dir.push(gx, gz); }
        idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 2);
    };
    const emit = (i: number, j: number, i1: number, j1: number) => {
        const ks = [j * n + i, j * n + i1, j1 * n + i1, j1 * n + i];
        let level = -Infinity;
        for (const k of ks) if (d.water[k] === kind) level = Math.max(level, d.surface[k]);
        if (level === -Infinity) return;
        const xy = [[i, j], [i1, j], [i1, j1], [i, j1]];
        quad(ks.map((k, c) => {
            const [a, b] = xy[c], edge = Math.min(a, b, n - 1 - a, n - 1 - b);
            // toward land: down the shore distance, over a few nodes so it turns smoothly
            const r = 3 * step, gx = land(a - r, b) - land(a + r, b), gz = land(a, b - r) - land(a, b + r);
            return [a * d.cell - half, level, b * d.cell - half, level - d.height[k], d.toLand[k], d.waves[k] * Math.min(1, edge / fade), gx, gz];
        }));
    };
    // open water far from shore and border: one quad per block (quadtree), split down to `step` cells near shores
    const open = (i: number, j: number, s: number) => {
        if (i + s > n - 1 || j + s > n - 1 || Math.min(i, j, n - 1 - i - s, n - 1 - j - s) < fade) return false;
        const level = d.surface[j * n + i];
        let lo = Infinity, hi = -Infinity;
        for (let b = j; b <= j + s; b += step) for (let a = i; a <= i + s; a += step)
        {
            const k = b * n + a;
            if (d.water[k] !== kind || d.surface[k] !== level || d.toLand[k] < 40) return false;
            const depth = level - d.height[k];
            lo = Math.min(lo, depth); hi = Math.max(hi, depth);
        }
        return hi - lo < Math.max(3, lo * .3);
    };
    const block = (i: number, j: number, s: number) => {
        if (i >= n - 1 || j >= n - 1) return;
        if (s <= step) { emit(i, j, Math.min(n - 1, i + step), Math.min(n - 1, j + step)); return; }
        if (open(i, j, s)) { emit(i, j, i + s, j + s); return; }
        const h = s / 2;
        block(i, j, h); block(i + h, j, h); block(i, j + h, h); block(i + h, j + h, h);
    };
    const big = step * 32;
    for (let j = 0; j < n - 1; j += big) for (let i = 0; i < n - 1; i += big) block(i, j, big);
    if (kind === 1 && skirtSize > 0)
    {
        const o = half + skirtSize, y = d.seaLevel, deep = d.seaLevel + d.size, far = 1e4;
        for (const [x0, z0, x1, z1] of [[-o, -o, o, -half], [-o, half, o, o], [-o, -half, -half, half], [half, -half, o, half]])
            quad([[x0, y, z0, deep, far, 0], [x1, y, z0, deep, far, 0], [x1, y, z1, deep, far, 0], [x0, y, z1, deep, far, 0]]);
    }
    if (!idx.length) return null;
    return { ...upload(gl, [[new Float32Array(pos), 3], [new Float32Array(info), 2], [new Float32Array(flow), 4], [new Float32Array(dir), 2]], new Uint32Array(idx)), x: 0, y: 0, z: 0, radius: Infinity };
}

/**
 * Rivers as ribbons: the point lists smoothed (Chaikin), `width` wide at the surface level.
 * Water material attributes: 1 (depth, metres to the bank), 2 (across and along in metres, flow speed from the slope, no swell).
 */
export function riverMesh(gl: WebGL2RenderingContext, rivers: River[]) {
    const pos: number[] = [], info: number[] = [], flow: number[] = [], idx: number[] = [];
    for (const r of rivers)
    {
        let p = r.points;
        for (let it = 0; it < 2 && p.length > 2; it++)
        {
            const next: typeof p = [p[0]];
            for (let i = 0; i < p.length - 1; i++)
            {
                const a = p[i], b = p[i + 1];
                next.push(a.map((v, k) => v * .75 + b[k] * .25) as any, a.map((v, k) => v * .25 + b[k] * .75) as any);
            }
            next.push(p[p.length - 1]);
            p = next;
        }
        if (p.length < 2) continue;
        let along = 0;
        const base = pos.length / 3;
        for (let i = 0; i < p.length; i++)
        {
            const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
            let dx = b[0] - a[0], dz = b[2] - a[2];
            const l = Math.hypot(dx, dz) || 1;
            dx /= l; dz /= l;
            if (i > 0) along += Math.hypot(p[i][0] - p[i - 1][0], p[i][2] - p[i - 1][2]);
            const [x, y, z, w] = p[i], h = w / 2;
            // steeper runs flow faster
            const drop = Math.max(0, a[1] - b[1]) / l, speed = .6 + Math.min(3, drop * 60);
            pos.push(x - dz * h, y, z + dx * h, x, y, z, x + dz * h, y, z - dx * h);
            info.push(.2, 0, 1.2, h, .2, 0);
            flow.push(0, along, speed, 0, h, along, speed, 0, w, along, speed, 0);
            // three across (bank, middle, bank) so the bank foam and depth have something to blend
            if (i > 0) { const q = base + (i - 1) * 3; idx.push(q, q + 3, q + 1, q + 1, q + 3, q + 4, q + 1, q + 4, q + 2, q + 2, q + 4, q + 5); }
        }
    }
    if (!idx.length) return null;
    return { ...upload(gl, [[new Float32Array(pos), 3], [new Float32Array(info), 2], [new Float32Array(flow), 4]], new Uint32Array(idx)), x: 0, y: 0, z: 0, radius: Infinity };
}

export const BIOME = (name: typeof BIOMES[number]) => BIOMES.indexOf(name);
