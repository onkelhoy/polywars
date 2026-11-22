export type Vec3 = [number, number, number];
export type BoltKind = "ground" | "spider";

export type LightningOptions = {
    /** ground height, default 0 */
    ground?: (x: number, z: number) => number;
    /** most segments drawn at once (default 6000) */
    segments?: number;
};

export type StrikeOptions = {
    kind?: BoltKind;
    /** cloud base height m (default 1500) */
    base?: number;
    /** spider: heading radians (default random) */
    heading?: number;
    /** spider: length m (default 6-18 km) */
    length?: number;
};

/** one bolt alive: what the host needs for sound / light */
export type Strike = {
    kind: BoltKind;
    /** where it touches down (ground) or its middle (spider) */
    position: Vec3;
    /** seconds since it started */
    age: number;
    /** seconds it lives */
    life: number;
    /** seconds after the start the main stroke lands (ground: it touches down) */
    hit: number;
};

export type LightningLook = {
    core: Vec3;
    glow: Vec3;
    /** main channel width m */
    width: number;
    /** smallest width on screen, as a fraction of distance (keeps far bolts visible) */
    minWidth: number;
};
