import type { AudioMixer } from "@papit/audio";

export type Vec3 = [number, number, number];
type Point = { x: number; y: number; z: number };
export type Colour = [number, number, number];

/** what draws the smoke: `@polywar/smoke`'s `Smoke` fits */
export type SmokeLike = {
    burst(preset: { layers: any[] }, at: ArrayLike<number>, options?: { scale?: number; colour?: Colour }): void;
    emitter(preset: { layers: any[] }, at: ArrayLike<number>, options?: { scale?: number }): { position: Vec3; rate: number; stop(): void };
    field(at: ArrayLike<number>, options: { radius: number; height?: number; inward?: number; up?: number; spin?: number; life?: number }): { strength: number; stop(): void };
};

export type ExplosionSetting = {
    smoke: SmokeLike;
    /** ground height under x z (default flat 0) */
    ground?: (x: number, z: number) => number;
    /** chunks in the air at most (default 200) */
    chunks?: number;
};

export type ExplodeOptions = {
    /** kg of TNT: .2 a grenade, 5 a shell, 250 a bomb, 5000+ a mushroom, 50000+ throws rock like a volcano (default 5) */
    power?: number;
    /** ground dust colour */
    dust?: Colour;
};

/** one explosion going on */
export type Blast = {
    position: Vec3;
    power: number;
    /** cube root of power: lengths scale with it */
    scale: number;
    /** time scale: durations scale with it */
    slow: number;
    /** s since it went off */
    age: number;
    /** m, the shock front now */
    front: number;
    /** 0..1 how much of a mushroom it grows, 0..1 how much rock it throws */
    mushroom: number;
    volcano: number;
};

/** a live light for the host's renderer */
export type FlashLight = { position: Vec3; colour: Colour; intensity: number; range: number };

/** all live */
export type ExplosionLook = {
    /** direction to the sun */
    sun: Vec3;
    /** shock bubble + ring opacity (0 hides them) */
    shock: number;
    /** how much the shell bends what is behind it (screen fraction, 0 off: no screen copy) */
    bend: number;
    /** the white edge line at the ground, 0..1 */
    lineLow: number;
    /** and at the top */
    lineTop: number;
    /** smoke tones */
    dust: Colour;
    smoke: Colour;
    char: Colour;
    rock: Colour;
};

export type View = { viewMatrix: ArrayLike<number>; projectionMatrix: ArrayLike<number> };

// force

/** a shock front: `@polywar/explosion`'s `ShockFront` fits */
export type Front = { radius: number; step(dt: number): number; pressure(radius?: number): number };

/** something the blast can push */
export type Target = {
    position: Point;
    /** kg */
    mass: number;
    /** m, rough radius: how much of it faces the blast */
    size: number;
    /** 0..1 how much the push lifts it (default 1); people ~.25: knocked over, not thrown up */
    lift?: number;
    /** m/s most the push gives it (default none); more than this goes into `hit.over` */
    cap?: number;
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
    /** m/s past the target's `cap` (0 = none): what knocks a person down instead of throwing them */
    over: number;
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

// audio
/** the host's ray: what's hit between `from` and `to`, nothing if clear */
export type Cast = (from: Vec3, to: Vec3) => { point: Vec3 } | null | undefined;

export type ExplosionAudioOptions = {
    mixer: AudioMixer;
    /** the set's folder (`sounds.json`, `@polywar/sfx-gen`). Default `/assets/audio/effects/explosions/` */
    base?: string;
    /** rays for near blasts: open, walls or indoor (default open) */
    cast?: Cast;
    /** bus. Default `"sfx"` */
    bus?: string;
    /** metres per second: far blasts are heard late. Default 343 */
    sound?: number;
    /** 0..1 the ear is ringing (a player's `deaf`): muffles everything */
    deaf?: () => number;
};
