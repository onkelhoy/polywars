import { cities } from "./cities";
import { biomes, climate } from "./climate";
import { erode } from "./erosion";
import { rivers } from "./rivers";
import { Pace } from "./pace";
import { resolve, type Resolved } from "./presets";
import { shape } from "./shape";
import type { City, TerrainData, TerrainOptions } from "./types";
import { distance, slopes, water, waveScale } from "./water";

/** pipeline stages in order; each names the options it reads */
const STAGES = {
    shape: (o: Resolved) => [o.seed, o.size, o.q.resolution, o.edge, o.base, o.hills, o.mountains, o.plateaus],
    cities: (o: Resolved) => [o.cities, o.sea, o.height],
    features: (_o: Resolved) => [],
    erosion: (o: Resolved) => [o.erosion, o.q.droplets],
    water: (o: Resolved) => [o.lakes, o.climate.moisture],
    rivers: (o: Resolved) => [o.rivers],
    climate: (o: Resolved) => [o.climate],
    biomes: (o: Resolved) => [o.biomes],
} as const;
type Stage = keyof typeof STAGES;
const ORDER = Object.keys(STAGES) as Stage[];

/** The raw map before erosion (metres): what `shapeOnly` gives and the `features` hook works on. */
export type RawGround = { n: number; cell: number; size: number; height: Float32Array; seaLevel: number; top: number; cities: City[] };
/** What a `features` hook gives back: `hard` (n², 0..1) protects nodes from erosion (road beds, pads). */
export type Features = { hard?: Float32Array };
/**
 * Optional steps from outside (roads, ...), the terrain itself knows nothing about them.
 * `features` runs on the raw map before erosion and may change `height` in place; `fix` runs after lakes and rivers
 * (may change `height` too). `key` names their settings: a new key reruns from `features` on.
 */
export type TerrainHooks = {
    key?: string;
    features?: (raw: RawGround) => Features | void | Promise<Features | void>;
    fix?: (data: Pick<TerrainData, "n" | "cell" | "size" | "height" | "water" | "surface" | "rivers" | "cities" | "seaLevel" | "toWater">) => void | Promise<void>;
};

type Cache = Partial<{
    shape: { h: Float32Array; plateau: Float32Array };
    cities: { height: Float32Array; hard: Float32Array; cities: TerrainData["cities"] };
    features: { height: Float32Array; hard: Float32Array };
    erosion: { h: Float32Array; flow: Float32Array };
    water: { height: Float32Array; water: Uint8Array; surface: Float32Array; down: Int32Array; acc: Float32Array; toOcean: Float32Array };
    rivers: { height: Float32Array; slope: Float32Array; water: Uint8Array; surface: Float32Array; toWater: Float32Array; toLand: Float32Array; waves: Float32Array; rivers: TerrainData["rivers"] };
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

    constructor(public hooks: TerrainHooks = {}) { }

    private key(s: Stage, o: Resolved) { return JSON.stringify(s === "features" ? [this.hooks.key ?? ""] : STAGES[s](o)); }

    /** the first stage `options` would redo, or null when nothing changed */
    dirty(options: Partial<TerrainOptions>): Stage | null {
        const o = resolve(options);
        return ORDER.find(s => this.keys[s] !== this.key(s, o)) ?? null;
    }

    /** Throws `Cancelled` when a newer `generate` started before this one finished. */
    async generate(options: Partial<TerrainOptions>, onProgress?: (stage: string, done: number) => void): Promise<TerrainData> {
        const run = ++this.run, o = resolve(options), pace = new Pace(onProgress, () => run !== this.run);
        const n = o.q.resolution + 1, cell = o.size / o.q.resolution, top = o.height, c = this.cache;
        let redo = false;
        const stale = (s: Stage) => {
            const key = this.key(s, o);
            redo ||= this.keys[s] !== key || !c[s];
            if (redo) delete this.keys[s];
            return redo ? key : null;
        };
        let key: string | null;

        if ((key = stale("shape"))) { c.shape = await shape(o, n, pace); this.keys.shape = key; }
        const seaLevel = o.sea * top;
        if ((key = stale("cities")))
        {
            const height = Float32Array.from(c.shape!.h, v => v * top), hard = new Float32Array(n * n);
            c.cities = { height, hard, cities: cities(o.cities, rawGrids(height, n, cell, o.size, seaLevel, top), hard) };
            this.keys.cities = key;
        }
        if ((key = stale("features")))
        {
            const height = c.cities!.height.slice(), hard = c.cities!.hard.slice();
            const f = await this.hooks.features?.({ n, cell, size: o.size, height, seaLevel, top, cities: c.cities!.cities.map(x => ({ ...x })) });
            if (f && f.hard) for (let i = 0; i < hard.length; i++) hard[i] = Math.max(hard[i], f.hard[i]);
            c.features = { height, hard };
            this.keys.features = key;
        }
        if ((key = stale("erosion")))
        {
            const h = Float32Array.from(c.features!.height, v => v / top), flow = new Float32Array(n * n);
            if (o.erosion.enabled && o.q.droplets > 0)
            {
                // grid units: about the same look at every resolution
                const k = o.q.resolution / 256;
                for (let i = 0; i < h.length; i++) h[i] *= k;
                await erode(h, n, Math.round(o.q.droplets * n * n), o.erosion, o.erosion.radius / cell, o.seed, flow, pace, c.features!.hard);
                for (let i = 0; i < h.length; i++) h[i] /= k;
                let max = 0;
                for (const f of flow) max = Math.max(max, f);
                const l = Math.log1p(max) || 1;
                for (let i = 0; i < flow.length; i++) flow[i] = Math.log1p(flow[i]) / l;
            }
            c.erosion = { h, flow };
            this.keys.erosion = key;
        }
        if ((key = stale("water")))
        {
            const height = Float32Array.from(c.erosion!.h, v => v * top);
            const w = await water(height, n, seaLevel, o.lakes.depth, Math.ceil(o.lakes.area / (cell * cell)), o.lakes.level * Math.min(1, .3 + o.climate.moisture * 1.4), pace);
            c.water = { height, ...w, toOcean: distance(n, cell, k => w.water[k] === 1) };
            this.keys.water = key;
        }
        if ((key = stale("rivers")))
        {
            const w = c.water!, r = { height: w.height.slice(), water: w.water.slice(), surface: w.surface.slice() };
            const list = rivers(o.rivers, { n, cell, size: o.size, ...r, down: w.down, acc: w.acc });
            const toWater = distance(n, cell, k => r.water[k] > 0);
            const city = c.cities!.cities.map(x => ({ ...x }));
            await this.hooks.fix?.({ n, cell, size: o.size, ...r, rivers: list, cities: city, seaLevel, toWater });
            const toLand = distance(n, cell, k => r.water[k] === 0 || r.water[k] === 3);
            c.rivers = { ...r, slope: slopes(r.height, n, cell), rivers: list, toWater, toLand, waves: waveScale(r.water, toLand, n) };
            this.keys.rivers = key;
        }
        if ((key = stale("climate")))
        {
            c.climate = await climate(o, { n, size: o.size, height: c.rivers!.height, seaLevel, top, water: c.rivers!.water, toWater: c.rivers!.toWater, flow: c.erosion!.flow }, pace);
            this.keys.climate = key;
        }
        if ((key = stale("biomes")))
        {
            c.biomes = {
                biome: biomes(o, {
                    n, height: c.rivers!.height, seaLevel, top, water: c.rivers!.water, slope: c.rivers!.slope,
                    temperature: c.climate!.temperature, moisture: c.climate!.moisture, plateau: c.shape!.plateau, toOcean: c.water!.toOcean,
                }),
            };
            this.keys.biomes = key;
        }
        onProgress?.("done", 1);
        return {
            n, cell, size: o.size, seaLevel,
            height: c.rivers!.height, water: c.rivers!.water, surface: c.rivers!.surface, biome: c.biomes!.biome,
            slope: c.rivers!.slope, moisture: c.climate!.moisture, temperature: c.climate!.temperature,
            flow: c.erosion!.flow, plateau: c.shape!.plateau, toWater: c.rivers!.toWater, toOcean: c.water!.toOcean, toLand: c.rivers!.toLand, waves: c.rivers!.waves,
            cities: c.cities!.cities, rivers: c.rivers!.rivers,
        };
    }
}

/** One off generation without caching. */
export const generate = (options: Partial<TerrainOptions>, onProgress?: (stage: string, done: number) => void, hooks?: TerrainHooks) => new Generator(hooks).generate(options, onProgress);

/** sea, distance to it and slope of a raw (not eroded) map: what `cities` reads */
function rawGrids(height: Float32Array, n: number, cell: number, size: number, seaLevel: number, top: number) {
    const water = Uint8Array.from(height, h => h < seaLevel ? 1 : 0), toOcean = distance(n, cell, k => water[k] === 1);
    return { n, cell, size, height, water, toWater: toOcean, toOcean, slope: slopes(height, n, cell), seaLevel, top };
}

/**
 * Fast look at the raw map: shape + town spots, no erosion, water or climate (sea = below sea level).
 * For tools that only need the land form (road experiments).
 */
export async function shapeOnly(options: Partial<TerrainOptions>, onProgress?: (stage: string, done: number) => void): Promise<RawGround> {
    const o = resolve(options), n = o.q.resolution + 1, cell = o.size / o.q.resolution, top = o.height, seaLevel = o.sea * top;
    const s = await shape(o, n, new Pace(onProgress, () => false));
    const height = Float32Array.from(s.h, v => v * top);
    const spots = cities(o.cities, rawGrids(height, n, cell, o.size, seaLevel, top), new Float32Array(n * n));
    return { n, cell, size: o.size, height, seaLevel, top, cities: spots };
}
