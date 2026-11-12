import type { Ground } from "./types";

/** grids sites read, derived once */
export type Grids = { n: number; cell: number; size: number; height: Float32Array; seaLevel: number; top: number; water: Uint8Array; slope: Float32Array; toSea: Float32Array };

export function grids(g: Ground): Grids {
    const { n, cell, height, seaLevel } = g;
    const water = g.water ?? Uint8Array.from(height, h => h < seaLevel ? 1 : 0);
    const slope = new Float32Array(n * n);
    let top = seaLevel + 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    {
        const k = j * n + i, h = height[k];
        if (h > top) top = h;
        const dx = (height[j * n + Math.min(n - 1, i + 1)] - height[j * n + Math.max(0, i - 1)]) / (2 * cell);
        const dz = (height[Math.min(n - 1, j + 1) * n + i] - height[Math.max(0, j - 1) * n + i]) / (2 * cell);
        slope[k] = Math.hypot(dx, dz);
    }
    return { n, cell, size: g.size, height, seaLevel, top, water, slope, toSea: chamfer(n, cell, k => water[k] === 1) };
}

/** metres to the nearest source node (two pass chamfer, 8 neighbours) */
export function chamfer(n: number, cell: number, source: (k: number) => boolean): Float32Array {
    const d = new Float32Array(n * n), a = cell, b = cell * Math.SQRT2;
    for (let k = 0; k < n * n; k++) d[k] = source(k) ? 0 : 1e9;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    {
        const k = j * n + i;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + a);
        if (j > 0) { v = Math.min(v, d[k - n] + a); if (i > 0) v = Math.min(v, d[k - n - 1] + b); if (i < n - 1) v = Math.min(v, d[k - n + 1] + b); }
        d[k] = v;
    }
    for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--)
    {
        const k = j * n + i;
        let v = d[k];
        if (i < n - 1) v = Math.min(v, d[k + 1] + a);
        if (j < n - 1) { v = Math.min(v, d[k + n] + a); if (i < n - 1) v = Math.min(v, d[k + n + 1] + b); if (i > 0) v = Math.min(v, d[k + n - 1] + b); }
        d[k] = v;
    }
    return d;
}

export const node = (g: Grids, x: number, z: number) => {
    const i = Math.round((x / g.size + .5) * (g.n - 1)), j = Math.round((z / g.size + .5) * (g.n - 1));
    return Math.min(g.n - 1, Math.max(0, j)) * g.n + Math.min(g.n - 1, Math.max(0, i));
};
export const pos = (g: Grids, k: number): [number, number] => [((k % g.n) / (g.n - 1) - .5) * g.size, (((k / g.n) | 0) / (g.n - 1) - .5) * g.size];

/** mean slope + dry check in a disc of `r` cells around node (i, j) (12 + 12 samples); -1 when wet or off the map */
export function flatness(g: Grids, i: number, j: number, r: number): number {
    const { n, slope, water } = g;
    if (i - r < 0 || j - r < 0 || i + r >= n || j + r >= n) return -1;
    let sum = slope[j * n + i];
    if (water[j * n + i]) return -1;
    for (let a = 0; a < 12; a++) for (const f of [.5, 1])
    {
        const m = (j + Math.round(Math.sin(a * Math.PI / 6) * r * f)) * n + i + Math.round(Math.cos(a * Math.PI / 6) * r * f);
        if (water[m]) return -1;
        sum += slope[m];
    }
    return sum / 25;
}

/** greedy pick by score, every pick at least `space(a, b)` from the others and from `keep` */
export function spaced<T extends { x: number; z: number; score: number }>(found: T[], count: number, space: (a: { x: number; z: number }, b: T) => boolean, keep: { x: number; z: number }[] = []): T[] {
    found.sort((a, b) => b.score - a.score);
    const out: T[] = [];
    for (const c of found)
    {
        if (out.length >= count) break;
        if (keep.every(p => space(p, c)) && out.every(p => space(p, c))) out.push(c);
    }
    return out;
}
