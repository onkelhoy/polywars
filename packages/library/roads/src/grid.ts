import type { Ground } from "./types";

/** the routing grid: coarser than the ground (`cell` metres), heights + water sampled from it */
export type Grid = { m: number; cell: number; size: number; height: Float32Array; water: Uint8Array };

export function sampler(g: Ground) {
    const { n, size, height } = g;
    return (x: number, z: number) => {
        const fx = Math.min(n - 1.001, Math.max(0, (x / size + .5) * (n - 1))), fz = Math.min(n - 1.001, Math.max(0, (z / size + .5) * (n - 1)));
        const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * n + i;
        return (height[k] * (1 - u) + height[k + 1] * u) * (1 - v) + (height[k + n] * (1 - u) + height[k + n + 1] * u) * v;
    };
}

export function routingGrid(g: Ground, cell: number): Grid {
    const m = Math.max(8, Math.round(g.size / cell)) + 1, step = g.size / (m - 1), at = sampler(g);
    const height = new Float32Array(m * m), water = new Uint8Array(m * m);
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++)
    {
        const x = (i / (m - 1) - .5) * g.size, z = (j / (m - 1) - .5) * g.size, k = j * m + i;
        height[k] = at(x, z);
        if (g.water)
        {
            const gi = Math.round((i / (m - 1)) * (g.n - 1)), gj = Math.round((j / (m - 1)) * (g.n - 1));
            water[k] = g.water[gj * g.n + gi];
        }
        else water[k] = height[k] < g.seaLevel ? 1 : 0;
    }
    return { m, cell: step, size: g.size, height, water };
}

export const toNode = (g: Grid, x: number, z: number) => {
    const i = Math.round((x / g.size + .5) * (g.m - 1)), j = Math.round((z / g.size + .5) * (g.m - 1));
    return Math.min(g.m - 1, Math.max(0, j)) * g.m + Math.min(g.m - 1, Math.max(0, i));
};
export const toXZ = (g: Grid, k: number): [number, number] => [((k % g.m) / (g.m - 1) - .5) * g.size, (((k / g.m) | 0) / (g.m - 1) - .5) * g.size];

/** nearest dry node to `k` within `r` nodes (or k) */
export function dry(g: Grid, k: number, r = 6): number {
    if (!g.water[k]) return k;
    const i = k % g.m, j = (k / g.m) | 0;
    let best = k, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
    {
        const x = i + dx, z = j + dz;
        if (x < 0 || z < 0 || x >= g.m || z >= g.m || g.water[z * g.m + x]) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = z * g.m + x; }
    }
    return best;
}
