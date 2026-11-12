export type Vec3 = [number, number, number];

/** All lengths in metres. Colours sRGB hex. */
export type WaterLook = {
    /** surface colour over shallow and deep water */
    shallow: string;
    deep: string;
    /** lakes and rivers (`use(..., { fresh: true })`) */
    fresh: { shallow: string; deep: string };
    /** see through at the shore 0..1 (deep water is opaque) */
    opacity: number;
    /** water depth until the surface is mostly the deep colour */
    clarity: number;
    /** sky tint at grazing angles 0..1 */
    sky: number;
    /**
     * Toon surface detail: short wavy dashes along the shore drifting in at `speed` m/s, `scale` apart, `length` long, a shade darker (`dark` 0..1) and white where they
     * catch the sun (`lane` 0..1 how wide the sun's reflection is); tiny white specks (`specks` 0..1 how many). Fade out by `far`.
     */
    glints: { dark: number; scale: number; length: number; lane: number; strength: number; specks: number; speed: number; far: number };
    /**
     * Shore foam: `contact` metres of foam round things in the water (plus 15% of their radius) (`use(..., { contacts })`), a rim `rim` wide, wavy by `wobble` over `wobbleScale` (smooth noise), then `lines` thin lines `width` wide,
     * `spacing` apart running in at `speed` (lines a second), broken into pieces (`pieces` 0 whole .. 1 mostly gone).
     * Thin lines fade as they get smaller than a pixel, and past `far`.
     */
    foam: { color: string; rim: number; contact: number; wobble: number; wobbleScale: number; lines: number; width: number; spacing: number; speed: number; pieces: number; amount: number; far: number };
    /** rivers: white dashes running with the stream, `length` long, `width` wide, `amount` 0..1 (more where it flows faster) */
    streaks: { amount: number; length: number; width: number };
    /**
     * Below the surface: fog from `shallow` (near the top / shore) to `deep` over `clarity` metres of depth, `density` fog per metre
     * (muddy water: high), `sun` how fast sunlight dies with depth.
     */
    under: { shallow: string; deep: string; clarity: number; density: number; sun: number };
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
