import { Random } from "@papit/random";
import { matrix, type Ctx } from "./core";
import { FEATURES } from "./features";
import { massing } from "./massing";
import { roof } from "./roof";
import { CHANCE } from "./settings";
import type { Building, Placement, Settings, Tri } from "./types";
import { plan, walls } from "./walls";

export { matrix } from "./core";

/**
 * One medieval house from the Modular Village kit, same settings + seed = same house.
 * Cells are 1 m, centre of cell (x, z) at (x, z), the main box fills x 0..width-1, z 0..depth-1, ridge along x, front door on +Z.
 * Steps: massing (boxes) -> faces + bays + door -> feature plans -> walls -> roofs -> feature builds.
 * Every random choice uses its own `rng.fork(name)`, so toggling one feature does not reshuffle the rest.
 */
export function building(settings: Settings, seed: number): Building {
    const rng = new Random(seed);
    const decided = new Map<string, boolean>();
    const on = (name: keyof Settings) => {
        if (!decided.has(name))
        {
            const t = settings[name] as Tri;
            decided.set(name, t === "on" || (t === "random" && rng.fork(`on:${name}`).chance(CHANCE[name as keyof typeof CHANCE] ?? .5)));
        }
        return decided.get(name)!;
    };
    const pick = <T,>(name: string, value: T | "random", options: readonly T[]) => value === "random" ? rng.fork(name).pick(options as T[])! : value;
    const shape = pick("shape", settings.shape, ["rect", "rect", "L", "T"] as const);
    const pieces: Placement[] = [];
    const ctx: Ctx = {
        settings, rng, on, pieces,
        put: (piece, x, y, z, deg = 0, mirror = false) => { const p = { piece, matrix: matrix(x, y, z, deg, mirror) }; pieces.push(p); return p; },
        boxes: massing(settings, rng.fork("massing"), shape, on("windmill")),
        faces: [],
        profile: pick("roof", settings.roof, ["Straight", "Straight", "Convex", "Concave"] as const),
        family: pick("windows", settings.windows, ["Single", "Double", "Rounded"] as const),
        timber: on("timber"), stone: on("stone"),
        filled: new Set(), bare: new Set(), noRoof: new Set(),
        door: null!,
        features: {},
    };
    const main = ctx.boxes[0];
    Object.assign(ctx.features, { shape: ctx.boxes.length > 1 ? shape : "rect", width: main.w, depth: main.d, floors: main.floors, roof: ctx.profile, windows: ctx.family, timber: ctx.timber, stone: ctx.stone });
    plan(ctx);
    const active = FEATURES.filter(f => {
        const want = f.key ? on(f.key) : true;
        const ok = want && (!f.fits || f.fits(ctx));
        if (f.key) ctx.features[f.key] = ok;
        return ok;
    });
    for (const f of active) f.plan?.(ctx, rng.fork(`plan:${f.name}`));
    walls(ctx);
    for (const box of ctx.boxes) roof(ctx, box);
    for (const f of active) f.build?.(ctx, rng.fork(`build:${f.name}`));
    return { seed, pieces, features: ctx.features };
}
