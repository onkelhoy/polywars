import { Random } from "@papit/random";
import { tileable } from "@polywar/noise";

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
        const field = tileable(size, periods[c], new Random(seed).fork(`channel:${c}`));
        for (let i = 0; i < size * size; i++) out[i * 4 + c] = field[i];
    }
    return out;
}
