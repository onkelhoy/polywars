export type Quality = "low" | "medium" | "high";
export type Vec2 = [number, number];

/** Props of one model: `data` is 8 floats each (x y z scale yaw tint sway, one free; `@polywar/ecosystem` `Batch` fits). */
export type ScatterBatch = { model: string; kind: string; data: Float32Array; count: number };

export type ScatterOptions = {
    quality: Quality;
    /** draw distance in metres per prop kind (at medium), `default` for the rest */
    distance: Record<string, number>;
    /** last part of the distance where props shrink away, 0..1 */
    fade: number;
    /** where lod 1, 2, ... start, as parts of the kind's draw distance (chunk centre); `[]` = full detail only */
    lods: number[];
    /** wind: x z direction and strength (top sway in metres per metre of height) */
    wind: { direction: Vec2; strength: number };
    /** prop surface (see `@polywar/renderer` `Surface`): toon bands, soft edges, world space grit */
    surface: { bands: number; soft: number; grit: number };
    /** sun highlight 0..1 per prop kind (missing = matte) */
    gloss: Record<string, number>;
};

/** What the scatter needs from a camera; `@papit/game-engine`'s `Camera` fits. */
export type View = { viewMatrix: ArrayLike<number>; projectionMatrix: ArrayLike<number>; worldPosition?: { x: number; y: number; z: number } };
