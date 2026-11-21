import type { CoverAt, CoverMap } from "./types";

/**
 * Fill a cover map from a function (world metres; texel centres). `at` writes density / dry / height / flowers into `out`.
 * Heights are stored 0..2 times.
 */
export function coverMap(size: number, n: number, at: (x: number, z: number, out: CoverAt) => CoverAt | void): CoverMap {
    const data = new Uint8Array(n * n * 4), out: CoverAt = { density: 0, height: 1, dry: 0, flowers: 0 }, cell = size / n, h = size / 2;
    const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
    for (let j = 0, k = 0; j < n; j++) for (let i = 0; i < n; i++, k += 4)
    {
        out.density = 0; out.height = 1; out.dry = 0; out.flowers = 0;
        at(-h + (i + .5) * cell, -h + (j + .5) * cell, out);
        data[k] = byte(out.density); data[k + 1] = byte(out.dry); data[k + 2] = byte(out.height / 2); data[k + 3] = byte(out.flowers);
    }
    return { data, n, size };
}

/** Grass from a cover map at a spot (bilinear, like the ground reads it). Outside: none. `out` is reused when given. */
export function coverAt(map: CoverMap, x: number, z: number, out: CoverAt = { density: 0, height: 1, dry: 0, flowers: 0 }): CoverAt {
    const { n, size, data } = map, g = (v: number) => (v / size + .5) * n - .5;
    const fx = g(x), fz = g(z);
    out.density = 0; out.height = 1; out.dry = 0; out.flowers = 0;
    if (fx < -.5 || fz < -.5 || fx > n - .5 || fz > n - .5) return out;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const c = (a: number, b: number, ch: number) => data[(Math.max(0, Math.min(n - 1, b)) * n + Math.max(0, Math.min(n - 1, a))) * 4 + ch];
    const s = (ch: number) => ((c(i, j, ch) * (1 - u) + c(i + 1, j, ch) * u) * (1 - v) + (c(i, j + 1, ch) * (1 - u) + c(i + 1, j + 1, ch) * u) * v) / 255;
    out.density = s(0); out.dry = s(1); out.height = s(2) * 2; out.flowers = s(3);
    return out;
}
