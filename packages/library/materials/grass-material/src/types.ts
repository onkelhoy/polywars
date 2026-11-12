export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** `sprite`: one camera facing quad, `cross`: crossed planes, `mesh`: any mesh instanced */
export type Source = "sprite" | "cross" | "mesh";

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

/** What the material needs from a camera; `@papit/game-engine`'s `Camera` fits. */
export type View = {
    viewMatrix: ArrayLike<number>;
    projectionMatrix: ArrayLike<number>;
    worldPosition?: { x: number; y: number; z: number };
};

/** x y z radius */
export type Pusher = [number, number, number, number];

/** Everything the grass looks like: the material's settings. */
export type GrassLook = {
    /** tuft width, height in metres */
    size: Vec2;
    color: string;
    shape: Shape;
    /** part of the tufts that are blades with shape `mixed`, 0..1 */
    bladeShare: number;
    /** random brightness per tuft 0..1 */
    variation: number;
    patches: Patch[];
    /** up to 2 */
    accents: Accent[];
    /** colour of dry grass: tufts with a `dry` cover (instance 5) fade to it */
    dry: string;
    /** extra chance of accent 1 (the flower) at full `flowers` cover (instance 5) */
    flowers: number;
    wind: Wind;
    sway: Sway;
    push: Push;
    /** cloud shadows, `null` off */
    clouds: Clouds | null;
    lighting: Lighting;
    /** toon bands, 0 smooth */
    bands: number;
    /** soft edges between toon bands, 0 hard */
    softBands: number;
    /** nearest filtering for the sprites (and pixel sized ground texels) */
    pixelated: boolean;
    /** generated sprite size in pixels */
    pixels: number;
    /** step the animation clock to `framerate` */
    stepped: boolean;
    framerate: number;
    /** noise texture size, power of two */
    noiseSize: number;
    /** characters that can push grass (compiled into the shader) */
    pushers: number;
    /** tuft geometry kind (the shader faces `sprite` quads to the camera) */
    source: Source;
    /** metres; tufts shrink away over the last 20% */
    distance: number;
    /** sprite overrides (url or image): 0 leaves, 1 accent 1, 2 accent 2, 3 blades */
    sprites?: (string | TexImageSource | null | undefined)[];
    /** debug colours: wind noise or push */
    debug?: "" | "wind" | "push";
};
