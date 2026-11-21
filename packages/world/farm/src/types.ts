/** what the farm reads from the world: heights in metres, optional water */
export type FarmGround = {
    height(x: number, z: number): number;
    /** true on water (river, lake, sea) */
    water?(x: number, z: number): boolean;
};

/** the area the world hands over, metres */
export type FarmArea = {
    x: number; z: number; radius: number;
    /** where the road touches the area (lane starts here) */
    entry?: { x: number; z: number };
};

/** a piece the farm can place: footprint in metres (x width, z depth) */
export type FarmPiece = { asset: string; w: number; d: number };

export type FarmOptions = {
    seed: number | string;
    /** buildings for the yard, placed in order (biggest first works best) */
    yard: { pieces: FarmPiece[]; cells: number; maxSlope: number; gap: number };
    /** on a high spot outside the yard */
    landmark: FarmPiece[];
    field: { size: [number, number]; maxSlope: number; crops: string[] };
    pasture: { size: [number, number]; maxSlope: number; animals: Animal[] };
    wood: { slope: number; chance: number };
    /** fence segment length (fence asset) */
    fence: { asset: string; length: number };
    /** `fields`: how many fields get their own trail */
    path: { lane: number; trail: number; fields: number };
    /** grid cell size, metres (about) */
    cell: number;
    /** relax iterations of the irregular grid */
    relax: number;
};

export type Zone = "none" | "yard" | "field" | "pasture" | "wood";
export type Animal = "cow" | "sheep" | "horse" | "chicken" | "pig";

/** one grid cell over the area, xz metres */
export type FarmCell = {
    id: number;
    /** 4 corners, xz, counter clockwise */
    corners: [number, number][];
    x: number; z: number;
    /** height at the centre and max slope (rise / run) over the corners */
    y: number; slope: number;
    water: boolean;
    /** inside the area */
    inside: boolean;
    zone: Zone;
};

export type Building = { asset: string; x: number; z: number; y: number; yaw: number; w: number; d: number };
export type Field = { cells: number[]; crop: string };
export type Pasture = { cells: number[]; animal: Animal };
/** polyline, xz metres */
export type Line = [number, number][];

/** ground edits the farm asks for */
export type Paint = "dirt" | "soil" | "gravel";
/** a shape: polygon, or a polyline with a width */
export type Shape = { poly: Line } | { line: Line; width: number };
export type GroundEdit =
    | { kind: "flatten"; x: number; z: number; w: number; d: number; yaw: number; y: number; blend: number }
    | ({ kind: "noGrass" } & Shape)
    | ({ kind: "paint"; paint: Paint } & Shape);

export type FarmLayout = {
    area: FarmArea;
    cells: FarmCell[];
    neighbours: Int32Array;
    buildings: Building[];
    fields: Field[];
    pastures: Pasture[];
    fences: Line[];
    paths: { line: Line; width: number; kind: "lane" | "trail" }[];
    edits: GroundEdit[];
    /** the open yard middle */
    court?: { x: number; z: number; yaw: number };
    /** fence openings, xz */
    gates: [number, number][];
};
