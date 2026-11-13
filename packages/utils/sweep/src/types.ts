import type { Mesh } from "@papit/game-mesh";

export type Vec3 = [number, number, number];
export type RGB = [number, number, number];

/**
 * Cross section, left to right. `x` is in half widths (-1 = left edge, 1 = right edge), `y` in metres (up).
 * Point `i` to `i + 1` is one face strip with `colors[i]` (or `color`).
 */
export type Profile = { points: [number, number][]; colors?: RGB[]; color?: RGB };

/** `"flat"`: always level across (water). `{ max, gain }`: tilt into curves, `gain` rad per (rad/m) of curvature, clamped to `max` rad. */
export type Bank = "flat" | { max: number; gain: number };

export type SweepOptions = {
    /** width (m) for the whole path or per point */
    width: number | number[];
    profile: Profile;
    bank: Bank;
    /** resample the path every `step` m first (0 = keep the points) */
    step: number;
    /** colour bands along the length (slabs, sleepers): every `every` m, darken by `shade` (0..1) every other band */
    bands?: { every: number; shade: number };
    /** profile point x scaled by width / 2, but then clamped so the inner side never folds on tight curves */
    noFold: boolean;
    /** faces get their own normals (low poly look); false = smooth normals across the profile */
    flat: boolean;
};

/** one level: the options a LOD level overrides (e.g. bigger step, simpler profile) */
export type SweepLod = Partial<Pick<SweepOptions, "step" | "profile" | "bands">>;

export type { Mesh };
