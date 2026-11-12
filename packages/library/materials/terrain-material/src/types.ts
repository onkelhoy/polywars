import type { WaterLook } from "@polywar/water";
export type Vec3 = [number, number, number];

/** Biomes in palette order; the mesh `data.x` attribute is the index. */
export const BIOMES = ["ocean", "lake", "beach", "grassland", "savanna", "desert", "forest", "hills", "plateau", "mountain", "snow", "river"] as const;
export type Biome = typeof BIOMES[number];

export type Debug = "" | "biome" | "height" | "slope" | "moisture" | "temperature" | "flow";

export type TerrainLook = {
    /** sRGB hex per biome */
    colors: Record<Biome, string>;
    /** steep faces turn to rock: slope (0 flat, 1 vertical) where it starts, and how soft */
    rock: { color: string; slope: number; softness: number };
    /** snow cap above this height in metres, softened over `softness` metres; snow avoids steep faces */
    snow: { color: string; height: number; softness: number; slope: number };
    /**
     * Painted ground (needs `material.biomes(map)`): biome borders are ragged brush stroke edges `edge` metres deep (0: the mesh's
     * triangle borders), strokes about `size` metres long; `strokes` 0..1 hard edged light / dark stroke patches inside a biome.
     */
    paint: { edge: number; size: number; strokes: number };
    /** sun highlight 0..1: steep rock faces, and ground `reach` metres from water (fading out; needs `toWater` in the biome map) */
    gloss: { rock: number; wet: number; reach: number };
    /** random brightness per face 0..1: the low poly look */
    variation: number;
    /** true: one normal per face (faceted); false: smooth normals */
    flat: boolean;
    /** toon bands, 0 smooth */
    bands: number;
    lighting: { wrap: number; steepness: number };
    /** contour line every n metres, 0 off */
    contours: number;
    /** height range for the height debug, metres */
    range: [number, number];
    debug: Debug;
};

/** Biome (and water distance) per grid node (row major, z rows, node 0 at -size/2), what the painted borders read. `@polywar/terrain`'s data fits. */
export type BiomeMap = { n: number; size: number; biome: Uint8Array; /** metres to the nearest water (wet ground gloss) */ toWater?: Float32Array };

/** What the ground needs from the water: its underwater look (bed tint, fog) and the surface over the eye (null: eye above water). */
export type Underwater = { time: number; under: WaterLook["under"]; eyeSurface: number | null };

/** Same shape as the polywar `Renderer.light`, so that one can be passed in. Colours linear. */
export type Light = {
    sunDirection: Vec3;
    sunColor: Vec3;
    sunStrength: number;
    sky: Vec3;
    ground: Vec3;
    ambient: number;
    fogColor: Vec3;
    fogDensity: number;
};

/** What the material needs from a camera; `@papit/game-engine`'s `Camera` fits. */
export type View = {
    viewMatrix: ArrayLike<number>;
    projectionMatrix: ArrayLike<number>;
    worldPosition?: { x: number; y: number; z: number };
};
