import type { Random } from "@papit/random";
import type { PieceName } from "./catalog";
import type { Placement, Settings } from "./types";

export type V = [number, number];

/** storey height in cells */
export const STOREY = 2;
/** height of the roof pieces' foot, below the tiles */
export const FOOT = .2;
/** metres a roof row rises per cell */
export const RISE = { Straight: 1, Convex: .5, Concave: .5 };

/** column-major matrix: deg 0 faces +X, 90 -> -Z, 180 -> -X, 270 -> +Z; mirror flips local Z */
export function matrix(x: number, y: number, z: number, deg = 0, mirror = false): number[] {
    const r = deg * Math.PI / 180, c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r)), m = mirror ? -1 : 1;
    return [c, 0, -s, 0, 0, 1, 0, 0, s * m, 0, c * m, 0, x, y, z, 1];
}

/** a box of the house: cells x..x+w-1, z..z+d-1, ridge along x or z */
export type Box = { x: number; z: number; w: number; d: number; floors: number; ridge: "x" | "z"; /** cells the roof runs on past the end that joins another box */ join?: "start" | "end"; extend?: number };

/** the four sides of a box, going round: outward normal, rotation (local +X faces outward), run (local +Z) */
export const SIDES: { n: V; deg: number; run: V }[] = [
    { n: [1, 0], deg: 0, run: [0, 1] }, { n: [0, 1], deg: 270, run: [-1, 0] },
    { n: [-1, 0], deg: 180, run: [0, -1] }, { n: [0, -1], deg: 90, run: [1, 0] },
];

export type Face = {
    box: Box; side: number; n: V; deg: number; run: V; length: number; gable: boolean;
    /** window bays: 1 narrow, 2 wide (two cells), 0 blank; the same on every storey */
    bays: number[];
    /** metres the upper storeys stand out (jetty) */
    shift: number;
    at(i: number): V;
    out(i: number): V;
};

export type Ctx = {
    settings: Settings;
    rng: Random;
    on(name: keyof Settings): boolean;
    put(piece: PieceName, x: number, y: number, z: number, deg?: number, mirror?: boolean): Placement;
    pieces: Placement[];
    boxes: Box[];
    faces: Face[];
    profile: "Straight" | "Convex" | "Concave";
    family: "Single" | "Double" | "Rounded";
    timber: boolean;
    stone: boolean;
    /** wall cells already taken `x,y,z`: walls skip them */
    filled: Set<string>;
    /** wall cells `x,y,z` without cladding or timber */
    bare: Set<string>;
    /** roof pieces `x,z` to leave out (dormers) */
    noRoof: Set<string>;
    /** front door: face + first cell (wide door, two cells) */
    door: { face: Face; i: number };
    features: Record<string, string | number | boolean>;
};

export const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const top = (box: Box) => box.floors * STOREY;
export const inside = (b: Box, x: number, z: number) => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d;

export function faceOf(box: Box, side: number): Face {
    const s = SIDES[side];
    const start: V[] = [[box.x + box.w - 1, box.z], [box.x + box.w - 1, box.z + box.d - 1], [box.x, box.z + box.d - 1], [box.x, box.z]];
    const at = (i: number): V => [start[side][0] + s.run[0] * i, start[side][1] + s.run[1] * i];
    return {
        box, side, ...s, bays: [], shift: 0, length: side % 2 ? box.w : box.d, gable: (box.ridge === "x") === (side % 2 === 0),
        at, out: i => { const [x, z] = at(i); return [x + s.n[0], z + s.n[1]]; },
    };
}

/** storeys of a face cell that are hidden by another box */
export function hidden(ctx: Ctx, face: Face, i: number) {
    const [x, z] = face.out(i);
    let floors = 0;
    for (const b of ctx.boxes) if (b !== face.box && inside(b, x, z)) floors = Math.max(floors, b.floors);
    return floors;
}

/** box-local frame for roofs: u along the ridge (0..L-1), v across (0..D-1) */
export function frame(box: Box) {
    const L = box.ridge === "x" ? box.w : box.d, D = box.ridge === "x" ? box.d : box.w;
    const world = (u: number, v: number): V => box.ridge === "x" ? [box.x + u, box.z + v] : [box.x + v, box.z + L - 1 - u];
    const off = box.ridge === "x" ? 0 : 90;
    return { L, D, world, off, matrix: (u: number, y: number, v: number, deg = 0, mirror = false) => { const [x, z] = world(u, v); return matrix(x, y, z, deg + off, mirror); } };
}
