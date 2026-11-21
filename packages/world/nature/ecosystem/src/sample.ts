import type { Ground } from "./types";

/** grid position of world x / z (fractional), clamped */
function at(n: number, size: number, v: number) { return Math.min(n - 1, Math.max(0, (v / size + .5) * (n - 1))); }

/** bilinear sample of an `n`² grid over `size` metres */
export function bilinear(grid: ArrayLike<number>, n: number, size: number, x: number, z: number): number {
    const gx = at(n, size, x), gz = at(n, size, z), i = Math.min(n - 2, gx | 0), j = Math.min(n - 2, gz | 0), fx = gx - i, fz = gz - j, k = j * n + i;
    return grid[k] * (1 - fx) * (1 - fz) + grid[k + 1] * fx * (1 - fz) + grid[k + n] * (1 - fx) * fz + grid[k + n + 1] * fx * fz;
}

/** nearest node of an `n`² grid */
export function nearest(grid: ArrayLike<number>, n: number, size: number, x: number, z: number): number {
    return grid[Math.round(at(n, size, z)) * n + Math.round(at(n, size, x))];
}

export const sample = (g: Ground, grid: ArrayLike<number>, x: number, z: number) => bilinear(grid, g.n, g.size, x, z);
export const near = (g: Ground, grid: ArrayLike<number>, x: number, z: number) => nearest(grid, g.n, g.size, x, z);

export const smoothstep = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 1 inside [a, b], soft edges; an end at 0 / 1 stays open */
export function band(v: number, range: [number, number] | undefined, soft = .06) {
    if (!range) return 1;
    const [a, b] = range;
    return (a <= 0 ? 1 : smoothstep(a - soft, a + soft, v)) * (b >= 1 ? 1 : 1 - smoothstep(b - soft, b + soft, v));
}
