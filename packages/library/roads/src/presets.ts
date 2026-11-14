import type { ClassOptions, RoadClass, RoadsOptions } from "./types";

const c = (o: ClassOptions) => o;

/** road classes per era: widths, grades, curves, how happily they bridge / tunnel */
export const ERAS: Record<string, Record<RoadClass, ClassOptions>> = {
    /** 1940s: few wide paved highways, many gravel roads, dirt lanes, rail between big towns */
    ww2: {
        highway: c({ width: 16, shoulder: 3, maxGrade: .06, turn: 40, minRadius: 150, bridge: { cost: 100, max: 250, valley: 15, fill: 18 }, tunnel: { cost: 60, max: 400, cover: 15 }, reuse: .35, climb: 4, surface: "asphalt" }),
        road: c({ width: 5.5, shoulder: 2, maxGrade: .1, turn: 12, minRadius: 60, bridge: { cost: 120, max: 120, valley: 20, fill: 22 }, tunnel: { cost: 80, max: 200, cover: 12 }, reuse: .35, climb: 3, surface: "gravel" }),
        lane: c({ width: 3.5, shoulder: 1, maxGrade: .15, turn: 4, minRadius: 25, bridge: { cost: 150, max: 40, valley: 0, fill: 0 }, tunnel: { cost: 0, max: 0, cover: 0 }, reuse: .35, climb: 2, surface: "dirt" }),
        path: c({ width: 1.5, shoulder: .5, maxGrade: .35, turn: 1, minRadius: 8, bridge: { cost: 120, max: 20, valley: 0, fill: 0 }, tunnel: { cost: 0, max: 0, cover: 0 }, reuse: .5, climb: 1, surface: "dirt" }),
        rail: c({ width: 4, shoulder: 2, maxGrade: .025, turn: 120, minRadius: 300, bridge: { cost: 30, max: 300, valley: 12, fill: 14 }, tunnel: { cost: 30, max: 600, cover: 15 }, reuse: .2, climb: 8, surface: "ballast" }),
    },
};

export const CLASSES: RoadClass[] = ["highway", "rail", "road", "lane", "path"];
/** bigger rank = bigger road; a road reuses ones of its rank or more */
export const RANK: Record<RoadClass, number> = { path: 1, lane: 2, road: 3, highway: 4, rail: 1 };

export const DEFAULTS: RoadsOptions = {
    seed: 1, era: "ww2", cell: 8, step: 4, greed: 1.3,
    classes: ERAS.ww2,
    build: { highway: true, road: true, lane: true, path: true, rail: true },
    extra: .3, rail: { count: 4 }, penalty: 2, overlap: .7,
};

/** merge options over the defaults (and the era's classes) */
export function resolve(o: Partial<RoadsOptions> = {}): RoadsOptions {
    const era = ERAS[o.era ?? DEFAULTS.era] ?? ERAS.ww2;
    const classes = structuredClone(era) as Record<RoadClass, ClassOptions>;
    for (const [k, v] of Object.entries(o.classes ?? {})) classes[k as RoadClass] = { ...classes[k as RoadClass], ...v };
    return { ...DEFAULTS, ...o, classes, build: { ...DEFAULTS.build, ...o.build }, rail: { ...DEFAULTS.rail, ...o.rail } };
}
