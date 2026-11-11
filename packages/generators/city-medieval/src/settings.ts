import { Random, hash } from "@papit/random";
import type { Settings, Tri } from "./types";

export const TRI_KEYS = ["tunnel", "windmill", "waterwheel", "balcony", "chimney", "bay", "timber", "awning", "props", "ground"] as const;
export const SHAPES = ["rect", "L", "T", "random"] as const;
export const ROOFS = ["Straight", "Convex", "Concave", "random"] as const;
const TRIS: Tri[] = ["off", "on", "random"];

export const DEFAULTS: Settings = {
    width: [4, 8], depth: [4, 6], floors: [1, 3], shape: "random", roof: "random",
    tunnel: "random", windmill: "random", waterwheel: "random", balcony: "random", chimney: "random",
    bay: "random", timber: "on", awning: "random", props: "on", ground: "on",
};

/** chance a "random" feature is on */
export const CHANCE: Partial<Record<typeof TRI_KEYS[number], number>> = { windmill: .2, waterwheel: .2, tunnel: .3 };

/** settings + seed as one short code: `m1.<seed>.<numbers>.<shape+roof>.<tris>` (base 36) */
export function encode(settings: Settings, seed: number) {
    const nums = [...settings.width, ...settings.depth, ...settings.floors].map(n => n.toString(36)).join("");
    const choice = SHAPES.indexOf(settings.shape).toString() + ROOFS.indexOf(settings.roof);
    const tris = TRI_KEYS.map(k => TRIS.indexOf(settings[k])).join("");
    return `m1.${(seed >>> 0).toString(36)}.${nums}.${choice}.${parseInt(tris, 3).toString(36)}`;
}

export function decode(code: string): { settings: Settings; seed: number } | null {
    const [v, seed, nums, choice, tris] = code.trim().split(".");
    if (v !== "m1" || !tris || nums.length !== 6) return null;
    const n = [...nums].map(c => parseInt(c, 36));
    const t = parseInt(tris, 36).toString(3).padStart(TRI_KEYS.length, "0");
    const settings = { ...DEFAULTS, width: [n[0], n[1]], depth: [n[2], n[3]], floors: [n[4], n[5]], shape: SHAPES[+choice[0]], roof: ROOFS[+choice[1]] } as Settings;
    TRI_KEYS.forEach((k, i) => settings[k] = TRIS[+t[i]]);
    return { settings, seed: parseInt(seed, 36) >>> 0 };
}

/** seed of variant `index` under a master seed */
export function variant(seed: number, index: number) {
    return new Random(seed).fork(index).uint() >>> 0;
}

export const randomSeed = () => hash(`${Math.random()}`) >>> 0;
