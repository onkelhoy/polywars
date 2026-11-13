/** a place roads connect (`@polywar/sites` `Site` fits) */
export type Site = { id: number; kind: string; x: number; z: number; y: number; radius: number; weight: number };

/** what roads read: `@polywar/terrain` `RawGround` / `TerrainData` fit */
export type Ground = {
    n: number; cell: number; size: number;
    /** metres, n² row major (z rows), node 0 at (-size/2, -size/2) */
    height: Float32Array;
    seaLevel: number;
    /** 0 land, 1 sea, 2 lake, 3 river (else: below sea level = sea) */
    water?: Uint8Array;
};

export type RoadClass = "highway" | "road" | "lane" | "path" | "rail";

/** part of a road: indices into `points` (inclusive) */
export type Span = { kind: "ground" | "bridge" | "tunnel"; from: number; to: number };

export type Road = {
    id: number; class: RoadClass;
    /** junction ids */
    from: number; to: number;
    /** x y z every `step` m, y = graded bed height */
    points: [number, number, number][];
    width: number; spans: Span[]; surface: string;
    /** roads of one chain go on through their junctions as one curve (ids in order, points run along it) */
    chain?: number;
};

/** where roads meet; `angle` (radians, atan2(dz, dx)) the way each road leaves */
export type Junction = { id: number; x: number; z: number; y: number; site?: number; roads: { road: number; angle: number; class: RoadClass }[] };

export type Network = { roads: Road[]; junctions: Junction[] };

export type ClassOptions = {
    /** metres of road surface, `shoulder` metres of verge each side */
    width: number; shoulder: number;
    /** rise / run allowed on the ground */
    maxGrade: number;
    /** cost per 22.5° turn, in metres */
    turn: number;
    /** smallest curve radius, metres */
    minRadius: number;
    /** cost per metre (times plain ground), longest span metres */
    bridge: { cost: number; max: number };
    tunnel: { cost: number; max: number; cover: number };
    /** cost times this on an existing road of this class or bigger */
    reuse: number;
    /** extra cost per metre of grade (grade / maxGrade)², times length */
    climb: number;
    surface: string;
};

export type RoadsOptions = {
    seed: number;
    era: string;
    /** routing grid cell, metres; `step` metres between output points */
    cell: number; step: number;
    /** search greed (weighted A*): > 1 faster, routes a bit worse */
    greed: number;
    classes: Record<RoadClass, ClassOptions>;
    /** which classes to build */
    build: Record<RoadClass, boolean>;
    /** extra loops: share of next shortest pairs added */
    extra: number;
    rail: { count: number };
    /** alternatives: cost times `penalty` on used nodes, keep routes sharing under `overlap` */
    penalty: number; overlap: number;
};
