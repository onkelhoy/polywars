import { tileable } from "@polywar/noise";

/**
 * The water texture, RGBA8 `size`², tileable: rg ripple normal (x z, .5 = flat), b caustics, a foam breakup noise.
 * Pure data, also handy for the ground (caustics).
 */
export function waterTexture(size = 256, seed = 7): Uint8Array {
    const height = tileable(size, 8, seed), caustic = tileable(size, 6, seed + 1), caustic2 = tileable(size, 5, seed + 3), foam = tileable(size, 12, seed + 2);
    const out = new Uint8Array(size * size * 4), at = (x: number, y: number) => height[((y + size) % size) * size + (x + size) % size] / 255;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    {
        const k = y * size + x;
        const nx = (at(x - 1, y) - at(x + 1, y)) * 6, nz = (at(x, y - 1) - at(x, y + 1)) * 6;
        // caustics: thin bright lines where two ridged layers meet
        const r1 = 1 - Math.abs(caustic[k] / 127.5 - 1), r2 = 1 - Math.abs(caustic2[k] / 127.5 - 1);
        const c = Math.pow(Math.min(r1, r2) * .5 + Math.max(r1, r2) * .5, 6);
        out.set([128 + Math.max(-127, Math.min(127, nx * 127)), 128 + Math.max(-127, Math.min(127, nz * 127)), Math.min(255, c * 400), foam[k]], k * 4);
    }
    return out;
}
