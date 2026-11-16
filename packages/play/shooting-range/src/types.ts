export type Vec3 = [number, number, number];

/** a solid box: walls, steps, stands, target boards (mover collider + bullet target) */
export type Solid = { kind: "box"; name: string; min: Vec3; max: Vec3; surface: string };

/** a scored target: its name in the .blend and how far down the range it stands */
export type Target = { name: string; distance: number; min: Vec3; max: Vec3 };

/** a gun case: a gun floats over `at` (its top middle) */
export type Stand = { name: string; at: Vec3; yaw: number };

/** `asset/range.json`, written by `tools/blender/packs/shooting-range.py`. Game space: y up, the range runs down -z. */
export type RangeData = {
    ground: [Vec3, Vec3, Vec3][];
    solids: Omit<Solid, "kind">[];
    stands: Stand[];
    targets: Target[];
    spawn: Vec3;
};
