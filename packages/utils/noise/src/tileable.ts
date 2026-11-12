import { Random, type Seed } from "@papit/random";
import { smooth } from "./simplex";

/**
 * Tileable fractal value noise, `size`² bytes 0..255, repeats seamlessly over the square.
 * `period` is the cells per tile of the first octave; each octave doubles it.
 */
export function tileable(size: number, period: number, seed: Seed | Random = 1, octaves = 5): Uint8Array {
    const rng = seed instanceof Random ? seed : new Random(seed);
    const sum = new Float32Array(size * size);
    let amplitude = 1;
    for (let octave = 0; octave < octaves; octave++, period *= 2, amplitude *= .5)
    {
        const lattice = new Float32Array(period * period);
        for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
        const at = (i: number, j: number) => lattice[(j % period) * period + (i % period)];
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
        {
            const fx = x / size * period, fy = y / size * period;
            const x0 = Math.floor(fx), y0 = Math.floor(fy);
            const tx = smooth(fx - x0), ty = smooth(fy - y0);
            const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
            sum[y * size + x] += amplitude * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        }
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of sum) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const out = new Uint8Array(size * size);
    for (let i = 0; i < sum.length; i++) out[i] = Math.round((sum[i] - lo) / (hi - lo || 1) * 255);
    return out;
}
