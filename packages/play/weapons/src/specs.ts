import type { Caliber, GunSpec } from "./types";

/** Real muzzle speeds; drag so the slow pistol rounds fall off fast and rifles carry. */
export const CALIBERS: Record<string, Caliber> = {
    "30-06": { speed: 820, drag: .0009, life: 4, model: "30-06-springfield" },
    "45-acp": { speed: 260, drag: .0028, life: 3, model: "45-acp" },
    "762x25": { speed: 440, drag: .0024, life: 3, model: "762x25-tokarev" },
    "792x33": { speed: 690, drag: .0016, life: 3, model: "792x33-kurz" },
    "9x19": { speed: 380, drag: .0026, life: 3, model: "9x19-parabellum" },
};

const pistol = { kind: "pistol", auto: false, zero: 25, hip: .025, aimed: .005, moving: .04, bloom: .015, settle: .08, kick: .09, climb: .02, side: .02, raise: .18, reload: 1.6, reloadEmpty: 1.9 } as const;
const smg = { kind: "smg", auto: true, zero: 50, hip: .035, aimed: .006, moving: .05, bloom: .006, settle: .1, kick: .025, climb: .006, side: .012, raise: .22, reload: 2.2, reloadEmpty: 2.6 } as const;

/** Every gun in `assets/models/weapons/guns/`, by folder name. */
export const GUNS: Record<string, GunSpec> = {
    "m1911": { ...pistol, name: "M1911", model: "m1911", caliber: "45-acp", magazine: 7, interval: .14 },
    "tt-pistol": { ...pistol, name: "TT-33", model: "tt-pistol", caliber: "762x25", magazine: 8, interval: .13, kick: .08 },
    "mauser-c96": { ...pistol, name: "Mauser C96", model: "mauser-c96", caliber: "762x25", magazine: 10, interval: .12, aimed: .004, zero: 50, reload: 2.2, reloadEmpty: 2.4 },
    "ppsh-41": { ...smg, name: "PPSh-41", model: "ppsh-41", caliber: "762x25", magazine: 71, interval: 60 / 1000, bloom: .005, kick: .022 },
    "thompson-m1": { ...smg, name: "Thompson M1", model: "thompson-m1", caliber: "45-acp", magazine: 30, interval: 60 / 700, kick: .03, climb: .008 },
    "stg-44": { ...smg, kind: "rifle", name: "StG 44", model: "stg-44", caliber: "792x33", magazine: 30, interval: 60 / 550, zero: 100, hip: .04, aimed: .0025, bloom: .008, kick: .035, climb: .009, raise: .26 },
    "m1-garand": {
        name: "M1 Garand", model: "m1-garand", caliber: "30-06", kind: "rifle", auto: false, magazine: 8, interval: .2, reload: 2, reloadEmpty: 2,
        zero: 100, hip: .05, aimed: .0012, moving: .07, bloom: .025, settle: .06, kick: .1, climb: .025, side: .02, raise: .3,
    },
    /** the garand with a scope on top (M1C / M1D) */
    "m1-garand-scoped": {
        name: "M1C (scoped)", model: "m1-garand", caliber: "30-06", kind: "rifle", auto: false, magazine: 8, interval: .2, reload: 2, reloadEmpty: 2,
        zero: 200, hip: .06, aimed: .0006, moving: .09, bloom: .03, settle: .05, kick: .1, climb: .025, side: .02, raise: .4,
        scope: { min: 2, max: 8 },
    },
};
