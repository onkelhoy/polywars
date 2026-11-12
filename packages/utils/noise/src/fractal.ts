import type { Noise2D } from "./simplex";

export type Fractal = {
    /** layers of detail */
    octaves: number;
    /** frequency step per octave */
    lacunarity: number;
    /** amplitude step per octave (persistence) */
    gain: number;
};

export const FRACTAL: Fractal = { octaves: 5, lacunarity: 2, gain: .5 };

/** Fractal sum of `noise`, normalised to about -1..1. */
export function fbm(noise: Noise2D, x: number, y: number, o: Partial<Fractal> = {}): number {
    const { octaves, lacunarity, gain } = { ...FRACTAL, ...o };
    let sum = 0, amplitude = 1, total = 0, f = 1;
    for (let i = 0; i < octaves; i++, f *= lacunarity, amplitude *= gain)
    {
        sum += amplitude * noise(x * f + i * 17.3, y * f - i * 9.1);
        total += amplitude;
    }
    return sum / total;
}

/**
 * Ridged multifractal, 0..1: sharp crests where the noise crosses 0.
 * Each octave is weighted by the one before, so detail gathers on the ridges.
 */
export function ridged(noise: Noise2D, x: number, y: number, o: Partial<Fractal> & { sharpness?: number } = {}): number {
    const { octaves, lacunarity, gain, sharpness = 2 } = { ...FRACTAL, ...o };
    let sum = 0, amplitude = 1, total = 0, f = 1, weight = 1;
    for (let i = 0; i < octaves; i++, f *= lacunarity, amplitude *= gain)
    {
        let v = 1 - Math.abs(noise(x * f + i * 17.3, y * f - i * 9.1));
        v = Math.pow(v, sharpness) * weight;
        weight = Math.min(1, Math.max(0, v * 2));
        sum += v * amplitude;
        total += amplitude;
    }
    return sum / total;
}

/** Billow: abs folded noise, 0..1, puffy rounded hills. */
export function billow(noise: Noise2D, x: number, y: number, o: Partial<Fractal> = {}): number {
    return fbm((a, b) => Math.abs(noise(a, b)) * 2 - 1, x, y, o) * .5 + .5;
}

/** Domain warp: offsets `x y` by two noise samples scaled by `strength`. Returns the warped point. */
export function warp(noise: Noise2D, x: number, y: number, strength: number, o: Partial<Fractal> = {}): [number, number] {
    return [x + strength * fbm(noise, x + 5.2, y + 1.3, o), y + strength * fbm(noise, x - 3.7, y + 8.4, o)];
}
