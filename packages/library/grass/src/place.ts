import { Random } from "@papit/random";
import type { Planting } from "./types";

/** floats per tuft: x y z scale, then cover: height dry flowers _ */
export const TUFT = 8;

export type Chunk = { x: number; z: number; /** first tuft in the buffer */ offset: number; count: number; /** bounding radius */ radius: number; y: number };
export type Placed = { data: Float32Array; chunks: Chunk[]; count: number; /** density used, per m² (lower than asked when capped) */ density: number; /** true when `max` thinned it */ capped: boolean };
/** one chunk's tufts, shuffled (any prefix is an even thinning) */
export type ChunkTufts = { i: number; j: number; data: number[]; count: number };

/** chunks across the area */
export function chunkCount(planting: Planting, chunk: number) {
    return [Math.max(1, Math.ceil(planting.area.width / chunk)), Math.max(1, Math.ceil(planting.area.depth / chunk))];
}

/**
 * Tufts of chunk `i, j`: a jittered grid, `density` per m², kept where `grow` / `mask` says. Seeded per chunk,
 * so a chunk comes out the same whenever it is planted. Per tuft `TUFT` floats.
 */
export function plantChunk(planting: Planting, density: number, chunk: number, i: number, j: number, jitter: number, max = Infinity): ChunkTufts {
    const { area, seed = 1, mask, height, grow } = planting;
    const step = 1 / Math.sqrt(Math.max(density, 1e-3));
    const x0 = area.x + i * chunk, z0 = area.z + j * chunk;
    const x1 = Math.min(area.x + area.width, x0 + chunk), z1 = Math.min(area.z + area.depth, z0 + chunk);
    const rng = new Random(seed).fork(`chunk:${i}:${j}`);
    const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
    const out: number[] = [];
    let count = 0;
    outer: for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++)
    {
        // always 4 draws per cell, so the mask never shifts the other cells
        const x = x0 + (a + rng.next()) * step, z = z0 + (b + rng.next()) * step, chance = rng.next(), size = rng.next();
        if (x > x1 || z > z1) continue;
        let h = 1, dry = 0, flowers = 0;
        if (grow)
        {
            const g = grow(x, z);
            if (chance >= g.density) continue;
            h = g.height; dry = g.dry; flowers = g.flowers;
        }
        else if (mask && chance >= mask(x, z)) continue;
        if (count >= max) break outer;
        count++;
        out.push(x, height ? height(x, z) : 0, z, 1 + (size * 2 - 1) * jitter, h, dry, flowers, 0);
    }
    // shuffle whole tufts
    const order = rng.shuffle(Array.from({ length: count }, (_, k) => k)), data = new Array<number>(out.length);
    order.forEach((from, to) => { for (let f = 0; f < TUFT; f++) data[to * TUFT + f] = out[from * TUFT + f]; });
    return { i, j, data, count };
}

/** chunks into one buffer + chunk list */
export function pack(planting: Planting, chunk: number, chunks: ChunkTufts[], density: number, capped: boolean): Placed {
    const count = chunks.reduce((s, c) => s + c.count, 0), data = new Float32Array(count * TUFT), list: Chunk[] = [];
    let offset = 0;
    for (const c of chunks)
    {
        if (!c.count) continue;
        data.set(c.data, offset * TUFT);
        let y = 0;
        for (let k = 0; k < c.count; k++) y += c.data[k * TUFT + 1];
        const x0 = planting.area.x + c.i * chunk, z0 = planting.area.z + c.j * chunk;
        list.push({ x: x0 + chunk / 2, z: z0 + chunk / 2, y: y / c.count, radius: chunk * Math.SQRT1_2, offset, count: c.count });
        offset += c.count;
    }
    return { data, chunks: list, count, density, capped };
}

/**
 * The whole area. Over `max` tufts the density is lowered so the whole area stays evenly covered.
 */
export function place(planting: Planting, density: number, chunk: number, max: number, jitter: number): Placed {
    const [cx, cz] = chunkCount(planting, chunk);
    let used = density, capped = false, chunks: ChunkTufts[] = [];
    for (let pass = 0; pass < 4; pass++)
    {
        chunks = [];
        for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) chunks.push(plantChunk(planting, used, chunk, i, j, jitter));
        const n = chunks.reduce((s, c) => s + c.count, 0);
        if (n <= max) break;
        capped = true;
        used *= max / n * .99;
    }
    // still over after the passes: cut the tail
    let left = max;
    for (const c of chunks) { const keep = Math.max(0, Math.min(c.count, left)); c.data.length = keep * TUFT; c.count = keep; left -= keep; }
    return pack(planting, chunk, chunks, used, capped);
}
