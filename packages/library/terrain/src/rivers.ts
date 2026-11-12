import type { River, TerrainOptions } from "./types";

type Grids = { n: number; cell: number; size: number; height: Float32Array; water: Uint8Array; surface: Float32Array; down: Int32Array; acc: Float32Array };

/**
 * Rivers along the drainage tree: nodes whose catchment is over `catchment` m², traced from their sources down to a lake,
 * the sea or the map edge (or into a bigger river); a river ends where the drainage climbs over a basin rim. Width and depth grow with the catchment; the bed is carved into
 * `height` (falling all the way) and the river nodes become water 3 with their surface level. All grids change in place.
 */
export function rivers(o: TerrainOptions["rivers"], g: Grids): River[] {
    const { n, cell, height, water, surface, down, acc } = g;
    if (!o.enabled) return [];
    const total = n * n, threshold = Math.max(4, o.catchment / (cell * cell)), minNodes = o.length / cell;
    const is = (k: number) => acc[k] >= threshold && water[k] === 0;
    const up = new Uint8Array(total);
    for (let k = 0; k < total; k++) if (is(k) && down[k] >= 0 && is(down[k])) up[down[k]]++;
    const sources: number[] = [];
    for (let k = 0; k < total; k++) if (is(k) && !up[k]) sources.push(k);
    // big rivers first, so tributaries end where they meet them
    sources.sort((a, b) => acc[b] - acc[a]);

    const traced = new Uint8Array(total), out: River[] = [], half = g.size / 2, original = height.slice();
    const paths: number[][] = [];
    for (const s of sources)
    {
        const path: number[] = [];
        for (let k = s; k >= 0; k = down[k])
        {
            path.push(k);
            if (water[k] || traced[k]) break;
            traced[k] = 1;
        }
        // a short stub only counts if it feeds something
        if (path.length >= minNodes) paths.push(path);
    }
    // sizes from the catchment, the bed always falling
    const strength = (k: number) => Math.sqrt(acc[k] / threshold);
    const level = new Float32Array(total).fill(-Infinity);
    for (const path of paths)
    {
        let bed = Infinity;
        const points: River["points"] = [];
        for (const k of path)
        {
            const s = Math.min(strength(k), 6), width = Math.min(o.maxWidth, o.width * s), depth = o.depth * Math.min(2, Math.sqrt(s));
            const end = water[k] === 1 || water[k] === 2;
            // drainage climbs out of basins over their rim: water does not, the river ends there (no canyons)
            if (!end && height[k] - bed > depth * 2 + 1 && points.length > 1) break;
            bed = Math.min(bed, (end ? surface[k] : height[k]) - depth);
            const top = Math.max(bed, original[k] - depth * 1.6) + depth * .8;
            const i = k % n, j = (k / n) | 0;
            points.push([i * cell - half, end ? surface[k] : top, j * cell - half, width]);
            // carve: a bowl `width` wide, its banks rising to the old ground
            const r = width / 2 / cell + 1, ri = Math.ceil(r);
            for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++)
            {
                const x = i + di, z = j + dj;
                if (x < 0 || z < 0 || x >= n || z >= n) continue;
                const m = z * n + x, d = Math.hypot(di, dj) / r;
                if (d > 1 || water[m] === 1 || water[m] === 2) continue;
                // never deeper than the river itself below the old ground: steep runs keep their falls
                height[m] = Math.min(height[m], Math.max(bed + depth * 1.6 * d * d, original[m] - depth * 1.6));
                if (d * r * cell <= width / 2 + cell * .5) level[m] = Math.max(level[m], top);
            }
        }
        out.push({ points });
    }
    for (let m = 0; m < total; m++) if (level[m] > -Infinity && !water[m]) { water[m] = 3; surface[m] = level[m]; }
    return out;
}
