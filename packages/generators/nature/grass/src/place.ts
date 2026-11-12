import { Random } from "@papit/random";
import type { Planting } from "./types";

export type Chunk = { x: number; z: number; /** first tuft in the buffer */ offset: number; count: number; /** bounding radius */ radius: number; y: number };
export type Placed = { data: Float32Array; chunks: Chunk[]; count: number; /** density used, per m² (lower than asked when capped) */ density: number; /** true when `max` thinned it */ capped: boolean };

/**
 * Jittered grid of tufts over the area, `density` per m², kept where `mask` says.
 * Per tuft: x y z scale. Tufts are grouped by chunk and shuffled inside it, so any prefix is an even thinning.
 * Over `max` tufts the density is lowered so the whole area stays evenly covered.
 */
export function place(planting: Planting, density: number, chunk: number, max: number, jitter: number): Placed {
    let used = density, capped = false;
    for (let i = 0; i < 4; i++)
    {
        const n = grid(planting, used, chunk, jitter, false).count;
        if (n <= max) break;
        capped = true;
        used *= max / n * .99;
    }
    const lists = grid(planting, used, chunk, jitter, true, max);
    return { ...pack(planting, chunk, lists.lists, lists.count), density: used, capped };
}

function grid(planting: Planting, density: number, chunk: number, jitter: number, keep: boolean, max = Infinity) {
    const { area, seed = 1, mask, height } = planting;
    const step = 1 / Math.sqrt(Math.max(density, 1e-3));
    const cx = Math.max(1, Math.ceil(area.width / chunk)), cz = Math.max(1, Math.ceil(area.depth / chunk));
    const lists: number[][][] = Array.from({ length: cx * cz }, () => []);
    const rng = new Random(seed);
    const nx = Math.ceil(area.width / step), nz = Math.ceil(area.depth / step);
    let count = 0;
    outer: for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++)
    {
        // always 4 draws per cell, so the mask never shifts the other cells
        const x = area.x + (i + rng.next()) * step, z = area.z + (j + rng.next()) * step, grow = rng.next(), size = rng.next();
        if (x > area.x + area.width || z > area.z + area.depth) continue;
        if (mask && grow >= mask(x, z)) continue;
        if (count >= max) break outer;
        count++;
        if (!keep) continue;
        const y = height ? height(x, z) : 0;
        const scale = 1 + (size * 2 - 1) * jitter;
        const c = Math.min(cz - 1, Math.floor((z - area.z) / chunk)) * cx + Math.min(cx - 1, Math.floor((x - area.x) / chunk));
        lists[c].push([x, y, z, scale]);
    }
    return { lists, count };
}

function pack(planting: Planting, chunk: number, lists: number[][][], count: number) {
    const { area, seed = 1 } = planting;
    const cx = Math.max(1, Math.ceil(area.width / chunk));
    const rng = new Random(seed);
    const data = new Float32Array(count * 4), chunks: Chunk[] = [];
    let offset = 0;
    lists.forEach((list, c) => {
        const n = list.length;
        if (!n) return;
        rng.fork(`chunk:${c}`).shuffle(list);
        let y = 0;
        list.forEach((t, i) => { data.set(t, (offset + i) * 4); y += t[1]; });
        const x0 = area.x + (c % cx) * chunk, z0 = area.z + Math.floor(c / cx) * chunk;
        chunks.push({ x: x0 + chunk / 2, z: z0 + chunk / 2, y: y / n, radius: chunk * Math.SQRT1_2, offset, count: n });
        offset += n;
    });
    return { data, chunks, count };
}
