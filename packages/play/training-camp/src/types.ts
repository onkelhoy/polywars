export type Vec3 = [number, number, number];

/** a solid box: walls, steps, stands, target boards (mover collider + bullet target) */
export type Solid = { kind: "box"; name: string; min: Vec3; max: Vec3; surface: string };

/** a scored target: its name in the .blend and how far down the range it stands */
export type Target = { name: string; distance: number; min: Vec3; max: Vec3 };

/** a gun case: a gun floats over `at` (its top middle) */
export type Stand = { name: string; at: Vec3; yaw: number };

/** `asset/range.json`, written by `tools/blender/packs/training-camp.py`. Game space: y up, the range runs down -z. */
export type RangeData = {
    ground: [Vec3, Vec3, Vec3][];
    solids: Omit<Solid, "kind">[];
    stands: Stand[];
    targets: Target[];
    /** desk buttons: move lane `lane`'s carrier nearer (-1) / further (+1) */
    buttons?: { name: string; lane: number; dir: -1 | 1; min: Vec3; max: Vec3 }[];
    /** where the lane carriers stop, m from the firing line (default 10 / 25 / 50 / 75 / 100) */
    stops?: number[];
    /** where the grass grows what: rectangles (x / z), `none` wins over `short` over `tall` */
    grass?: { kind: "tall" | "short" | "none"; min: [number, number]; max: [number, number] }[];
    /** lane carriers (a paper target rides on each) */
    carriers?: { name: string; min: Vec3; max: Vec3 }[];
    /** spotting scopes (fixed, steady) and binoculars (picked up, shaky) */
    optics?: { name: string; kind: "fixed" | "binoculars"; zoom: number; at: Vec3; eye: Vec3 | null }[];
    /** parked vehicles: `kind` is the asset folder (assets/models/vehicles/<kind>), yaw 0 = nose -z, + turns left */
    vehicles?: { name: string; kind: string; at: Vec3; yaw: number }[];
    spawn: Vec3;
};
