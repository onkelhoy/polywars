import type { River, TerrainOptions } from "./types";

type Grids = { n: number; cell: number; size: number; height: Float32Array; water: Uint8Array; surface: Float32Array; down: Int32Array; acc: Float32Array };

/**
 * Rivers along the drainage tree: nodes whose catchment is over `catchment` m², traced from their sources into bigger rivers,
 * lakes (whose outlet carries on) and on to the sea or the map edge: a tree like real drainage. Rims up to `cut` metres are cut through, higher ends the river. Width and depth grow with the catchment; the bed is carved into
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
    // [nodes, feeds]: feeds = leaves a lake (always kept, it links the network)
    const paths: [number[], boolean][] = [];
    const trace = (start: number[], feeds: boolean) => {
        let path = start;
        for (let k = path.length ? down[path[path.length - 1]] : -1; k >= 0; k = down[k])
        {
            path.push(k);
            if (water[k] === 1 || traced[k]) break;
            if (water[k] === 2)
            {
                // into a lake: this river ends, the lake's outlet carries on (once) down to the next lake or the sea
                if (path.length >= minNodes || feeds) paths.push([path, feeds]);
                let last = k;
                while (down[last] >= 0 && water[down[last]] === 2) last = down[last];
                const outlet = down[last];
                if (outlet < 0 || traced[outlet] || water[outlet] === 1) return;
                path = [last]; feeds = true;
                continue;
            }
            traced[k] = 1;
        }
        if (path.length >= minNodes || (feeds && path.length > 1)) paths.push([path, feeds]);
    };
    for (const s of sources) { if (!traced[s]) { traced[s] = 1; trace([s], false); } }

    // sizes from the catchment, the bed always falling; small rims are cut through, big climbs end the river
    const strength = (k: number) => Math.sqrt(acc[k] / threshold);
    const level = new Float32Array(total).fill(-Infinity);
    for (const [path] of paths)
    {
        let bed = Infinity, surf = Infinity;
        const points: River["points"] = [];
        for (const k of path)
        {
            const s = Math.min(strength(k), 6), width = Math.min(o.maxWidth, o.width * s), depth = o.depth * Math.min(2, Math.sqrt(s));
            const end = water[k] === 1 || water[k] === 2;
            const climb = height[k] - bed;
            // more than the cut allows: water can not get out of here
            if (!end && points.length > 1 && climb > depth * 2 + 1 + o.cut) break;
            const gorge = !end && points.length > 1 && climb > depth * 2 + 1;
            bed = Math.min(bed, (end ? surface[k] : height[k]) - depth);
            surf = Math.min(surf, end ? surface[k] : (gorge ? bed : Math.max(bed, original[k] - depth * 1.6)) + depth * .8);
            const top = end ? surface[k] : surf;
            const i = k % n, j = (k / n) | 0;
            points.push([i * cell - half, top, j * cell - half, width]);
            // carve: a bowl `width` wide, its banks rising to the old ground (through a rim: a cut down to the bed)
            const r = width / 2 / cell + 1 + (gorge ? 2 : 0), ri = Math.ceil(r);
            for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++)
            {
                const x = i + di, z = j + dj;
                if (x < 0 || z < 0 || x >= n || z >= n) continue;
                const m = z * n + x, d = Math.hypot(di, dj) / r;
                if (d > 1 || water[m] === 1 || water[m] === 2) continue;
                const floor = gorge ? bed + (original[m] - bed) * d * d : original[m] - depth * 1.6;
                height[m] = Math.min(height[m], Math.max(bed + depth * 1.6 * d * d, floor));
                if (d * r * cell <= width / 2 + cell * .5) level[m] = Math.max(level[m], top);
            }
        }
        if (points.length > 1) out.push({ points });
    }
    for (let m = 0; m < total; m++) if (level[m] > -Infinity && !water[m]) { water[m] = 3; surface[m] = level[m]; }
    return out;
}
