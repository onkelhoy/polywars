import type { City, TerrainOptions } from "./types";

type Grids = { n: number; cell: number; size: number; height: Float32Array; slope: Float32Array; water: Uint8Array; toWater: Float32Array; toOcean: Float32Array; seaLevel: number; top: number };

/**
 * Town spots: flat, dry, not too high, a bit of water nearby scores extra (`water`), at least `spacing` apart.
 * `flatten` evens the ground under each spot (in place, metres).
 */
export function cities(o: TerrainOptions["cities"], g: Grids): City[] {
    const { n, cell, height, slope, water } = g;
    const r = Math.max(1, Math.round(o.radius / cell)), stride = Math.max(1, r >> 1);
    const ring: [number, number][] = [];
    for (let a = 0; a < 12; a++) for (const f of [.5, 1]) ring.push([Math.round(Math.cos(a * Math.PI / 6) * r * f), Math.round(Math.sin(a * Math.PI / 6) * r * f)]);
    const found: (City & { k: number })[] = [];
    for (let j = r; j < n - r; j += stride) for (let i = r; i < n - r; i += stride)
    {
        const k = j * n + i;
        if (water[k]) continue;
        let sum = slope[k], lo = height[k], hi = height[k], wet = false;
        for (const [dx, dz] of ring)
        {
            const m = (j + dz) * n + i + dx;
            if (water[m]) { wet = true; break; }
            sum += slope[m]; lo = Math.min(lo, height[m]); hi = Math.max(hi, height[m]);
        }
        if (wet) continue;
        const avg = sum / (ring.length + 1);
        if (avg > o.maxSlope) continue;
        const up = (height[k] - g.seaLevel) / Math.max(1, g.top - g.seaLevel);
        const near = g.toWater[k] < o.radius * 4 ? 1 : 0;
        const score = (1 - avg / o.maxSlope) * .6 + (1 - Math.min(1, (hi - lo) / (o.radius * .2))) * .2 - up * .3 + near * o.water;
        found.push({ k, x: (i / (n - 1) - .5) * g.size, z: (j / (n - 1) - .5) * g.size, y: height[k], radius: o.radius, score, coast: g.toOcean[k] < o.radius * 3 });
    }
    found.sort((a, b) => b.score - a.score);
    const picked: typeof found = [];
    for (const c of found)
    {
        if (picked.length >= o.count) break;
        if (picked.every(p => Math.hypot(p.x - c.x, p.z - c.z) >= o.spacing)) picked.push(c);
    }
    if (o.flatten > 0) for (const c of picked) c.y = flatten(c.k, r, o.flatten, g);
    return picked.map(({ k: _, ...c }) => c);
}

/** blend the ground around `k` towards its mean, full inside `r`, fading out to 1.6 r; returns the level */
function flatten(k: number, r: number, strength: number, g: Grids): number {
    const { n, height } = g, ci = k % n, cj = (k / n) | 0;
    let sum = 0, count = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) { sum += height[(cj + j) * n + ci + i]; count++; }
    const level = Math.max(sum / count, g.seaLevel + 1), outer = Math.ceil(r * 1.6);
    for (let j = -outer; j <= outer; j++) for (let i = -outer; i <= outer; i++)
    {
        const x = ci + i, z = cj + j;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const d = Math.hypot(i, j), t = d <= r ? 1 : d >= outer ? 0 : 1 - (d - r) / (outer - r);
        const m = z * n + x, w = t * t * (3 - 2 * t) * strength;
        height[m] += (level - height[m]) * w;
    }
    return level;
}
