import type { Biome, TerrainLook } from "@polywar/terrain-material";

export type Quality = "low" | "medium" | "high";

/** What `quality` picks; any field can be overridden in `settings`. */
export type QualitySettings = {
    /** simulation cells per side (power of two) */
    resolution: number;
    /** erosion droplets per cell */
    droplets: number;
};

export type EdgeType = "ocean" | "fields" | "none";
export type EdgeShape = "round" | "square" | "coast";

export type TerrainOptions = {
    seed: number;
    quality: Quality;
    settings: Partial<QualitySettings>;
    /** map width and depth, metres */
    size: number;
    /** highest point, metres (heights are 0..1 times this) */
    height: number;
    /** what the map fades into: ocean all round, a coast on one side, or flat far fields */
    edge: {
        type: EdgeType;
        shape: EdgeShape;
        /** part of the half size that fades, 0..1 */
        width: number;
        /** coast: degrees, where the sea is (0 = +x) */
        direction: number;
        /** wobble of the edge line 0..1 */
        noise: number;
        /** fields: their height 0..1 */
        level: number;
    };
    /** the rolling ground everything sits on */
    base: { scale: number; height: number; octaves: number; gain: number; lacunarity: number; warp: number };
    hills: { scale: number; height: number };
    /** ranges where the mask noise is above `1 - coverage`; ridged noise inside */
    mountains: { coverage: number; scale: number; ridge: number; height: number; sharpness: number; octaves: number };
    /** flat raised areas with steep sides */
    plateaus: { coverage: number; scale: number; level: number; sharpness: number; steps: number };
    /** droplet erosion (Beyer): carves valleys, leaves ridges */
    erosion: {
        enabled: boolean;
        /** steps per droplet */
        lifetime: number;
        /** 0 follows the slope, 1 keeps going */
        inertia: number;
        capacity: number;
        minCapacity: number;
        erode: number;
        deposit: number;
        evaporate: number;
        gravity: number;
        /** metres the erosion brush reaches */
        radius: number;
    };
    /** sea level 0..1 of `height` */
    sea: number;
    /** basins deeper than `depth` metres hold a lake, filled to `level` 0..1 of their depth (1 brim full, less in a dry climate), if it covers `area` m² */
    lakes: { depth: number; area: number; level: number };
    climate: {
        /** base 0 cold .. 1 hot */
        temperature: number;
        /** base 0 dry .. 1 wet */
        moisture: number;
        /** noise feature size, metres */
        scale: number;
        variation: number;
        /** cooling from sea level to the top 0..1 */
        lapse: number;
        /** metres water wets the land around it */
        reach: number;
        /** hot to cold across the map: degrees (direction) and strength */
        gradient: { direction: number; strength: number };
    };
    /** classification thresholds */
    biomes: {
        /** metres above sea and metres from the ocean */
        beach: { height: number; width: number };
        /** 0..1 height for bare mountain, slope for cliffs */
        mountain: { height: number; slope: number };
        /** temperature below which it snows */
        snow: number;
        /** slope where flat land turns to hills */
        hills: number;
        /** temperature above which it is hot (desert / savanna) */
        hot: number;
        /** moisture below which hot land is desert, below which it is savanna */
        desert: number;
        savanna: number;
        /** moisture above which land is forest */
        forest: number;
    };
    /** rivers where the catchment passes `catchment` m²; `width` / `depth` metres at that size, growing downstream; shorter than `length` metres are dropped */
    rivers: { enabled: boolean; catchment: number; width: number; maxWidth: number; depth: number; length: number };
    /** flat dry spots for towns, best first */
    cities: { count: number; radius: number; spacing: number; maxSlope: number; flatten: number; water: number };
    /**
     * `adaptive` 0..1: 0 the full grid everywhere, .5 flat land thins out, 1 as few triangles as the shape allows.
     * `chunk` size in nodes; `edges`: metres of error a biome / shore border counts as (keeps it sharp, 0 off); `skirt` metres beyond the map.
     */
    mesh: { adaptive: number; chunk: number; edges: number; skirt: number };
    /** level of detail: past `distance` metres chunks drop a level every `factor` times farther, each level `factor` times coarser; `levels` 1 = off */
    lod: { levels: number; distance: number; factor: number };
    /** material overrides (colours, rock, snow, debug view ...) */
    look: Partial<TerrainLook>;
};

/** Saveable settings: plain JSON. */
export type TerrainSettings = TerrainOptions;

/** a river from source to mouth: x y z (water surface) width, in metres */
export type River = { points: [number, number, number, number][] };

export type City = { x: number; z: number; y: number; radius: number; score: number; coast: boolean };

/** The generated map. Grids are `n`² nodes, row major (z rows, x columns), node 0 at (-size/2, -size/2). */
export type TerrainData = {
    n: number;
    /** metres between nodes */
    cell: number;
    size: number;
    /** metres */
    height: Float32Array;
    /** 0 land, 1 ocean, 2 lake, 3 river */
    water: Uint8Array;
    /** water surface, metres (sea level on land) */
    surface: Float32Array;
    /** index into `BIOMES` */
    biome: Uint8Array;
    /** 0 flat .. 1 vertical */
    slope: Float32Array;
    moisture: Float32Array;
    temperature: Float32Array;
    /** erosion water flow 0..1: streams, later rivers */
    flow: Float32Array;
    /** plateau mask 0..1 */
    plateau: Float32Array;
    /** metres to the nearest water / ocean */
    toWater: Float32Array;
    toOcean: Float32Array;
    cities: City[];
    rivers: River[];
    seaLevel: number;
};

export type Progress = { stage: string; done: number };

export type { Biome };
