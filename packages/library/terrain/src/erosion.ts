import { Random } from "@papit/random";
import type { Pace } from "./pace";
import type { TerrainOptions } from "./types";

/**
 * Hydraulic droplet erosion (Hans Theobald Beyer 2015, as popularised by Sebastian Lague).
 * Each droplet runs downhill with inertia, picks up sediment where it speeds up and drops it where it slows,
 * which carves valleys and gullies and leaves sharp ridges. Fast because the erosion brush
 * (offsets + weights) is computed once and all grids are flat typed arrays.
 *
 * `h` heights in grid units (changed in place), `flow` collects where water ran, `hard` (0..1) keeps nodes from being dug or filled.
 */
export async function erode(h: Float32Array, n: number, count: number, o: TerrainOptions["erosion"], radius: number, seed: number, flow: Float32Array, pace: Pace, hard?: Float32Array) {
    const rng = new Random(seed);
    const r = Math.max(2, Math.round(radius)), ox: number[] = [], oy: number[] = [], ow: number[] = [];
    let total = 0;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    {
        const w = r - Math.hypot(x, y);
        if (w <= 0) continue;
        ox.push(x); oy.push(y); ow.push(w); total += w;
    }
    const bx = Int32Array.from(ox), by = Int32Array.from(oy), bw = Float32Array.from(ow, w => w / total), bn = bw.length;
    const { inertia, capacity, minCapacity, erode: erodeRate, deposit, evaporate, gravity, lifetime } = o;
    const max = n - 1;
    let g = { h: 0, x: 0, y: 0 };
    const sample = (px: number, py: number) => {
        const ix = px | 0, iy = py | 0, fx = px - ix, fy = py - iy, k = iy * n + ix;
        const a = h[k], b = h[k + 1], c = h[k + n], d = h[k + n + 1];
        g.x = (b - a) * (1 - fy) + (d - c) * fy;
        g.y = (c - a) * (1 - fx) + (d - b) * fx;
        g.h = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
        return g;
    };

    pace.begin("erosion");
    for (let drop = 0; drop < count; drop++)
    {
        if ((drop & 255) === 0) await pace.tick(drop / count);
        let x = rng.float(0, max - 1e-3), y = rng.float(0, max - 1e-3), dx = 0, dy = 0, speed = 1, water = 1, sediment = 0;
        for (let step = 0; step < lifetime; step++)
        {
            const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, k = iy * n + ix;
            const s = sample(x, y), height = s.h;
            dx = dx * inertia - s.x * (1 - inertia);
            dy = dy * inertia - s.y * (1 - inertia);
            const len = Math.hypot(dx, dy);
            if (len < 1e-9) break;
            dx /= len; dy /= len;
            x += dx; y += dy;
            if (x < 0 || x >= max || y < 0 || y >= max) break;
            flow[k] += water;

            const dh = sample(x, y).h - height;
            const cap = Math.max(-dh * speed * water * capacity, minCapacity);
            if (sediment > cap || dh > 0)
            {
                // fill the pit uphill, or drop the excess: bilinear onto the 4 nodes of the old cell
                const soft = hard ? 1 - hard[k] : 1;
                const amount = (dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * deposit) * soft;
                sediment -= amount;
                h[k] += amount * (1 - fx) * (1 - fy);
                h[k + 1] += amount * fx * (1 - fy);
                h[k + n] += amount * (1 - fx) * fy;
                h[k + n + 1] += amount * fx * fy;
            }
            else
            {
                // never dig deeper than the step down
                const amount = Math.min((cap - sediment) * erodeRate, -dh);
                for (let b = 0; b < bn; b++)
                {
                    const cx = ix + bx[b], cy = iy + by[b];
                    if (cx < 0 || cx > max || cy < 0 || cy > max) continue;
                    const m = cy * n + cx, take = amount * bw[b] * (hard ? 1 - hard[m] : 1);
                    h[m] -= take;
                    sediment += take;
                }
            }
            speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity));
            water *= 1 - evaporate;
        }
    }
}
