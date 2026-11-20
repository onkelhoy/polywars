export type Vec3 = [number, number, number];
type Point = { x: number; y: number; z: number };

/** a shock front: `@polywar/explosion`'s `ShockFront` fits */
export type Front = { radius: number; step(dt: number): number; pressure(radius?: number): number };

/** something the blast can push */
export type Target = {
    position: Point;
    /** kg */
    mass: number;
    /** m, rough radius: how much of it faces the blast */
    size: number;
    /** hit: Δv m/s and spin rad/s to add, kPa it took */
    push(velocity: Vec3, spin: Vec3, hit: Hit): void;
};

export type Hit = {
    /** kPa over the air at it */
    pressure: number;
    /** N·s it took (after cover) */
    impulse: number;
    /** m from the blast */
    distance: number;
    /** 0..1 how much got through (1 = in the open) */
    cover: number;
    /** unit, from the blast */
    direction: Vec3;
};

export type BlastForceSetting = {
    /** the things that can move, looked at once per blast */
    targets: () => Iterable<Target>;
    /** a front for `power` kg TNT (default: sound speed, Sadovsky pressure) */
    front?: (power: number) => Front;
    /** 0..1 how much of the blast reaches `to` from `from` past walls (default 1) */
    cover?: (from: Vec3, to: Vec3, target: Target) => number;
    /** every push, after it is applied (damage is the game's) */
    onhit?: (target: Target, hit: Hit) => void;
    /** impulse multiplier (default 2) */
    strength?: number;
};
