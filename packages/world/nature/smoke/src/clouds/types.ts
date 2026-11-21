import type { Colour } from "../types";
export type { Colour };

export type CloudKind = "cumulus" | "fair" | "bank" | "overcast" | "storm";
export type CloudOptions = {
    /** layout (default cumulus) */
    kind?: CloudKind;
    /** 0..1 greyer (and flatter for overcast) */
    density?: number;
    /** tower height multiplier (cumulus, default 1) */
    height?: number;
    /** head off to the side, fraction of size */
    lean?: number;
    colour?: Colour;
    /** 0..1 random source (seed it for the same shape every build), default Math.random */
    random?: () => number;
};
export type SkyOptions = { count?: number; near?: number; far?: number; height?: number; cover?: number };

/** what clouds draw into: `@polywar/smoke`'s `Smoke` fits */
export type PuffSink = {
    place(at: ArrayLike<number>, radius: number, options?: { colour?: Colour; bright?: number; flat?: number; top?: number; detail?: number; centre?: ArrayLike<number> }): number;
};

/** the weather a `CloudField` reads at a spot (`@polywar/weather`'s `at` fits) */
export type CloudWeather = (x: number, z: number) => { cover: number; grey: number; kind: string; base: number };
export type CloudFieldOptions = {
    /** m per cell, one cloud chance each (default 2500) */
    cell?: number;
    /** cells out from the camera (default 5) */
    reach?: number;
    seed?: number;
    /** rebuilds per second (default 8) */
    rate?: number;
    /** size multiplier (default 1) */
    size?: number;
};
