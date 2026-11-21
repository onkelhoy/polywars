export type Vec3 = [number, number, number];
/** sRGB 0..1 (as picked, drawn as is) */
export type Colour = [number, number, number];
export type Range = [number, number];

/**
 * One kind of puff in a preset: where puffs start, how they move, grow and die.
 * A burst spawns `count` of them; an emitter spawns `count` per second.
 */
export type Layer = {
    count: number;
    /** where they start: `point` at the spot, `sphere` inside `radius`, `ring` on a flat ring of `radius` (default point) */
    shape?: "point" | "sphere" | "ring";
    /** start spread m (default 0) */
    radius?: number;
    /** main way out (default up) */
    direction?: Vec3;
    /** 0 = straight along `direction`, 1 = half sphere (default .3) */
    spread?: number;
    /** m/s straight out from the centre, flat (ring / ground blasts) */
    outward?: Range;
    /** m/s round the centre, flat (counter clockwise from above; a swirling ground surge) */
    tangent?: Range;
    /** m/s along the cone */
    speed: Range;
    /** s */
    life: Range;
    /** s before it shows (staggers a burst) */
    delay?: Range;
    /** radius m at birth, then grown to `size[1]` */
    size: Range;
    /** how fast it reaches full size, 1/s (high = a pop) (default 3) */
    grow?: number;
    /** 1/s, speed lost (high = burst then hang) (default 1) */
    drag?: number;
    /** m/s² up (buoyancy); negative sinks (default 0) */
    lift?: number;
    /** m/s of curl noise swirl, grows with age (default .5) */
    swirl?: number;
    /** puff stretch along its speed: extra length per m/s (default .05) */
    stretch?: number;
    /** base tone */
    colour: Colour;
    /** 0..1 lit top / highlight at birth (default 1) */
    bright?: number;
    /** life fraction by which the bright top is gone (default .5) */
    dim?: number;
    /** life fraction it starts shrinking (default .6) */
    shrink?: number;
    /** m/s roll round the burst's ring (vortex ring: up the middle, out over the top, down the outside); for explosion caps */
    roll?: number;
    /** rad/s tumble about the horizontal axis across its way out; + rolls its top in toward the source (ground surges), - out (caps) */
    tumble?: number;
    /** spin speed multiplier (default 1) */
    spin?: number;
    /** joined to a parent puff by a low poly tube (default true) */
    link?: boolean;
    /** kept on / slid along the ground (default true) */
    ground?: boolean;
    /** random size / speed jitter 0..1 (default .3) */
    jitter?: number;
};

export type Preset = { layers: Layer[] };

export type SmokeSetting = {
    /** puffs alive at most, oldest go first (default 4000) */
    puffs?: number;
    /** ground height under x z (default flat 0) */
    ground?: (x: number, z: number) => number;
    /** named presets added to / over the defaults */
    presets?: Record<string, Preset>;
};

/** where the look is set; all live */
export type SmokeLook = {
    /** direction to the sun (world, unit) */
    sun: Vec3;
    /** wind m/s */
    wind: Vec3;
    /** shadow side colour multiplier (cool shadows) */
    shade: Colour;
    /** the same for clouds: tinted by the sky */
    skyShade: Colour;
    /** how white the lit faces go, 0..1 */
    highlight: number;
    /** puff faces: 0 = 20 (icosahedron), 1 = 80 */
    detail: number;
    /** filler tube radius vs the puffs it joins */
    thickness: number;
    /** a tube shows while its puffs are closer than this times their radii summed */
    reach: number;
    /** swirl multiplier */
    swirl: number;
    /** life fraction a puff starts being eaten away by noise (holes grow till it is gone) */
    eat: number;
    /** noise size: higher = smaller holes */
    grain: number;
    /** life fraction it starts fading out (dithered) */
    fade: number;
};

export type BurstOptions = {
    /** scales sizes, speeds and spread (default 1) */
    scale?: number;
    /** added to every puff, m/s (a moving source) */
    velocity?: Vec3;
    /** colour over the preset's */
    colour?: Colour;
};

/** a running source: move it, change its rate, stop it */
export type Emitter = {
    position: Vec3;
    /** puffs per second multiplier (default 1) */
    rate: number;
    scale: number;
    velocity: Vec3;
    colour?: Colour;
    stop(): void;
};

/** what the renderer needs from a camera; `@papit/game-engine`'s `Camera` fits */
export type View = {
    viewMatrix: ArrayLike<number>;
    projectionMatrix: ArrayLike<number>;
};

/** a still puff (`place`) */
export type PlaceOptions = {
    colour?: Colour;
    /** 0..1 lit top (default 1) */
    bright?: number;
    /** squash under its centre, 1 = round (default 1) */
    flat?: number;
    /** squash over its centre (default 1) */
    top?: number;
    /** faces: 0 = 20, 1 = 80 (default 0) */
    detail?: number;
    /** lit as part of the mass round this point (clouds) */
    centre?: ArrayLike<number>;
};

export type FieldOptions = {
    /** m, reach round the axis */
    radius: number;
    /** m above `at` it fades out by (default no top) */
    height?: number;
    /** m/s² toward the axis */
    inward?: number;
    /** m/s² up */
    up?: number;
    /** m/s² round the axis (counter clockwise from above) */
    spin?: number;
    /** s (default forever) */
    life?: number;
};
/** a live flow; change any field */
export type Field = Required<Omit<FieldOptions, "life">> & { position: Vec3; strength: number; life: number; stop(): void };
