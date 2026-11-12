import { hash } from "./noise";
import type { Planting } from "./types";

export type Chunk = { x: number; z: number; /** first tuft in the buffer */ offset: number; count: number; /** bounding radius */ radius: number; y: number };
export type Placed = { data: Float32Array; chunks: Chunk[]; count: number };

/**
 * Jittered grid of tufts over the area, `density` per m², kept where `mask` says.
 * Per tuft: x y z scale. Tufts are grouped by chunk and shuffled inside it, so any prefix is an even thinning.
 */
export function place(planting: Planting, density: number, chunk: number, max: number, jitter: number): Placed {
    const { area, seed = 1, mask, height } = planting;
    const step = 1 / Math.sqrt(Math.max(density, 1e-3));
    const cx = Math.max(1, Math.ceil(area.width / chunk)), cz = Math.max(1, Math.ceil(area.depth / chunk));
    const lists: number[][] = Array.from({ length: cx * cz }, () => []);
    const nx = Math.ceil(area.width / step), nz = Math.ceil(area.depth / step);
    let count = 0;
    outer: for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++)
    {
        const id = (j * nx + i) * 4 + seed * 7349;
        const x = area.x + (i + hash(id)) * step, z = area.z + (j + hash(id + 1)) * step;
        if (x > area.x + area.width || z > area.z + area.depth) continue;
        if (mask && hash(id + 2) >= mask(x, z)) continue;
        if (count >= max) break outer;
        const y = height ? height(x, z) : 0;
        const scale = 1 + (hash(id + 3) * 2 - 1) * jitter;
        const c = Math.min(cz - 1, Math.floor((z - area.z) / chunk)) * cx + Math.min(cx - 1, Math.floor((x - area.x) / chunk));
        lists[c].push(x, y, z, scale);
        count++;
    }
    if (count >= max) console.warn(`grass: capped at ${max} tufts`);
    const data = new Float32Array(count * 4), chunks: Chunk[] = [];
    let offset = 0;
    lists.forEach((list, c) => {
        const n = list.length / 4;
        if (!n) return;
        // Fisher-Yates over tufts
        for (let i = n - 1; i > 0; i--)
        {
            const k = Math.floor(hash(seed * 31 + c * 7919 + i) * (i + 1));
            for (let e = 0; e < 4; e++) [list[i * 4 + e], list[k * 4 + e]] = [list[k * 4 + e], list[i * 4 + e]];
        }
        data.set(list, offset * 4);
        let y = 0;
        for (let i = 0; i < n; i++) y += list[i * 4 + 1];
        const x0 = area.x + (c % cx) * chunk, z0 = area.z + Math.floor(c / cx) * chunk;
        chunks.push({ x: x0 + chunk / 2, z: z0 + chunk / 2, y: y / n, radius: chunk * Math.SQRT1_2, offset, count: n });
        offset += n;
    });
    return { data, chunks, count };
}
