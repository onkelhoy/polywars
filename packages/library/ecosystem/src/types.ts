import type { Family, NatureList } from "@polywar/nature";
export type { Family, NatureList };

/**
 * What the ecosystem reads from a terrain. `@polywar/terrain`'s `TerrainData` fits, plus `biomes` (names in index order).
 * Grids are `n`² nodes, row major (z rows, x columns), node 0 at (-size/2, -size/2).
 */
export type Ground = {
    n: number;
    size: number;
    /** metres */
    height: Float32Array;
    /** 0 land, 1 ocean, 2 lake, 3 river */
    water: Uint8Array;
    /** water surface, metres */
    surface: Float32Array;
    biome: Uint8Array;
    /** biome names in index order */
    biomes: readonly string[];
    /** 0 flat .. 1 vertical */
    slope: Float32Array;
    moisture: Float32Array;
    temperature: Float32Array;
    /** stream flow 0..1 */
    flow: Float32Array;
    /** metres to the nearest water */
    toWater: Float32Array;
    /** metres from water to the shore (0 on land) */
    toLand: Float32Array;
    cities: { x: number; z: number; radius: number }[];
    /** slope where the ground shows bare rock (terrain look), default .55 */
    rockSlope?: number;
    /** metres where the snow cap starts (terrain look), default none */
    snowHeight?: number;
};

/** What grass looks like at a spot (all 0..1 but `height`, a multiplier around 1). */
export type GrassCover = { density: number; height: number; dry: number; flowers: number };

/** A group of families placed the same way, e.g. `conifer` (pines), `rock`, `flower`. */
export type Group = {
    /** families: by kind and / or tags (any), never with `not` tags */
    select: { kind?: string | string[]; tags?: string[]; not?: string[] };
    /** placing order: lower first, later layers make room for earlier ones */
    layer: number;
    /** room each prop keeps, times its radius (1 = canopies touch) */
    spacing: number;
    /** clumping: noise feature size in metres, `amount` 0 even .. 1 tight clumps */
    cluster: { scale: number; amount: number };
    /** climate band 0..1 it grows in (soft edges) */
    temperature?: [number, number];
    moisture?: [number, number];
    /** metres: only within this reach of water, denser closer */
    water?: number;
    /** floats on shallow lake / river water by the shore */
    floats?: boolean;
    /** size times this (on top of the family's scale range) */
    scale?: number;
    /** deep in a core biome (`EcosystemOptions.core`): size, density and spacing times these at full depth, fading to the edges */
    core?: { scale: number; density: number; spacing?: number };
    /** scale bias: > 1 more small ones (rocks) */
    small?: number;
    /** part of the ground hidden under the prop that stops grass, times radius (default by kind) */
    solid?: number;
    /** hard cap */
    max: number;
};

/** Per biome: props per hectare by group, and the grass. */
export type BiomeRule = { props: Record<string, number>; grass: GrassCover };

export type EcosystemOptions = {
    seed: number;
    /** all prop densities times this */
    density: number;
    /** cover maps: cells per side (map is resampled), and metres the biome borders blend over */
    cover: { resolution: number; blend: number };
    /** share of autumn trees 0..1; snow variants below `snow` temperature or on the snow cap */
    season: { autumn: number; snow: number };
    /** towns: clearing radius (times the city radius) and grass density / height there */
    cities: { clear: number; grass: number; height: number };
    /** grass at props: `ring` size (times canopy), how much taller, share of props with a bare spot instead */
    around: { ring: number; taller: number; bare: number };
    /** core biomes (e.g. forest): depth 0 at the border .. 1 `reach` metres in; groups' `core` scales with it */
    core: { biomes: string[]; reach: number };
    groups: Record<string, Group>;
    biomes: Record<string, BiomeRule>;
};

/** Saveable: plain JSON. */
export type EcosystemSettings = EcosystemOptions;

/** Floats per placed prop in `Batch.data`. */
export const STRIDE = 8;

/** Every prop of one model: `data` is `STRIDE` floats each: x y z scale yaw tint sway solid. */
export type Batch = { model: string; family: string; kind: string; group: string; layer: number; data: Float32Array; count: number; radius: number; height: number };
