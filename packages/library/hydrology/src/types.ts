/** a height grid in metres, `n` × `n` nodes over `size` metres, centred on the origin */
export type Ground = { n: number; size: number; height: Float32Array; seaLevel: number; top: number; water?: Uint8Array };
/** after lakes: water 0 land, 1 ocean, 2 lake, 3 river; surface metres */
export type Wet = { n: number; size: number; height: Float32Array; water: Uint8Array; surface: Float32Array; seaLevel: number };

export type HydrologyOptions = {
    seed: number;
    /** m² of catchment where a stream starts */
    catchment: number;
    /** streams shorter than this (metres) are dropped */
    length: number;
    /** metres wide / deep at the source; width grows with the catchment up to `maxWidth` */
    width: number;
    maxWidth: number;
    depth: number;
    /** S curves 0..1 (only on flat ground) */
    meander: number;
    /** bank slope of the valley (rise / run) on shallow cuts; deep cuts get `canyon` walls */
    valley: number;
    canyon: number;
    /** metres a river may cut through a rim; more ends it */
    cut: number;
    /** a drop of at least this many metres (bed, one step) is a waterfall */
    fall: number;
    /** highland lakes: count, radius range metres, basin depth metres, lowest spot as share of `top` */
    lakes: { count: number; radius: [number, number]; depth: number; height: number };
    /** rivers at least `width` metres wide split into `branches` (max) over the last `length` metres before the sea */
    delta: { width: number; branches: number; length: number };
};

/** a stream or river: x, y (water surface), z, width per point, metres; `order` 1 small stream .. ; `falls` point indices */
export type Stream = { points: [number, number, number, number][]; order: number; falls: number[] };
export type Lake = { x: number; z: number; radius: number; level: number };
export type Network = { streams: Stream[]; lakes: Lake[] };
