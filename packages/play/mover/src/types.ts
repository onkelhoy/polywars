/** Something solid the capsule can't walk through (props, walls, targets). World units. */
export type Collider =
    | { kind: "box"; min: [number, number, number]; max: [number, number, number] }
    /** upright cylinder: tree trunk, post, a standing body */
    | { kind: "cylinder"; x: number; z: number; radius: number; bottom: number; top: number };

export type MoverSetting = {
    /** ground height at x / z: terrain, roads, floors (the host puts them together, highest wins) */
    ground: (x: number, z: number) => number;
    /** solid things near x / z (default none); called every step, keep it cheap (a grid lookup) */
    colliders?: (x: number, z: number) => Iterable<Collider>;
    /** capsule radius, m (default .3) */
    radius?: number;
    /** capsule height, m (default 1.8) */
    height?: number;
    /** m/s² (default 18) */
    gravity?: number;
    /** take off speed, m/s (default 5) */
    jump?: number;
    /** steepest walkable ground, degrees (default 40); steeper: slides down */
    slope?: number;
    /** highest ledge stepped up without a jump, m (default .45) */
    step?: number;
    /** how fast the feet follow the wanted speed on the ground / in the air, per s (default 14 / 3) */
    grip?: number;
    air?: number;
    /** friction while sliding on too steep ground, 0..1 (default .15) */
    friction?: number;
};

export type MoveInput = {
    /** wanted horizontal velocity, m/s (world x / z) */
    x: number;
    z: number;
    /** jump this step (only from walkable ground) */
    jump?: boolean;
};
