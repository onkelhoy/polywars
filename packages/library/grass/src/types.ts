import type { Accent, Clouds, Lighting, Patch, Push, Shape, Source, Sway, Vec2, Wind } from "@polywar/grass-material";
// the look types live in the material
export type { Accent, Clouds, Light, Lighting, Patch, Push, Pusher, Shape, Source, Sway, Vec2, Vec3, View, Wind } from "@polywar/grass-material";

export type Quality = "low" | "medium" | "high";
export type Style = "pixel" | "smooth";

/** Plain geometry for the `mesh` source (fits `@papit/game-mesh` `Mesh`). Base at y = 0. */
export type TuftMesh = {
    positions: Float32Array;
    normals: Float32Array;
    colors?: Float32Array;
    indices?: Uint16Array | Uint32Array;
};

/** What quality changes. Presets in `QUALITY`, any field can be overridden. */
export type QualitySettings = {
    /** tufts per m² */
    density: number;
    /** hard cap on planted tufts */
    maxTufts: number;
    /** metres; tufts shrink away over the last 20% */
    distance: number;
    /** fraction of tufts still drawn at `distance` (chunks draw a prefix of their shuffled tufts) */
    lod: number;
    /** tufts get bigger when density drops, so the cover stays */
    sizeScale: number;
    source: Source;
    /** planes per tuft for `cross` */
    planes: number;
    clouds: boolean;
    /** characters that can push grass (compiled into the shader) */
    pushers: number;
    /** soft edges between toon bands, 0 hard */
    softBands: number;
    /** noise texture size, power of two */
    noiseSize: number;
};

export type StyleSettings = {
    /** nearest filtering for the sprites */
    pixelated: boolean;
    /** step the animation clock to `framerate` */
    stepped: boolean;
    framerate: number;
    /** toon bands, 0 smooth */
    bands: number;
    /** generated sprite size in pixels */
    pixels: number;
};

export type GrassOptions = {
    quality: Quality;
    style: Style;
    /** overrides on top of the quality preset */
    settings: Partial<QualitySettings>;
    /** overrides on top of the style preset */
    look: Partial<StyleSettings>;
    /** tuft width, height in metres */
    size: Vec2;
    /** random size spread 0..1 */
    sizeJitter: number;
    color: string;
    shape: Shape;
    /** part of the tufts that are blades with shape `mixed`, 0..1 */
    bladeShare: number;
    /** random brightness per tuft 0..1 */
    variation: number;
    patches: Patch[];
    /** up to 2 */
    accents: Accent[];
    wind: Wind;
    sway: Sway;
    push: Push;
    clouds: Clouds;
    lighting: Lighting;
    /** geometry for the `mesh` source */
    mesh?: TuftMesh;
    /** sprite overrides (url or image): 0 leaves, 1 accent 1, 2 accent 2, 3 blades */
    sprites?: (string | TexImageSource | null | undefined)[];
    /** metres per chunk */
    chunk: number;
    /** debug colours: wind noise or push */
    debug?: "" | "wind" | "push";
};

/** Saveable settings: everything but the mesh and image sprites (sprite urls stay). Pass it as options. */
export type GrassSettings = Omit<GrassOptions, "mesh" | "sprites"> & { sprites?: (string | null)[] };

/** Where to plant. `mask` 0..1 is the chance a tuft grows, `height` the ground y. */
export type Planting = {
    area: { x: number; z: number; width: number; depth: number };
    seed?: number;
    mask?: (x: number, z: number) => number;
    height?: (x: number, z: number) => number;
};
