/**
 * One placed thing. `kind` is an asset path under `assets/models/` (e.g. `props/village/bench`) or a generator id
 * (e.g. `bridge:arch-stone`, rebuilt from `params`). `source` groups who placed it (roads, trails, player, ...).
 */
export type Placement = {
    id: number;
    source: string;
    kind: string;
    x: number; y: number; z: number;
    yaw: number;
    scale: number;
    /** generator input (spans, sizes, seeds): plain JSON */
    params?: Record<string, unknown>;
};

/** a change after generation: seeded things (trees, generated placements) aren't stored, only what changed */
export type Change =
    | { op: "remove"; id: number; source: string }
    | { op: "move"; id: number; source: string; x: number; y: number; z: number; yaw: number };

export type PlacementsJSON = { version: 1; items: Placement[]; changes: Change[] };

/** `@polywar/scatter` `ScatterBatch` shape: 8 floats each (x y z scale yaw tint sway solid) */
export type Batch = { model: string; kind: string; data: Float32Array; count: number };
