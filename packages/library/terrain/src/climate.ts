import { Random } from "@papit/random";
import { fbm, simplex } from "@polywar/noise";
import { BIOMES, type Biome } from "@polywar/terrain-material";
import type { Pace } from "./pace";
import type { TerrainOptions } from "./types";

type Grids = { n: number; size: number; height: Float32Array; seaLevel: number; top: number; water: Uint8Array; toWater: Float32Array; flow: Float32Array };

/** temperature (hot 1) and moisture (wet 1), 0..1: base + noise + gradient, colder up high, wetter near water and streams */
export async function climate(o: TerrainOptions, g: Grids, pace: Pace) {
    const c = o.climate, rng = new Random(o.seed), nt = simplex(rng.fork("temperature").uint()), nm = simplex(rng.fork("moisture").uint());
    const { n, size } = g, temperature = new Float32Array(n * n), moisture = new Float32Array(n * n);
    const a = c.gradient.direction * Math.PI / 180, gx = Math.cos(a), gz = Math.sin(a);
    pace.begin("climate");
    for (let j = 0; j < n; j++)
    {
        await pace.tick(j / n);
        for (let i = 0; i < n; i++)
        {
            const k = j * n + i, u = i / (n - 1) * 2 - 1, v = j / (n - 1) * 2 - 1, x = u * size / 2, z = v * size / 2;
            const up = Math.max(0, g.height[k] - g.seaLevel) / Math.max(1, g.top - g.seaLevel);
            temperature[k] = clamp(c.temperature + fbm(nt, x / c.scale, z / c.scale, { octaves: 3 }) * c.variation - (u * gx + v * gz) * c.gradient.strength * .5 - up * c.lapse);
            const wet = Math.exp(-g.toWater[k] / Math.max(1, c.reach)) * .3 + Math.pow(g.flow[k], 4) * .25;
            moisture[k] = clamp(c.moisture + fbm(nm, x / c.scale + 50, z / c.scale, { octaves: 3 }) * c.variation + wet);
        }
    }
    return { temperature, moisture };
}

type Classify = { n: number; height: Float32Array; seaLevel: number; top: number; water: Uint8Array; slope: Float32Array; temperature: Float32Array; moisture: Float32Array; plateau: Float32Array; toOcean: Float32Array };

/** one biome per node, see `BIOMES` */
export function biomes(o: TerrainOptions, g: Classify): Uint8Array {
    const b = o.biomes, out = new Uint8Array(g.n * g.n), id = (name: Biome) => BIOMES.indexOf(name);
    const I = Object.fromEntries(BIOMES.map(name => [name, id(name)])) as Record<Biome, number>;
    for (let k = 0; k < out.length; k++)
    {
        const w = g.water[k];
        if (w) { out[k] = w === 1 ? I.ocean : I.lake; continue; }
        const h = g.height[k], t = g.temperature[k], m = g.moisture[k], s = g.slope[k], h01 = h / Math.max(1, g.top);
        if (t < b.snow) out[k] = I.snow;
        else if (h01 > b.mountain.height || s > b.mountain.slope) out[k] = I.mountain;
        else if (g.toOcean[k] < b.beach.width && h - g.seaLevel < b.beach.height && s < .25) out[k] = I.beach;
        else if (t > b.hot) out[k] = m < b.desert ? I.desert : m < b.savanna ? I.savanna : I.forest;
        else if (g.plateau[k] > .5 && s < b.hills) out[k] = m > b.forest ? I.forest : I.plateau;
        else if (s > b.hills) out[k] = I.hills;
        else out[k] = m > b.forest ? I.forest : I.grassland;
    }
    return out;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
