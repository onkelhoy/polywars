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
    /** Gerstner swell: `length` metres, `strength` 0..1 steepness, `direction` / `spread` degrees, `speed` time scale */
    waves: { strength: number; length: number; speed: number; direction: number; spread: number };
    /** sun highlight and sky reflection; `bands` > 0 gives a hard toon highlight */
    gloss: { strength: number; shininess: number; fresnel: number; bands: number };
    /** close up detail from the ripple texture: `scale` metres per tile, fades in between `far` and `near` metres */
    ripples: { scale: number; strength: number; speed: number; near: number; far: number };
    /** white lines running in to the shore within `width` metres, `spacing` metres apart; `shore` metres of steady foam on the edge */
    foam: { color: string; width: number; spacing: number; speed: number; amount: number; shore: number };
    /** looking from below the surface: fog colour and density; `caustics` light on the bed */
    under: { color: string; density: number; caustics: number };
    /** faceted (low poly) or smooth wave normals */
    flat: boolean;
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
