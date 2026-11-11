import type { PieceName } from "./catalog";

/** off, on, or decided by the seed */
export type Tri = "off" | "on" | "random";
export type Range = [min: number, max: number];
export type Shape = "rect" | "L" | "T" | "random";
export type RoofProfile = "Straight" | "Convex" | "Concave" | "random";

export type Settings = {
    /** footprint in metres (rounded to even) */
    width: Range;
    depth: Range;
    floors: Range;
    shape: Shape;
    roof: RoofProfile;
    tunnel: Tri;
    windmill: Tri;
    waterwheel: Tri;
    balcony: Tri;
    chimney: Tri;
    bay: Tri;
    timber: Tri;
    awning: Tri;
    props: Tri;
    ground: Tri;
};

/** one kit piece: column-major 4x4 matrix */
export type Placement = { piece: PieceName; matrix: number[] };

export type Building = {
    seed: number;
    pieces: Placement[];
    /** what the seed decided, for labels */
    features: Record<string, string | number | boolean>;
};
