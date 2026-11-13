import { drainage, node, sample } from "./grid";
import type { Path } from "./network";
import type { HydrologyOptions, Stream } from "./types";

type Grid = { n: number; size: number; height: Float32Array; seaLevel: number };
const smoothstep = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Beds along each path: following the ground but never rising (a climb up to `cut` is cut through, more starts a
 * new piece behind the rim). A drop of `fall` or more in one step is a waterfall. `stop(k)` ends a piece at a node (lakes, sea).
 */
function beds(p: Path, g: Grid, o: HydrologyOptions, stop?: (k: number) => boolean) {
    const pieces: { i: number[]; bed: number[]; depth: number[]; ground: number[]; falls: number[] }[] = [];
    let cur: typeof pieces[number] | null = null, bed = Infinity;
    for (let i = 0; i < p.x.length; i++)
    {
        const ground = sample(g.height, g.n, g.size, p.x[i], p.z[i]), depth = o.depth * Math.min(3, Math.sqrt(p.w[i] / o.width));
        const k = node(g.n, g.size, p.x[i], p.z[i]), end = stop?.(k) ?? false;
        // never below the sea floor near the coast: no pits
        const want = Math.max(ground - depth, g.seaLevel - depth * 2);
        if (!cur || want - bed > o.cut)
        {
            if (cur && cur.i.length > 1) pieces.push(cur);
            cur = null;
            if (end) continue;
            cur = { i: [], bed: [], depth: [], ground: [], falls: [] };
            bed = want;
        }
        else if (want < bed) { if (bed - want >= o.fall) cur.falls.push(cur.i.length); bed = want; }
        cur.i.push(i); cur.bed.push(bed); cur.depth.push(depth); cur.ground.push(ground);
        if (end) { pieces.push(cur); cur = null; }
    }
    if (cur && cur.i.length > 1) pieces.push(cur);
    return pieces;
}

/**
 * Before erosion: valleys. Banks rise at `valley` slope, deep cuts at `canyon` slope (cliffs), near the sea almost flat (deltas, flood plains).
 * Lowers `height`, marks `hard` in the channel and at waterfalls, `wet` 3 in the channel.
 */
export function carveValleys(paths: Path[], g: Grid, o: HydrologyOptions, hard: Float32Array, wet?: Uint8Array) {
    const { n, size, height } = g, cell = size / (n - 1), half = size / 2, target = height.slice();
    for (const p of paths) for (const piece of beds(p, g, o, wet && (k => wet[k] === 2)))
    {
        const falls = new Set(piece.falls);
        piece.i.forEach((i, q) => {
            const bed = piece.bed[q], depth = piece.depth[q], w2 = p.w[i] / 2, cut = Math.max(0, piece.ground[q] - bed - depth);
            let bank = o.valley + (o.canyon - o.valley) * smoothstep(4, 22, cut);
            bank *= .3 + .7 * smoothstep(2, 12, bed - g.seaLevel);
            const reach = Math.min(w2 + (cut + depth * 2) / bank + cell, 400), x0 = p.x[i], z0 = p.z[i];
            const i0 = Math.max(0, Math.floor((x0 - reach + half) / cell)), i1 = Math.min(n - 1, Math.ceil((x0 + reach + half) / cell));
            const j0 = Math.max(0, Math.floor((z0 - reach + half) / cell)), j1 = Math.min(n - 1, Math.ceil((z0 + reach + half) / cell));
            const fall = falls.has(q);
            for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++)
            {
                const k = j * n + ii, d = Math.hypot(ii * cell - half - x0, j * cell - half - z0);
                if (d > reach) continue;
                const v = d < w2 ? bed + depth * (d / w2) ** 2 : bed + depth + (d - w2) * bank;
                if (v < target[k]) target[k] = v;
                if (d < w2 + cell) { hard[k] = Math.max(hard[k], .6); if (wet && !wet[k]) wet[k] = 3; }
                if (fall && d < w2 * 2 + cell * 2) hard[k] = 1;
            }
        });
    }
    height.set(target);
}

type Wet = Grid & { water: Uint8Array; surface: Float32Array };

/**
 * After erosion: the exact channel (bed, steep banks), water 3 with its surface; pieces end in lakes and the sea.
 * Returns the streams (x, surface, z, width).
 */
export function carveBeds(paths: Path[], g: Wet, o: HydrologyOptions): Stream[] {
    const { n, size, height, water, surface } = g, cell = size / (n - 1), half = size / 2, total = n * n;
    const level = new Float32Array(total).fill(-Infinity), target = height.slice(), chan = new Float32Array(total).fill(Infinity), out: Stream[] = [];
    const still = (k: number) => water[k] === 1 || water[k] === 2;
    for (const p of paths) for (const piece of beds(p, g, o, still))
    {
        const points: Stream["points"] = [];
        piece.i.forEach((i, q) => {
            const bed = piece.bed[q], depth = piece.depth[q], w2 = p.w[i] / 2, top = bed + depth * .8, x0 = p.x[i], z0 = p.z[i];
            const k0 = node(n, size, x0, z0);
            points.push([x0, still(k0) ? surface[k0] : top, z0, p.w[i]]);
            const reach = w2 + depth * 2 + cell * 2;
            const i0 = Math.max(0, Math.floor((x0 - reach + half) / cell)), i1 = Math.min(n - 1, Math.ceil((x0 + reach + half) / cell));
            const j0 = Math.max(0, Math.floor((z0 - reach + half) / cell)), j1 = Math.min(n - 1, Math.ceil((z0 + reach + half) / cell));
            for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++)
            {
                const k = j * n + ii, d = Math.hypot(ii * cell - half - x0, j * cell - half - z0);
                if (d > reach || still(k)) continue;
                const v = d < w2 ? bed + depth * (d / w2) ** 2 : bed + depth + (d - w2);
                if (v < target[k]) target[k] = v;
                // the channel itself gets exactly the bed shape (erosion pits filled)
                if (d < w2 && v < chan[k]) chan[k] = v;
                if (d <= w2 + cell * .5) level[k] = Math.max(level[k], top);
            }
        });
        out.push({ points, order: p.order, falls: piece.falls });
    }
    for (let k = 0; k < total; k++) if (chan[k] < Infinity) target[k] = chan[k];
    height.set(target);
    despike(g);
    for (let k = 0; k < total; k++) if (level[k] > -Infinity && !water[k]) { water[k] = 3; surface[k] = level[k]; }
    return out;
}

/** single node pits and needles on land (more than 3 m past all four neighbours) go to the nearest neighbour height */
export function despike(g: Wet) {
    const { n, height: h, water } = g;
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++)
    {
        const k = j * n + i;
        if (water[k] === 1 || water[k] === 2) continue;
        const a = h[k - 1], b = h[k + 1], c = h[k - n], d = h[k + n], lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        if (h[k] < lo - 3) h[k] = lo;
        else if (h[k] > hi + 3) h[k] = hi;
    }
}

/** dry pits (land basins no lake kept) filled up to `keep` metres under where they spill */
export function fillPits(g: Wet, keep = 1.5) {
    const { n, height: h, water } = g, { filled } = drainage(h, n, g.seaLevel);
    let count = 0;
    for (let k = 0; k < h.length; k++) if (!water[k] && filled[k] - h[k] > keep) { h[k] = filled[k] - keep; count++; }
    return count;
}
