import { errors, triangulate } from "./rtin";
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
 * hides the cracks between chunks of different levels.
 */
export class Ground {
    private chunks: Chunk[] = [];
    private size: number;
    /** triangles drawn last frame, and what the full grid would have */
    triangles = 0;
    readonly full: number;

    constructor(private gl: WebGL2RenderingContext, private d: TerrainData, private error: number, private edges: number, chunk: number, private lod: LodOptions) {
        const n = d.n, cells = n - 1;
        this.size = Math.min(cells, 2 ** Math.round(Math.log2(Math.max(16, chunk))));
        this.full = cells * cells * 2;
        const c = this.size, per = cells / c, half = d.size / 2;
        for (let cj = 0; cj < per; cj++) for (let ci = 0; ci < per; ci++)
        {
            const i0 = ci * c, j0 = cj * c;
            let lo = Infinity, hi = -Infinity;
            for (let j = j0; j <= j0 + c; j++) for (let i = i0; i <= i0 + c; i++) { const h = d.height[j * n + i]; if (h < lo) lo = h; if (h > hi) hi = h; }
            const w = c * d.cell;
            this.chunks.push({ i0, j0, x: (i0 + c / 2) * d.cell - half, y: (lo + hi) / 2, z: (j0 + c / 2) * d.cell - half, radius: Math.hypot(w * .71, (hi - lo) / 2), levels: [] });
        }
    }

    /** metres of error for a level */
    levelError(level: number) {
        return level === 0 ? this.error : Math.max(this.error, .25) * Math.pow(this.lod.factor, level);
    }

    /**
     * Draw what `visible` lets through, each at the level its distance from `eye` asks for.
     * At most `budget` missing meshes get built per call; until then a coarser (or any) built level stands in.
     */
    draw(eye: { x: number; y: number; z: number }, visible: (x: number, y: number, z: number, r: number) => boolean, draw: (m: Mesh) => void, budget = 6) {
        this.triangles = 0;
        let drawn = 0;
        for (const c of this.chunks)
        {
            if (!visible(c.x, c.y, c.z, c.radius)) continue;
            const dist = Math.max(0, Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) - c.radius);
            // geometric: the error grows with distance like the view shrinks it, so it looks the same on screen
            const f = Math.max(1.01, this.lod.factor), ratio = dist / Math.max(1, this.lod.distance);
            const want = ratio < 1 ? 0 : Math.min(this.lod.levels - 1, 1 + Math.floor(Math.log(ratio) / Math.log(f)));
            let m = c.levels[want];
            if (!m && budget > 0) { m = c.levels[want] = this.build(c, want); budget--; }
            m ??= c.levels.find(x => x);
            if (!m) { m = c.levels[want] = this.build(c, want); }
            draw(m);
            this.triangles += m.count / 3;
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
        const g = (i: number, j: number) => (c.j0 + j) * n + c.i0 + i;
        if (!c.errors)
        {
            const h = new Float32Array(s * s), b = new Uint8Array(s * s);
            for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { h[j * s + i] = d.height[g(i, j)]; b[j * s + i] = d.biome[g(i, j)]; }
            const edges = this.edges;
            c.errors = errors(h, s, edges > 0 ? (m, a, q) => b[m] !== b[a] || b[m] !== b[q] ? edges : 0 : undefined);
        }
        const { nodes, triangles } = triangulate(c.errors, s, this.levelError(level));

        // skirt: border edges get a wall down, deep enough to cover a coarser neighbour
        const on = (k: number) => { const i = k % s, j = (k / s) | 0; return [i === 0, i === s - 1, j === 0, j === s - 1]; };
        const walls: [number, number][] = [];
        for (let t = 0; t < triangles.length; t += 3) for (let e = 0; e < 3; e++)
        {
            const a = triangles[t + e], b = triangles[t + (e + 1) % 3], oa = on(nodes[a]), ob = on(nodes[b]);
            if (oa.some((v, q) => v && ob[q])) walls.push([a, b]);
        }
        const count = nodes.length, total = count + walls.length * 4;
        const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), data = new Float32Array(total * 4), flow = new Float32Array(total);
        const hh = (i: number, j: number) => d.height[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
        const put = (q: number, k: number, drop: number, wall = false) => {
            const i = c.i0 + k % s, j = c.j0 + ((k / s) | 0), gk = j * n + i;
            pos.set([i * d.cell - half, d.height[gk] - drop, j * d.cell - half], q * 3);
            const nx = (hh(i - 1, j) - hh(i + 1, j)) / (2 * d.cell), nz = (hh(i, j - 1) - hh(i, j + 1)) / (2 * d.cell), len = Math.hypot(nx, 1, nz);
            nor.set([nx / len, 1 / len, nz / len], q * 3);
            data.set([d.biome[gk], d.slope[gk], d.moisture[gk], d.temperature[gk]], q * 4);
            // walls: flow -1 so the material lights them like the ground above (no dark seams)
            flow[q] = wall ? -1 : d.flow[gk];
        };
        for (let v = 0; v < count; v++) put(v, nodes[v], 0);
        const drop = this.levelError(this.lod.levels - 1) * 2 + 2, idx = new Uint32Array(triangles.length + walls.length * 6);
        idx.set(triangles);
        walls.forEach(([a, b], w) => {
            // own copies of the top edge, so the walls can be marked without touching the ground
            const q = count + w * 4;
            put(q, nodes[a], 0, true); put(q + 1, nodes[b], 0, true); put(q + 2, nodes[a], drop, true); put(q + 3, nodes[b], drop, true);
            idx.set([q, q + 2, q + 1, q + 1, q + 2, q + 3], triangles.length + w * 6);
        });
        return { ...upload(this.gl, [[pos, 3], [nor, 3], [data, 4], [flow, 1]], idx), x: c.x, y: c.y, z: c.z, radius: c.radius };
    }
}
