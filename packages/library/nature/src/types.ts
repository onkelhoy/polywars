/** What a family is, for placement rules. */
export type Kind = "tree" | "bush" | "rock" | "cactus" | "plant" | "flower" | "grass" | "deadwood" | "water" | "crop" | (string & {});

/** What grass does at the prop: `none` no grass under it, `ring` taller grass around (sometimes a bare spot), `keep` as is. */
export type GrassAround = "none" | "ring" | "keep";

/** One family: numbered models of one kind. `variants` (snow, autumn, moss, ...) line up by index with `models`. */
export type Family = {
    name: string;
    kind: Kind;
    tags: string[];
    /** terrain biome names it fits (empty: never placed by biome, e.g. crops) */
    biomes: string[];
    /** file names without `.glb` */
    models: string[];
    variants?: Record<string, string[]>;
    /** model height, metres at scale 1 (average) */
    height: number;
    /** half the model's width, metres at scale 1 (average) */
    radius: number;
    /** world scale range */
    scale: [number, number];
    /** steepest ground 0 flat .. 1 vertical */
    slope: number;
    /** wind sway 0..1 */
    sway: number;
    grass: GrassAround;
    /** `near`: likes water close by, `on`: floats on it */
    water?: "near" | "on";
};

/** `assets/models/nature/nature.json`: kept by hand. */
export type NatureList = {
    about?: string;
    /** url folder of the models */
    base: string;
    /** kinds not in the pack yet (notes) */
    missing?: string[];
    families: Family[];
};
