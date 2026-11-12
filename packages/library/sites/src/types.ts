export type SiteKind = "city" | "village" | "farm" | "peak" | "beach" | "lake" | "pass" | "viewpoint";

/** a place on the map, metres; `weight` 0..1 how important (roads connect heavy sites first) */
export type Site = { id: number; kind: SiteKind; x: number; z: number; y: number; radius: number; weight: number };

/** what sites read: `@polywar/terrain` `RawGround` / `TerrainData` fit. Optional grids are used when there. */
export type Ground = {
    n: number; cell: number; size: number;
    /** metres, n² row major (z rows), node 0 at (-size/2, -size/2) */
    height: Float32Array;
    seaLevel: number;
    /** 0 land, 1 sea, 2 lake, 3 river (else: below sea level = sea) */
    water?: Uint8Array;
};

/** a town spot from the terrain */
export type Town = { x: number; z: number; y: number; radius: number; score: number };

export type SitesOptions = {
    seed: number;
    village: { count: number; radius: number; spacing: number; maxSlope: number };
    farm: { perTown: number; perVillage: number; near: [number, number]; radius: number; maxSlope: number };
    peak: { count: number; prominence: number; spacing: number };
    beach: { count: number; spacing: number; width: number };
    lake: { count: number; spacing: number };
    pass: { count: number; spacing: number };
    viewpoint: { count: number; spacing: number; drop: number };
};
