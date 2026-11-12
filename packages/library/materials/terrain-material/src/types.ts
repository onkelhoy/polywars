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
    /** random brightness per face 0..1: the low poly look */
    variation: number;
    /** true: one normal per face (faceted); false: smooth normals */
    flat: boolean;
    /** toon bands, 0 smooth */
    bands: number;
    lighting: { wrap: number; steepness: number };
    /** sea plane colour and opacity; `level` in metres */
    sea: { color: string; deep: string; opacity: number; level: number };
    /** lake surface colour */
    lake: string;
    /** contour line every n metres, 0 off */
    contours: number;
    /** height range for the height debug, metres */
    range: [number, number];
    debug: Debug;
};

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
