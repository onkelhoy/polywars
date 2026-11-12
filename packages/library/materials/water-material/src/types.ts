export type Vec3 = [number, number, number];

export type WaterLook = {
    /** sRGB hex: shallow and deep sea water */
    shallow: string;
    deep: string;
    /** lakes and rivers (`use(..., { fresh: true })`) */
    fresh: { shallow: string; deep: string };
    /** see through at the shore 0..1 (deep water is opaque) */
    opacity: number;
    /** metres of water until it is mostly the deep colour */
    clarity: number;
    /** sun on the water as hard white flecks (no smooth glare): `strength` 0..2, `size` 0..1 how much of the ripple catches it, `scale` metres per ripple, `far` metres they fade out by */
    sparkle: { strength: number; size: number; scale: number; far: number };
    /** sky tint at grazing angles 0..1 (keeps the flat colour, just lighter in the distance) */
    sky: number;
    /** white lines along the shore: a wobbly rim `shore` metres wide, lines within `width` metres, `spacing` apart, drifting in at `speed`; only within `far` metres of the camera */
    foam: { color: string; width: number; spacing: number; speed: number; amount: number; shore: number; far: number };
    /** rivers: white streaks running with the stream, `length` / `width` metres, `amount` 0..1 (more where it flows faster) */
    streaks: { amount: number; length: number; width: number };
    /** looking from below the surface: fog colour and density; `caustics` light on the bed */
    under: { color: string; density: number; caustics: number };
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
