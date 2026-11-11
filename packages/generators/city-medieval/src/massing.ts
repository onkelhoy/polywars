import type { Random } from "@papit/random";
import type { Box } from "./core";
import type { Range, Settings } from "./types";

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** the boxes of a house: main box (ridge along x, front +Z) + a wing behind it for L / T */
export function massing(settings: Settings, rng: Random, shape: "rect" | "L" | "T", tower: boolean): Box[] {
    const range = ([a, b]: Range) => rng.int(Math.min(a, b), Math.max(a, b) + 1);
    let depth = even(range(settings.depth)), width = Math.max(depth, Math.round(range(settings.width)));
    let floors = Math.max(1, range(settings.floors));
    if (tower) { floors = Math.max(2, floors) + 1; depth = Math.min(depth, 6); width = Math.max(4, Math.min(width, depth + 1)); }
    const main: Box = { x: 0, z: 0, w: width, d: depth, floors, ridge: "x" };
    if (shape === "rect" || width < 5) return [main];
    // wing: behind the main box, ridge along z, as wide as half the front at most
    const max = Math.min(depth, width - 2);
    if (max < 4) return [main];
    const wing = 2 * Math.floor(rng.int(4, max + 1) / 2);
    const length = rng.int(3, Math.max(3, depth) + 1);
    const x = shape === "T" ? Math.floor((width - wing) / 2) : rng.chance(.5) ? 0 : width - wing;
    const wfloors = Math.max(1, floors - (rng.chance(.5) ? 1 : 0));
    return [main, { x, z: -length, w: wing, d: length, floors: wfloors, ridge: "z", join: "start", extend: wfloors === floors ? wing / 2 : 0 }];
}
