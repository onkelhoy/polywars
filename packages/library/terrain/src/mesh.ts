import { BIOMES } from "@polywar/terrain-material";
import type { TerrainData } from "./types";

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
export function waterMesh(gl: WebGL2RenderingContext, d: TerrainData, kind: 1 | 2, step: number, skirtSize = 0, sub = -1) {
    // `sub`: only water of this `waterKind` (-1 any)
    const is = (k: number) => d.water[k] === kind && (sub < 0 || (d.waterKind?.[k] ?? 0) === sub);
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
        for (const k of ks) if (is(k)) level = Math.max(level, d.surface[k]);
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
            if (!is(k) || d.surface[k] !== level || d.toLand[k] < 40) return false;
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

/** metres the river sheet's edge stays under the bank */
const LIP = .1;

/**
 * River water (`water` 3) as one sheet over the grid: every cell with a river node outside the sea / lake quads (`step` cells
 * with a still corner, see `waterMesh`), each vertex at its node's surface; a land corner takes the lowest river surface next to it but stays under
 * that node's ground, so the sheet runs a little into the banks and the ground always hides its edge (hydrology `seal` keeps
 * banks above the water where it can). Shared vertices: no cracks.
 * Water material attributes: 1 (depth, metres to the bank), 2 (world x z, still: no flow), 3 (toward land: none), 4 (salt: sea
 * colours near the sea).
 */
export function riverSheet(gl: WebGL2RenderingContext, d: TerrainData, step = 1) {
    const n = d.n, half = d.size / 2, W = d.water, still = (k: number) => W[k] === 1 || W[k] === 2;
    const vert = new Int32Array(n * n).fill(-1), pos: number[] = [], info: number[] = [], flow: number[] = [], dir: number[] = [], salt: number[] = [], idx: number[] = [];
    // near the sea the colours go over to the sea's (no blocky colour step at a mouth)
    const SALT = d.cell * 8;
    /** surface a node gets in the sheet: its own (river), else the lowest river surface among its 8 neighbours (beside a fall: the pool's) */
    const level = (k: number) => {
        if (W[k]) return d.surface[k];
        const i = k % n, j = (k / n) | 0;
        let s = Infinity;
        for (let b = Math.max(0, j - 1); b <= Math.min(n - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(n - 1, i + 1); a++)
        { const m = b * n + a; if (W[m] === 3 && d.surface[m] < s) s = d.surface[m]; }
        // always under the ground there: a low bank (a gully beside the river) gets a short spill down to it, never an edge in the air
        return Math.min(s, d.height[k] - LIP);
    };
    const v = (k: number) => {
        if (vert[k] >= 0) return vert[k];
        const i = k % n, j = (k / n) | 0, x = i * d.cell - half, z = j * d.cell - half, y = level(k);
        pos.push(x, y, z);
        info.push(y - d.height[k], W[k] === 3 ? d.cell * .5 : -d.cell);
        flow.push(x, z, 0, 0);
        dir.push(0, 0);
        const t = Math.min(1, Math.max(0, 1 - d.toOcean[k] / SALT));
        salt.push(t * t * (3 - 2 * t));
        return vert[k] = pos.length / 3 - 1;
    };
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++)
    {
        const k = j * n + i, c = [k, k + 1, k + n + 1, k + n];
        if (!c.some(m => W[m] === 3)) continue;
        // the sea / lake quads cover `step` cells with a still corner: those are theirs (no water drawn twice)
        const i0 = i - i % step, j0 = j - j % step, i1 = Math.min(n - 1, i0 + step), j1 = Math.min(n - 1, j0 + step);
        if (still(j0 * n + i0) || still(j0 * n + i1) || still(j1 * n + i0) || still(j1 * n + i1)) continue;
        const [a, b, e, f] = c.map(v);
        idx.push(a, f, b, b, f, e);
    }
    if (!idx.length) return null;
    return { ...upload(gl, [[new Float32Array(pos), 3], [new Float32Array(info), 2], [new Float32Array(flow), 4], [new Float32Array(dir), 2], [new Float32Array(salt), 1]], new Uint32Array(idx)), x: 0, y: 0, z: 0, radius: Infinity };
}

export const BIOME = (name: typeof BIOMES[number]) => BIOMES.indexOf(name);
