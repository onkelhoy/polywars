export type Vec3 = [number, number, number];

/** Where a segment met something. `t` 0..1 along the segment. */
export type Hit = {
    t: number;
    point: Vec3;
    normal: Vec3;
    /** what it is made of, for the host's particles / decals / sounds ("ground", "wood", "metal", "flesh", ...) */
    surface?: string;
    /** whatever the host hangs on it (a target, a player id) */
    target?: unknown;
};

/** finds the first hit on the segment from -> to, or null */
export type Cast = (from: Vec3, to: Vec3) => Hit | null;

export type Shot = {
    from: Vec3;
    /** unit direction */
    direction: Vec3;
    /** m/s */
    speed: number;
    /** quadratic drag per metre */
    drag?: number;
    /** seconds before it's gone */
    life?: number;
    /** show a tracer for this one */
    tracer?: boolean;
    /** anything (shooter, gun, damage) the host reads back on a hit */
    data?: unknown;
};

export type Bullet = Shot & {
    position: Vec3;
    velocity: Vec3;
    /** where it was a step ago (a tracer's tail) */
    previous: Vec3;
    /** metres flown */
    travelled: number;
    age: number;
    gone: boolean;
};
