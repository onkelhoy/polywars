import type { Quality, QualitySettings, TerrainOptions } from "./types";

export const QUALITY: Record<Quality, QualitySettings> = {
    low: { resolution: 512, droplets: .7 },
    medium: { resolution: 1024, droplets: 1 },
    high: { resolution: 2048, droplets: 1.2 },
};

export const DEFAULTS: TerrainOptions = {
    seed: 1,
    quality: "medium",
    settings: {},
    size: 3072,
    height: 420,
    edge: { type: "ocean", shape: "round", width: .35, direction: 0, noise: .5, level: .12 },
    base: { scale: 900, height: .32, octaves: 5, gain: .5, lacunarity: 2, warp: .6 },
    hills: { scale: 260, height: .12 },
    mountains: { coverage: .38, scale: 1400, ridge: 1000, height: .55, sharpness: 1.4, octaves: 5 },
    plateaus: { coverage: .2, scale: 900, level: .36, sharpness: .06, steps: 0 },
    erosion: { enabled: true, lifetime: 32, inertia: .05, capacity: 4, minCapacity: .01, erode: .3, deposit: .3, evaporate: .015, gravity: 4, radius: 10 },
    sea: .14,
    lakes: { depth: 6, area: 8000, level: .55 },
    climate: { temperature: .55, moisture: .45, scale: 1600, variation: .3, lapse: .5, reach: 160, gradient: { direction: 90, strength: .2 } },
    biomes: {
        beach: { height: 5, width: 60 },
        mountain: { height: .62, slope: .45 },
        snow: .18,
        hills: .16,
        hot: .62,
        desert: .28,
        savanna: .5,
        forest: .68,
    },
    rivers: { enabled: true, cut: 25, catchment: 120000, width: 5, maxWidth: 28, depth: 2, length: 250 },
    cities: { count: 6, radius: 90, spacing: 350, maxSlope: .12, flatten: .7, water: .4 },
    lod: { levels: 4, distance: 400, factor: 2.5 },
    mesh: { detail: .3, adaptive: .8, chunk: 64, edges: 1.5, skirt: 6000 },
    water: {},
    look: {},
};

/** Map types for the editor and games: each is changes on top of `DEFAULTS`. */
export const MAPS: Record<string, Partial<TerrainOptions>> = {
    island: {},
    "small island": { size: 768, height: 180, quality: "low", cities: { ...DEFAULTS.cities, count: 2, radius: 50, spacing: 200 }, lakes: { depth: 2, area: 1000, level: .6 } },
    coast: { edge: { ...DEFAULTS.edge, shape: "coast", width: .45, direction: 200 } },
    inland: { edge: { ...DEFAULTS.edge, type: "fields", shape: "square", width: .25, level: .1 }, sea: .05 },
    alpine: {
        height: 900, edge: { ...DEFAULTS.edge, type: "fields", shape: "square", width: .2, level: .1 }, sea: .04,
        mountains: { ...DEFAULTS.mountains, coverage: .55, height: .7 }, climate: { ...DEFAULTS.climate, temperature: .5, moisture: .55 },
    },
    desert: {
        edge: { ...DEFAULTS.edge, type: "fields", shape: "square", width: .25, level: .1 }, sea: .03,
        climate: { ...DEFAULTS.climate, temperature: .85, moisture: .15, reach: 60 }, plateaus: { ...DEFAULTS.plateaus, coverage: .35, steps: 3 },
        mountains: { ...DEFAULTS.mountains, coverage: .25 },
    },
    savanna: {
        edge: { ...DEFAULTS.edge, type: "fields", shape: "round", width: .3, level: .1 }, sea: .05, height: 260,
        climate: { ...DEFAULTS.climate, temperature: .75, moisture: .38 }, mountains: { ...DEFAULTS.mountains, coverage: .15 },
        plateaus: { ...DEFAULTS.plateaus, coverage: .3 },
    },
    archipelago: {
        size: 4096, sea: .2, base: { ...DEFAULTS.base, scale: 600, warp: 1 }, edge: { ...DEFAULTS.edge, width: .2 },
        mountains: { ...DEFAULTS.mountains, coverage: .3, scale: 800, ridge: 400 },
    },
};


export type Resolved = TerrainOptions & { q: QualitySettings };

export function resolve(options: Partial<TerrainOptions> = {}): Resolved {
    const o = { ...DEFAULTS, ...options };
    const q = { ...QUALITY[o.quality], ...o.settings };
    // the adaptive mesh needs a power of two
    q.resolution = 2 ** Math.round(Math.log2(Math.min(2048, Math.max(32, q.resolution))));
    return { ...o, q };
}
