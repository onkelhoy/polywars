/** what the farm reads from the world: heights in metres, optional water */
export type FarmGround = {
    height(x: number, z: number): number;
    /** true on water (river, lake, sea) */
    water?(x: number, z: number): boolean;
    /** true where the farm must not build (roads, other sites) */
    blocked?(x: number, z: number): boolean;
};

/** the area the world hands over, metres */
export type FarmArea = {
    x: number; z: number; radius: number;
    /** where the road touches the area (lane starts here) */
    entry?: { x: number; z: number };
};

/** a piece the farm can place: footprint in metres (x width, z depth) */
export type FarmPiece = {
    asset: string; w: number; d: number;
    /** turn so the door faces the court: the model's door side, radians from local +x (pi: door on -x) */
    front?: number;
    /** fenced run around the piece (chicken coop): footprint w x d metres incl. the run */
    run?: { w: number; d: number; animal: Animal };
};

export type FarmOptions = {
    seed: number | string;
    /** buildings for the yard, placed in order (biggest first works best) */
    yard: { pieces: FarmPiece[]; cells: number; maxSlope: number; gap: number };
    /** on a high spot outside the yard */
    landmark: FarmPiece[];
    field: { size: [number, number]; maxSlope: number; crops: string[] };
    /** `per`: one pasture per this many cells of the area */
    pasture: { size: [number, number]; maxSlope: number; animals: Animal[]; per: number };
    /** tree lines between fields (chance per field pair), trees every `spacing` m */
    hedge: { chance: number; spacing: number };
    /** trees / brush along water: chance a bank cell turns to wood */
    bank: { chance: number; spacing: number };
    wood: { slope: number; chance: number };
    /** fence segment length (fence asset) */
    fence: { asset: string; length: number; gate: number };
    /** `fields`: how many fields get their own trail */
    path: { lane: number; trail: number; fields: number };
    /** small things (asset names as the world knows them, e.g. "props/village/bale") */
    props: FarmProps;
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
    blocked: boolean;
    /** inside the area */
    inside: boolean;
    zone: Zone;
};

/** prop lists the farm picks from */
export type FarmProps = {
    /** by barn doors */
    door: string[];
    /** stacked against barn sides */
    stack: string[];
    /** court edges: carts, washing line */
    court: string[];
    well: string[];
    /** road entry */
    sign: string;
    /** lamp at the court */
    lamp: string;
    /** the farmer's spot with a view: seat, side, light, fire */
    view: { seat: string; side: string; light: string; fire: string };
    /** wheat field sheaves, pasture feed */
    sheaf: string; feed: string;
    /** a wood pile at the wood edge */
    wood: string[];
};
export type Prop = { asset: string; x: number; z: number; yaw: number; scale: number; /** metres over the ground (on top of another prop) */ lift?: number };

export type Building = { asset: string; x: number; z: number; y: number; yaw: number; w: number; d: number };
export type Field = { cells: number[]; crop: string };
export type Pasture = { cells: number[]; animal: Animal; /** a fenced run (no cells) */ run?: Line };
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
    /** tree lines between fields */
    hedges: Line[];
    /** tree spots: hedge rows and river banks (the world picks the models) */
    trees: { x: number; z: number; kind: "hedge" | "bank" }[];
    props: Prop[];
    /** the farmer's view spot */
    view?: { x: number; z: number; yaw: number };
    /** the open yard middle */
    court?: { x: number; z: number; yaw: number };
    /** fence openings, xz */
    gates: [number, number][];
};
