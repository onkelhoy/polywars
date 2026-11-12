export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type Quality = "low" | "medium" | "high";
export type Style = "pixel" | "smooth";
/** `sprite`: one camera facing quad, `cross`: crossed planes, `mesh`: the given `TuftMesh` instanced */
export type Source = "sprite" | "cross" | "mesh";

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

export type Wind = {
    /** xz direction */
    direction: Vec2;
    /** noise scroll speed */
    speed: number;
    /** noise repeats per metre */
    scale: number;
    /** -1..1 brightness of the wind noise */
    threshold: number;
    /** degrees the two noises split */
    diverge: number;
    /** max lean in degrees */
    angle: number;
    /** UV skew that fakes the lean towards / away from the camera */
    perspective: number;
};

export type Sway = { /** cycles per second */ speed: number; /** degrees */ angle: number };

/** colours are sRGB hex. `scale`: noise repeats per metre, the patch shows where noise > `threshold`, blended over ± `softness` */
export type Patch = { color: string; scale: number; threshold: number; softness: number };
/** main tuft sprite: `leaves` fat leaves in all directions (centred, reads from above), `blades` a fan of blades (rooted), `mixed` both (`bladeShare`) */
export type Shape = "leaves" | "blades" | "mixed";
/** rare tufts with their own sprite. `chance` 0..1 per tuft */
export type Accent = { chance: number; color: string; /** metres added to the height */ height: number; scale: number };

export type Push = { /** degrees */ angle: number; /** steepness of the falloff */ exponent: number };

export type Clouds = {
    /** metres per noise repeat */
    scale: number;
    speed: number;
    direction: Vec2;
    /** y the shadows are cast from */
    height: number;
    contrast: number;
    threshold: number;
    /** darkest a cloud can make the sun */
    min: number;
    diverge: number;
};

export type Lighting = { wrap: number; steepness: number };

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

/** What the grass needs from a camera; `@papit/game-engine`'s `Camera` fits. */
export type View = {
    viewMatrix: ArrayLike<number>;
    projectionMatrix: ArrayLike<number>;
    worldPosition?: { x: number; y: number; z: number };
};

/** x y z radius */
export type Pusher = [number, number, number, number];
