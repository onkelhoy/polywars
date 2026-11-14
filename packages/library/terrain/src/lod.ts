import { errors, meshHeight, triangulate } from "./rtin";
import { upload, free, type Mesh } from "./mesh";
import type { TerrainData } from "./types";

export type LodOptions = {
    /** detail levels, 1 = no LOD */
    levels: number;
    /** metres to the first coarser level; level k starts at `distance * factor^(k-1)` */
    distance: number;
    /** error multiplier per level */
    factor: number;
};

type Chunk = {
    i0: number; j0: number;
    x: number; y: number; z: number; radius: number;
    errors?: Float32Array;
    levels: (Mesh | undefined)[];
};

/**
 * The ground in square chunks (`chunk` + 1 nodes, power of two). Each chunk has its own RTIN and builds a mesh
 * per detail level when first needed: near chunks fine, far chunks coarse. A skirt (wall down along the chunk border)
 * hides the cracks between chunks; its depth is set per frame (`draw`'s `drop`) from the levels drawn next to it,
 * so walls stay short where the neighbours match.
 */
/** split priority of the sea's waterline: exact on the near levels, coarser far out (rivers and lakes: always exact) */
const COAST = 3;

export class Ground {
    private chunks: Chunk[] = [];
    private size: number;
    /** chunks per row */
    private per: number;
    /** level drawn per chunk this frame, -1 = not drawn */
    private drawnLevel = new Int8Array(0);
    /** triangles drawn last frame, and what the full grid would have */
    triangles = 0;
    readonly full: number;

    private error = -1;

    /**
     * `detail` 0..1: share of the full grid's triangles to spend (level 0). `adaptive` 0..1 only decides where they go:
     * 0 the same density everywhere, 1 all to where the shape needs it (mountains, ridges, borders).
     */
    constructor(private gl: WebGL2RenderingContext, private d: TerrainData, detail: number, private adaptive: number, private edges: number, chunk: number, private lod: LodOptions) {
        const n = d.n, cells = n - 1;
        this.size = Math.min(cells, 2 ** Math.round(Math.log2(Math.max(16, chunk))));
        this.full = cells * cells * 2;
        const c = this.size, per = this.per = cells / c, half = d.size / 2;
        for (let cj = 0; cj < per; cj++) for (let ci = 0; ci < per; ci++)
        {
            const i0 = ci * c, j0 = cj * c;
            let lo = Infinity, hi = -Infinity;
            for (let j = j0; j <= j0 + c; j++) for (let i = i0; i <= i0 + c; i++) { const h = d.height[j * n + i]; if (h < lo) lo = h; if (h > hi) hi = h; }
            const w = c * d.cell;
            this.chunks.push({ i0, j0, x: (i0 + c / 2) * d.cell - half, y: (lo + hi) / 2, z: (j0 + c / 2) * d.cell - half, radius: Math.hypot(w * .71, (hi - lo) / 2), levels: [] });
        }
        if (detail < 1) this.error = this.threshold(detail);
        this.drawnLevel = new Int8Array(this.chunks.length);
    }

    /** the split priority that spends about `detail` of the full grid: each split node is ~2 triangles, so take the (detail/2)th quantile from the top */
    private threshold(detail: number) {
        const sample: number[] = [];
        for (const c of this.chunks)
        {
            const e = this.errorsOf(c);
            for (let k = 0; k < e.length; k += 3) sample.push(e[k]);
        }
        sample.sort((a, b) => b - a);
        return sample[Math.min(sample.length - 1, Math.floor(sample.length * Math.max(0, detail) / 2))] ?? -1;
    }

    private errorsOf(c: Chunk) {
        if (c.errors) return c.errors;
        const d = this.d, n = d.n, s = this.size + 1;
        const g = (i: number, j: number) => (c.j0 + j) * n + c.i0 + i;
        const h = new Float32Array(s * s), b = new Uint8Array(s * s);
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { h[j * s + i] = d.height[g(i, j)]; b[j * s + i] = d.biome[g(i, j)]; }
        const edges = this.edges, holes = d.holes, o = new Uint8Array(s * s), w = new Uint8Array(s * s);
        if (holes) for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) o[j * s + i] = holes[g(i, j)];
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) w[j * s + i] = d.water[g(i, j)] === 1 ? 2 : d.water[g(i, j)] ? 1 : 0;
        // biome borders keep some error; hole borders and the river / lake waterline (every cell with water and land corners:
        // the water meshes' edges sit on those nodes) are always split to the finest triangles, at every level, so water never
        // shows through the ground nor ends in the air; the sea's coast only on the near levels (`COAST`)
        return c.errors = errors(h, s, (m, a, q) => (holes && (o[m] !== o[a] || o[m] !== o[q] || o[m]) ? 1e6 : 0) + (w[m] !== w[a] || w[m] !== w[q] ? (w[m] | w[a] | w[q]) & 1 ? 1e6 : COAST : 0) + (edges > 0 && (b[m] !== b[a] || b[m] !== b[q]) ? edges : 0), this.adaptive);
    }

    /** height of the finest drawn ground (level 0 triangles) at world x / z; grass and props stand on this */
    heightAt(x: number, z: number) {
        const d = this.d, n = d.n, c = this.size, half = d.size / 2;
        const gx = Math.min(n - 1, Math.max(0, (x + half) / d.cell)), gz = Math.min(n - 1, Math.max(0, (z + half) / d.cell));
        const ci = Math.min(Math.floor(gx / c), (n - 1) / c - 1), cj = Math.min(Math.floor(gz / c), (n - 1) / c - 1);
        const chunk = this.chunks[cj * ((n - 1) / c) + ci];
        if (!chunk) return 0;
        const s = c + 1;
        return meshHeight(this.errorsOf(chunk), s, this.levelError(0), k => d.height[(chunk.j0 + Math.floor(k / s)) * n + chunk.i0 + k % s], gx - chunk.i0, gz - chunk.j0);
    }

    /** metres of error for a level */
    levelError(level: number) {
        return level === 0 ? this.error : Math.max(this.error, .05) * Math.pow(this.lod.factor, level);
    }

    /**
     * Draw what `visible` lets through, each at the level its distance from `eye` asks for.
     * At most `budget` missing meshes get built per call; until then a coarser (or any) built level stands in.
     * `drop`: metres the chunk's walls must hang down to cover the cracks to its drawn neighbours.
     */
    draw(eye: { x: number; y: number; z: number }, visible: (x: number, y: number, z: number, r: number) => boolean, draw: (m: Mesh, drop: number) => void, budget = 6) {
        this.triangles = 0;
        let drawn = 0;
        const levels = this.drawnLevel.fill(-1), meshes: Mesh[] = [];
        for (let ci = 0; ci < this.chunks.length; ci++)
        {
            const c = this.chunks[ci];
            if (!visible(c.x, c.y, c.z, c.radius)) continue;
            const dist = Math.max(0, Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) - c.radius);
            // geometric: the error grows with distance like the view shrinks it, so it looks the same on screen
            const f = Math.max(1.01, this.lod.factor), ratio = dist / Math.max(1, this.lod.distance);
            const want = ratio < 1 ? 0 : Math.min(this.lod.levels - 1, 1 + Math.floor(Math.log(ratio) / Math.log(f)));
            let m = c.levels[want];
            if (!m && budget > 0) { m = c.levels[want] = this.build(c, want); budget--; }
            m ??= c.levels.find(x => x);
            if (!m) { m = c.levels[want] = this.build(c, want); }
            levels[ci] = c.levels.indexOf(m);
            meshes[ci] = m;
        }
        // walls: a crack is at most both sides' error; a hidden neighbour shows no crack, the map edge keeps the deepest
        const per = this.per, err = (l: number) => Math.max(0, this.levelError(l)), deep = err(this.lod.levels - 1) * 2 + 2;
        for (let ci = 0; ci < this.chunks.length; ci++)
        {
            const l = levels[ci];
            if (l < 0) continue;
            const i = ci % per, j = (ci / per) | 0;
            let drop = 0;
            for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
            {
                const a = i + di, b = j + dj;
                if (a < 0 || b < 0 || a >= per || b >= per) { drop = Math.max(drop, deep); continue; }
                const nl = levels[b * per + a];
                if (nl >= 0) drop = Math.max(drop, err(l) + err(nl));
            }
            draw(meshes[ci], drop + .5);
            this.triangles += meshes[ci].count / 3;
            drawn++;
        }
        return drawn;
    }

    destroy() {
        free(this.gl, this.chunks.flatMap(c => c.levels.filter((m): m is Mesh => !!m)));
        this.chunks = [];
    }

    private build(c: Chunk, level: number): Mesh {
        const d = this.d, n = d.n, s = this.size + 1, half = d.size / 2;
        let { nodes, triangles } = triangulate(this.errorsOf(c), s, this.levelError(level));
        if (d.holes)
        {
            // drop every triangle touching a hole node: the opening is exactly the hole nodes' cells, no slivers over it
            const keep: number[] = [], hole = (k: number) => d.holes![(c.j0 + ((k / s) | 0)) * n + c.i0 + k % s];
            for (let t = 0; t < triangles.length; t += 3)
                if (!hole(nodes[triangles[t]]) && !hole(nodes[triangles[t + 1]]) && !hole(nodes[triangles[t + 2]])) keep.push(triangles[t], triangles[t + 1], triangles[t + 2]);
            triangles = new Uint32Array(keep) as typeof triangles;
        }

        // skirt: border edges get a wall down, deep enough to cover a coarser neighbour
        const on = (k: number) => { const i = k % s, j = (k / s) | 0; return [i === 0, i === s - 1, j === 0, j === s - 1]; };
        const walls: [number, number][] = [];
        for (let t = 0; t < triangles.length; t += 3) for (let e = 0; e < 3; e++)
        {
            const a = triangles[t + e], b = triangles[t + (e + 1) % 3], oa = on(nodes[a]), ob = on(nodes[b]);
            if (oa.some((v, q) => v && ob[q])) walls.push([a, b]);
        }
        const count = nodes.length, total = count + walls.length * 4;
        const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), data = new Float32Array(total * 4), flow = new Float32Array(total), surface = new Float32Array(total);
        const hh = (i: number, j: number) => d.height[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
        /** `wall` 1 a wall's top, 2 its bottom (lowered in the shader by the frame's drop) */
        const put = (q: number, k: number, wall = 0) => {
            const i = c.i0 + k % s, j = c.j0 + ((k / s) | 0), gk = j * n + i;
            pos.set([i * d.cell - half, d.height[gk], j * d.cell - half], q * 3);
            const nx = (hh(i - 1, j) - hh(i + 1, j)) / (2 * d.cell), nz = (hh(i, j - 1) - hh(i, j + 1)) / (2 * d.cell), len = Math.hypot(nx, 1, nz);
            nor.set([nx / len, 1 / len, nz / len], q * 3);
            data.set([d.biome[gk], d.slope[gk], d.moisture[gk], d.temperature[gk]], q * 4);
            // walls: flow -1 so the material lights them like the ground above (no dark seams)
            flow[q] = wall ? -wall : d.flow[gk];
            surface[q] = d.surface[gk];
        };
        for (let v = 0; v < count; v++) put(v, nodes[v]);
        const idx = new Uint32Array(triangles.length + walls.length * 6);
        idx.set(triangles);
        walls.forEach(([a, b], w) => {
            // own copies of the top edge, so the walls can be marked without touching the ground
            const q = count + w * 4;
            put(q, nodes[a], 1); put(q + 1, nodes[b], 1); put(q + 2, nodes[a], 2); put(q + 3, nodes[b], 2);
            idx.set([q, q + 2, q + 1, q + 1, q + 2, q + 3], triangles.length + w * 6);
        });
        return { ...upload(this.gl, [[pos, 3], [nor, 3], [data, 4], [flow, 1], [surface, 1]], idx), x: c.x, y: c.y, z: c.z, radius: c.radius };
    }
}
