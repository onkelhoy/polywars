/**
 * Tileable fractal noise, RGBA8, one pattern per channel:
 * r wind, g patch 1, b patch 2, a clouds. Each channel repeats seamlessly over the texture.
 */
export function noise(size: number, seed = 1): Uint8Array {
    const out = new Uint8Array(size * size * 4);
    // cells per tile of the first octave, per channel
    const periods = [4, 3, 5, 4];
    for (let c = 0; c < 4; c++)
    {
        const field = fbm(size, periods[c], seed * 7919 + c * 104729);
        for (let i = 0; i < size * size; i++) out[i * 4 + c] = field[i];
    }
    return out;
}

function fbm(size: number, period: number, seed: number): Uint8Array {
    const sum = new Float32Array(size * size);
    let amplitude = 1, total = 0;
    for (let octave = 0; octave < 5; octave++, period *= 2, amplitude *= .5)
    {
        const lattice = new Float32Array(period * period);
        for (let i = 0; i < lattice.length; i++) lattice[i] = hash(i + seed * 31 + octave * 977);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
        {
            const fx = x / size * period, fy = y / size * period;
            const x0 = Math.floor(fx), y0 = Math.floor(fy);
            const tx = smooth(fx - x0), ty = smooth(fy - y0);
            const at = (i: number, j: number) => lattice[(j % period) * period + (i % period)];
            const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
            sum[y * size + x] += amplitude * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        }
        total += amplitude;
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of sum) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const out = new Uint8Array(size * size);
    for (let i = 0; i < sum.length; i++) out[i] = Math.round((sum[i] - lo) / (hi - lo || 1) * 255);
    return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 0..1 from an integer */
export function hash(n: number) {
    n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
