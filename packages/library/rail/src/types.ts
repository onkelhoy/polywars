import type { Mesh } from "@papit/game-mesh";
export type Vec3 = [number, number, number];

export type RailOptions = {
    /** track scale: the asset's sleepers are ~1.26 m long, real ones ~2.6 m */
    scale: number;
    /** sleeper every `spacing` m (asset spacing 1.176 × scale) */
    spacing: number;
    /** rail centre lines at ± gauge / 2, m (after scale) */
    gauge: number;
    /** rail head size, m */
    rail: { width: number; height: number };
    /** sleeper top over the bed, m */
    sleeperTop: number;
    /** ballast bed: top width, height, side slope width, m */
    ballast: { width: number; height: number; slope: number };
    /** path resample step for the swept parts, m */
    step: number;
};

/** sleepers as scatter instances: x y z scale yaw tint sway solid (8 floats each, `@polywar/scatter` `ScatterBatch`) */
export type Sleepers = { data: Float32Array; count: number };

/** one track: lod 0 = rails + ballast (+ sleepers as instances), lod 1 = rails + striped ballast, lod 2 = ballast strip */
export type Track = { sleepers: Sleepers; lods: Mesh[] };
export type { Mesh };
