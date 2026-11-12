import type { EcosystemOptions, GrassCover } from "./types";

const g = (density: number, height: number, dry: number, flowers: number): GrassCover => ({ density, height, dry, flowers });

/** Defaults: per hectare. Biome names are `@polywar/terrain`'s. */
export const DEFAULTS: EcosystemOptions = {
    seed: 1,
    density: 1,
    cover: { resolution: 256, blend: 48 },
    season: { autumn: .12, snow: .2 },
    cities: { clear: 1.15, grass: .45, height: .5 },
    around: { ring: 1.4, taller: .8, bare: .3 },
    groups: {
        conifer: { select: { kind: "tree", tags: ["pine"], not: ["dead"] }, layer: 0, spacing: 1, cluster: { scale: 140, amount: .6 }, temperature: [0, .5], max: 40000 },
        broadleaf: { select: { kind: "tree", tags: ["broadleaf"], not: ["dead", "wet"] }, layer: 0, spacing: 1.1, cluster: { scale: 90, amount: .7 }, temperature: [.35, .85], max: 40000 },
        willow: { select: { kind: "tree", tags: ["willow"], not: ["dead"] }, layer: 0, spacing: 1.2, cluster: { scale: 40, amount: .5 }, water: 45, max: 6000 },
        palm: { select: { kind: "tree", tags: ["palm"] }, layer: 0, spacing: 1.3, cluster: { scale: 60, amount: .6 }, temperature: [.5, 1], max: 6000 },
        dead: { select: { kind: "tree", tags: ["dead"] }, layer: 0, spacing: 1.1, cluster: { scale: 200, amount: .4 }, max: 4000 },
        rock: { select: { kind: "rock" }, layer: 1, spacing: 1.05, cluster: { scale: 45, amount: .9 }, small: 2.2, max: 40000 },
        cactus: { select: { kind: "cactus" }, layer: 1, spacing: 2.5, cluster: { scale: 80, amount: .5 }, max: 10000 },
        bush: { select: { kind: "bush" }, layer: 2, spacing: .9, cluster: { scale: 28, amount: .75 }, max: 30000 },
        deadwood: { select: { kind: "deadwood" }, layer: 2, spacing: 1, cluster: { scale: 60, amount: .5 }, max: 6000 },
        plant: { select: { kind: "plant" }, layer: 3, spacing: .8, cluster: { scale: 18, amount: .8 }, max: 120000 },
        flower: { select: { kind: "flower" }, layer: 3, spacing: .6, cluster: { scale: 22, amount: .9 }, max: 120000 },
        clump: { select: { kind: "grass" }, layer: 3, spacing: .5, cluster: { scale: 14, amount: .8 }, max: 120000 },
        lilypad: { select: { kind: "water" }, layer: 3, spacing: .9, cluster: { scale: 14, amount: .85 }, floats: true, max: 10000 },
    },
    biomes: {
        forest: { props: { conifer: 110, broadleaf: 130, dead: 3, rock: 8, bush: 40, deadwood: 10, plant: 150, flower: 12, clump: 50 }, grass: g(.65, 1.25, .05, .1) },
        grassland: { props: { broadleaf: 5, conifer: 2, willow: 8, rock: 4, bush: 7, plant: 12, flower: 150, clump: 90 }, grass: g(1, 1, .12, .55) },
        savanna: { props: { broadleaf: 3, dead: 1.5, palm: 1, rock: 5, bush: 5, cactus: 1, clump: 30 }, grass: g(.8, 1.35, .75, .08) },
        desert: { props: { cactus: 12, rock: 14, dead: .4, palm: .3, plant: 4 }, grass: g(.03, .45, 1, 0) },
        beach: { props: { palm: 6, willow: 1, rock: 3, clump: 12 }, grass: g(.12, .7, .5, 0) },
        hills: { props: { conifer: 25, broadleaf: 14, rock: 25, bush: 14, deadwood: 3, flower: 40, clump: 60 }, grass: g(.85, .8, .22, .25) },
        plateau: { props: { broadleaf: 5, conifer: 6, rock: 20, bush: 8, flower: 50, clump: 50 }, grass: g(.7, .7, .38, .3) },
        mountain: { props: { conifer: 10, rock: 55, bush: 4 }, grass: g(.2, .5, .3, .06) },
        snow: { props: { conifer: 12, dead: 3, rock: 20, bush: 2 }, grass: g(0, .4, .2, 0) },
        lake: { props: { lilypad: 140 }, grass: g(0, 1, 0, 0) },
        river: { props: { lilypad: 60, willow: 10 }, grass: g(.5, 1.3, 0, .1) },
        ocean: { props: {}, grass: g(0, 1, 0, 0) },
    },
};

export function resolve(options: Partial<EcosystemOptions> = {}): EcosystemOptions {
    const d = structuredClone(DEFAULTS);
    return {
        ...d, ...options,
        cover: { ...d.cover, ...options.cover }, season: { ...d.season, ...options.season }, cities: { ...d.cities, ...options.cities }, around: { ...d.around, ...options.around },
        groups: { ...d.groups, ...options.groups },
        biomes: { ...d.biomes, ...options.biomes },
    };
}
