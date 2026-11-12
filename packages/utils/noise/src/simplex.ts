import { Random, type Seed } from "@papit/random";

/** 2D noise: (x, y) to about -1..1 */
export type Noise2D = (x: number, y: number) => number;

const F2 = .5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];

/** seeded permutation table, 512 entries */
function permutation(seed: Seed) {
    const rng = new Random(seed), p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = rng.int(0, i + 1); [p[i], p[j]] = [p[j], p[i]]; }
    const out = new Uint8Array(512);
    for (let i = 0; i < 512; i++) out[i] = p[i & 255];
    return out;
}

/** Seeded 2D simplex noise, about -1..1. */
export function simplex(seed: Seed = 1): Noise2D {
    const perm = permutation(seed);
    return (x, y) => {
        const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
        const t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
        const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
        const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
        const ii = i & 255, jj = j & 255;
        let n = 0;
        const corner = (dx: number, dy: number, g: number) => {
            const a = .5 - dx * dx - dy * dy;
            if (a <= 0) return;
            const k = (g & 7) * 2;
            n += a * a * a * a * (GRAD[k] * dx + GRAD[k + 1] * dy);
        };
        corner(x0, y0, perm[ii + perm[jj]]);
        corner(x1, y1, perm[ii + i1 + perm[jj + j1]]);
        corner(x2, y2, perm[ii + 1 + perm[jj + 1]]);
        return 70 * n;
    };
}

/** Seeded 2D value noise (smooth lattice), about -1..1. Cheaper and blockier than simplex. */
export function value(seed: Seed = 1): Noise2D {
    const perm = permutation(seed);
    const at = (i: number, j: number) => perm[(i & 255) + perm[j & 255]] / 127.5 - 1;
    return (x, y) => {
        const i = Math.floor(x), j = Math.floor(y), tx = smooth(x - i), ty = smooth(y - j);
        const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
        return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
}

export const smooth = (t: number) => t * t * (3 - 2 * t);
