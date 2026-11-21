import type { Colour } from "../types";
export type { Colour };

export type CloudKind = "cumulus" | "fair" | "bank" | "overcast";
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
};
export type SkyOptions = { count?: number; near?: number; far?: number; height?: number; cover?: number };

/** what clouds draw into: `@polywar/smoke`'s `Smoke` fits */
export type PuffSink = {
    place(at: ArrayLike<number>, radius: number, options?: { colour?: Colour; bright?: number; flat?: number; top?: number; detail?: number; centre?: ArrayLike<number> }): number;
};
