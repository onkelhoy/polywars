export type Vec3 = [number, number, number];
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
    /** white edge lines on the bubble, 0..1 */
    lines: number;
    /** smoke tones */
    dust: Colour;
    smoke: Colour;
    char: Colour;
    rock: Colour;
};

export type View = { viewMatrix: ArrayLike<number>; projectionMatrix: ArrayLike<number> };
