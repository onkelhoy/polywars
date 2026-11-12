import { cities } from "./cities";
import { biomes, climate } from "./climate";
import { erode } from "./erosion";
import { Pace } from "./pace";
import { resolve, type Resolved } from "./presets";
import { shape } from "./shape";
import type { TerrainData, TerrainOptions } from "./types";
import { distance, slopes, water } from "./water";

/** pipeline stages in order; each names the options it reads */
const STAGES = {
    shape: (o: Resolved) => [o.seed, o.size, o.q.resolution, o.edge, o.base, o.hills, o.mountains, o.plateaus],
    erosion: (o: Resolved) => [o.erosion, o.q.droplets],
    water: (o: Resolved) => [o.sea, o.lakes, o.height, o.climate.moisture],
    cities: (o: Resolved) => [o.cities],
    climate: (o: Resolved) => [o.climate],
    biomes: (o: Resolved) => [o.biomes],
} as const;
type Stage = keyof typeof STAGES;
const ORDER = Object.keys(STAGES) as Stage[];

type Cache = Partial<{
    shape: { h: Float32Array; plateau: Float32Array };
    erosion: { h: Float32Array; flow: Float32Array };
    water: { height: Float32Array; water: Uint8Array; surface: Float32Array; toWater: Float32Array; toOcean: Float32Array };
    cities: { height: Float32Array; slope: Float32Array; cities: TerrainData["cities"] };
    climate: { temperature: Float32Array; moisture: Float32Array };
    biomes: { biome: Uint8Array };
}>;

/**
 * Builds terrain data step by step, keeping each stage's result: a new run only redoes the stages whose options
 * changed (and the ones after). Yields to the page while it works.
 */
export class Generator {
    private keys: Partial<Record<Stage, string>> = {};
    private cache: Cache = {};
    private run = 0;

    /** the first stage `options` would redo, or null when nothing changed */
    dirty(options: Partial<TerrainOptions>): Stage | null {
        const o = resolve(options);
        return ORDER.find(s => this.keys[s] !== JSON.stringify(STAGES[s](o))) ?? null;
    }

    /** Throws `Cancelled` when a newer `generate` started before this one finished. */
    async generate(options: Partial<TerrainOptions>, onProgress?: (stage: string, done: number) => void): Promise<TerrainData> {
        const run = ++this.run, o = resolve(options), pace = new Pace(onProgress, () => run !== this.run);
        const n = o.q.resolution + 1, cell = o.size / o.q.resolution, top = o.height, c = this.cache;
        let redo = false;
        const stale = (s: Stage) => {
            const key = JSON.stringify(STAGES[s](o));
            redo ||= this.keys[s] !== key || !c[s];
            if (redo) delete this.keys[s];
            return redo ? key : null;
        };
        let key: string | null;

        if ((key = stale("shape"))) { c.shape = await shape(o, n, pace); this.keys.shape = key; }
        if ((key = stale("erosion")))
        {
            const h = c.shape!.h.slice(), flow = new Float32Array(n * n);
            if (o.erosion.enabled && o.q.droplets > 0)
            {
                // grid units: about the same look at every resolution
                const k = o.q.resolution / 256;
                for (let i = 0; i < h.length; i++) h[i] *= k;
                await erode(h, n, Math.round(o.q.droplets * n * n), o.erosion, o.erosion.radius / cell, o.seed, flow, pace);
                for (let i = 0; i < h.length; i++) h[i] /= k;
                let max = 0;
                for (const f of flow) max = Math.max(max, f);
                const l = Math.log1p(max) || 1;
                for (let i = 0; i < flow.length; i++) flow[i] = Math.log1p(flow[i]) / l;
            }
            c.erosion = { h, flow };
            this.keys.erosion = key;
        }
        const seaLevel = o.sea * top;
        if ((key = stale("water")))
        {
            const height = Float32Array.from(c.erosion!.h, v => v * top);
            const w = await water(height, n, seaLevel, o.lakes.depth, Math.ceil(o.lakes.area / (cell * cell)), o.lakes.level * Math.min(1, .3 + o.climate.moisture * 1.4), pace);
            c.water = { height, ...w, toWater: distance(n, cell, k => w.water[k] > 0), toOcean: distance(n, cell, k => w.water[k] === 1) };
            this.keys.water = key;
        }
        if ((key = stale("cities")))
        {
            const w = c.water!, height = w.height.slice(), base = { n, cell, size: o.size, height, water: w.water, toWater: w.toWater, toOcean: w.toOcean, seaLevel, top };
            const spots = cities(o.cities, { ...base, slope: slopes(height, n, cell) });
            c.cities = { height, slope: slopes(height, n, cell), cities: spots };
            this.keys.cities = key;
        }
        if ((key = stale("climate")))
        {
            c.climate = await climate(o, { n, size: o.size, height: c.cities!.height, seaLevel, top, water: c.water!.water, toWater: c.water!.toWater, flow: c.erosion!.flow }, pace);
            this.keys.climate = key;
        }
        if ((key = stale("biomes")))
        {
            c.biomes = {
                biome: biomes(o, {
                    n, height: c.cities!.height, seaLevel, top, water: c.water!.water, slope: c.cities!.slope,
                    temperature: c.climate!.temperature, moisture: c.climate!.moisture, plateau: c.shape!.plateau, toOcean: c.water!.toOcean,
                }),
            };
            this.keys.biomes = key;
        }
        onProgress?.("done", 1);
        return {
            n, cell, size: o.size, seaLevel,
            height: c.cities!.height, water: c.water!.water, surface: c.water!.surface, biome: c.biomes!.biome,
            slope: c.cities!.slope, moisture: c.climate!.moisture, temperature: c.climate!.temperature,
            flow: c.erosion!.flow, plateau: c.shape!.plateau, toWater: c.water!.toWater, toOcean: c.water!.toOcean,
            cities: c.cities!.cities,
        };
    }
}

/** One off generation without caching. */
export const generate = (options: Partial<TerrainOptions>, onProgress?: (stage: string, done: number) => void) => new Generator().generate(options, onProgress);
