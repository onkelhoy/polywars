import type { Caliber, GunSpec } from "./types";

/** Real muzzle speeds; drag so the slow pistol rounds fall off fast and rifles carry. */
export const CALIBERS: Record<string, Caliber> = {
    "30-06": { speed: 820, drag: .0009, life: 4, model: "30-06-springfield" },
    "45-acp": { speed: 260, drag: .0028, life: 3, model: "45-acp" },
    "762x25": { speed: 440, drag: .0024, life: 3, model: "762x25-tokarev" },
    "792x33": { speed: 690, drag: .0016, life: 3, model: "792x33-kurz" },
    "9x19": { speed: 380, drag: .0026, life: 3, model: "9x19-parabellum" },
    // no case models of their own yet: the nearest look-alike
    "6.5x52": { speed: 700, drag: .0010, life: 4, model: "30-06-springfield" },
    "7.7x58": { speed: 730, drag: .0010, life: 4, model: "30-06-springfield" },
    "7.5x55": { speed: 780, drag: .0009, life: 4, model: "30-06-springfield" },
    "7.5x54": { speed: 820, drag: .0009, life: 4, model: "30-06-springfield" },
    "7.92x57": { speed: 760, drag: .0009, life: 4, model: "30-06-springfield" },
    "7.62x54r": { speed: 830, drag: .0009, life: 4, model: "30-06-springfield" },
    "7.62x51": { speed: 840, drag: .0009, life: 4, model: "30-06-springfield" },
    "7.62x45": { speed: 744, drag: .0012, life: 4, model: "792x33-kurz" },
    "303": { speed: 740, drag: .0010, life: 4, model: "30-06-springfield" },
    "8x50r": { speed: 700, drag: .0011, life: 4, model: "30-06-springfield" },
    "8x60r": { speed: 530, drag: .0016, life: 3, model: "30-06-springfield" },
    "10.4x38r": { speed: 435, drag: .0022, life: 3, model: "45-acp" },
    "44-henry": { speed: 340, drag: .0026, life: 3, model: "45-acp" },
    "35-rem": { speed: 640, drag: .0016, life: 3, model: "792x33-kurz" },
    "401-wsl": { speed: 650, drag: .0016, life: 3, model: "792x33-kurz" },
    "22-lr": { speed: 370, drag: .0030, life: 2, model: "9x19-parabellum" },
    "450-nitro": { speed: 650, drag: .0018, life: 3, model: "30-06-springfield" },
    // 00 buck: 9 balls, ~4 cm a metre spread out of a cylinder bore; no hull model yet
    "12-gauge": { speed: 400, drag: .0060, life: 1.5, model: "30-06-springfield", pellets: 9, pelletSpread: .035 },
    "20x138b": { speed: 800, drag: .0005, life: 6, model: "30-06-springfield" },
};

const pistol = { kind: "pistol", action: "pistol", auto: false, zero: 25, hip: .025, aimed: .005, moving: .04, bloom: .015, settle: .08, kick: .09, climb: .02, side: .02, raise: .18, reload: 1.6, reloadEmpty: 1.9 } as const;
const smg = { kind: "smg", action: "auto", auto: true, zero: 50, hip: .035, aimed: .006, moving: .05, bloom: .006, settle: .1, kick: .025, climb: .006, side: .012, raise: .22, reload: 2.2, reloadEmpty: 2.6 } as const;

/** long guns: bolt (slow cycle), semi, lever (between), break (two barrels, two quick shots) */
const rifle = { kind: "rifle", auto: false, zero: 100, hip: .05, aimed: .0012, moving: .07, bloom: .025, settle: .06, kick: .1, climb: .025, side: .02, raise: .3 } as const;
const bolt = { ...rifle, action: "bolt", interval: 1.1, reload: 2.8, reloadEmpty: 3.2 } as const;
const semi = { ...rifle, action: "semi", interval: .2, reload: 2.4, reloadEmpty: 2.8 } as const;
const lever = { ...rifle, action: "lever", interval: .55, aimed: .0016, kick: .08, reload: 3.4, reloadEmpty: 4 } as const;

/** en-bloc: the clip goes in from the top, the bolt slams home on its own */
const GARAND: GunSpec["cues"] = { reload: [[.15, "bolt-open"], [.45, "clip-in"], [.7, "bolt-close"]], reloadEmpty: [[.4, "clip-in"], [.7, "bolt-close"]] };

/** Every gun in `assets/models/weapons/guns/`, by folder name. */
export const GUNS: Record<string, GunSpec> = {
    "m1911": { ...pistol, name: "M1911", model: "m1911", caliber: "45-acp", magazine: 7, interval: .14 },
    "tt-pistol": { ...pistol, name: "TT-33", model: "tt-pistol", caliber: "762x25", magazine: 8, interval: .13, kick: .08 },
    "mauser-c96": { ...pistol, name: "Mauser C96", model: "mauser-c96", caliber: "762x25", magazine: 10, interval: .12, aimed: .004, zero: 50, reload: 2.2, reloadEmpty: 2.4 },
    "ppsh-41": { ...smg, name: "PPSh-41", model: "ppsh-41", caliber: "762x25", magazine: 71, interval: 60 / 1000, bloom: .005, kick: .022 },
    "thompson-m1": { ...smg, name: "Thompson M1", model: "thompson-m1", caliber: "45-acp", magazine: 30, interval: 60 / 700, kick: .03, climb: .008 },
    "stg-44": { ...smg, kind: "rifle", name: "StG 44", model: "stg-44", caliber: "792x33", magazine: 30, interval: 60 / 550, zero: 100, hip: .04, aimed: .0025, bloom: .008, kick: .035, climb: .009, raise: .26 },
    "m1-garand": {
        name: "M1 Garand", model: "m1-garand", caliber: "30-06", kind: "rifle", auto: false, magazine: 8, interval: .2, reload: 2, reloadEmpty: 2, action: "semi", cues: GARAND,
        zero: 100, hip: .05, aimed: .0012, moving: .07, bloom: .025, settle: .06, kick: .1, climb: .025, side: .02, raise: .3,
    },
    /** the garand with a scope on top (M1C / M1D) */
    "m1-garand-scoped": {
        name: "M1C (scoped)", model: "m1-garand", caliber: "30-06", kind: "rifle", auto: false, magazine: 8, interval: .2, reload: 2, reloadEmpty: 2, action: "semi", cues: GARAND,
        zero: 200, hip: .06, aimed: .0006, moving: .09, bloom: .03, settle: .05, kick: .1, climb: .025, side: .02, raise: .4,
        scope: { min: 2, max: 8 },
    },
    "arisaka-type-99": { ...bolt, name: "Arisaka Type 99", model: "arisaka-type-99", caliber: "7.7x58", magazine: 5 },
    "carcano-m1891": { ...bolt, name: "Carcano M1891", model: "carcano-m1891", caliber: "6.5x52", magazine: 6, kick: .08 },
    "gewehr-88": { ...bolt, name: "Gewehr 88", model: "gewehr-88", caliber: "7.92x57", magazine: 5 },
    "k31": { ...bolt, action: "straight-pull", name: "K31", model: "k31", caliber: "7.5x55", magazine: 6, interval: .8, aimed: .0009 },
    "kar98k": { ...bolt, name: "Kar98k", model: "kar98k", caliber: "7.92x57", magazine: 5, kick: .11 },
    "kropatschek": { ...bolt, name: "Kropatschek", model: "kropatschek", caliber: "8x60r", magazine: 8, aimed: .0018, reload: 5, reloadEmpty: 5.5 },
    "lebel-m1886": { ...bolt, name: "Lebel M1886", model: "lebel-m1886", caliber: "8x50r", magazine: 8, reload: 5, reloadEmpty: 5.5 },
    "m1903a1-springfield": { ...bolt, name: "M1903A1 Springfield", model: "m1903a1-springfield", caliber: "30-06", magazine: 5, aimed: .001 },
    "mas-36": { ...bolt, name: "MAS-36", model: "mas-36", caliber: "7.5x54", magazine: 5 },
    "p14-enfield": { ...bolt, name: "P14 Enfield", model: "p14-enfield", caliber: "303", magazine: 5, aimed: .001 },
    "ross-mk3": { ...bolt, action: "straight-pull", name: "Ross Mk III", model: "ross-mk3", caliber: "303", magazine: 5, interval: .8, aimed: .0009 },
    "smle-mk3": { ...bolt, name: "SMLE Mk III", model: "smle-mk3", caliber: "303", magazine: 10, interval: .8 },
    "vetterli-m78": { ...bolt, name: "Vetterli M78", model: "vetterli-m78", caliber: "10.4x38r", magazine: 12, aimed: .002, kick: .12, reload: 5, reloadEmpty: 5.5 },
    "gewehr-43": { ...semi, name: "Gewehr 43", model: "gewehr-43", caliber: "7.92x57", magazine: 10, kick: .11 },
    "svt-40": { ...semi, name: "SVT-40", model: "svt-40", caliber: "7.62x54r", magazine: 10, kick: .11 },
    "vz-52": { ...semi, name: "vz. 52", model: "vz-52", caliber: "7.62x45", magazine: 10, kick: .08 },
    "general-liu": { ...semi, name: "General Liu rifle", model: "general-liu", caliber: "7.92x57", magazine: 6, interval: .3, aimed: .0016 },
    "remington-model-8": { ...semi, name: "Remington Model 8", model: "remington-model-8", caliber: "35-rem", magazine: 5, kick: .09 },
    "winchester-1910": { ...semi, name: "Winchester 1910", model: "winchester-1910", caliber: "401-wsl", magazine: 5, kick: .1 },
    "ruger-10-22": { ...semi, name: "Ruger 10/22", model: "ruger-10-22", caliber: "22-lr", magazine: 10, interval: .12, zero: 50, kick: .03, climb: .006, bloom: .01 },
    "beretta-model-57": { ...semi, action: "auto", kind: "smg", name: "Beretta Model 57", model: "beretta-model-57", caliber: "7.62x51", magazine: 20, auto: true, interval: 60 / 750, hip: .045, aimed: .002, bloom: .012, kick: .04, climb: .012 },
    "winchester-1866": { ...lever, name: "Winchester 1866", model: "winchester-1866", caliber: "44-henry", magazine: 13, zero: 50, kick: .06, reload: 6, reloadEmpty: 7 },
    "winchester-1895": { ...lever, name: "Winchester 1895", model: "winchester-1895", caliber: "7.62x54r", magazine: 5, kick: .11 },
    "mp40": { ...smg, name: "MP 40", model: "mp40", caliber: "9x19", magazine: 32, interval: 60 / 500, kick: .022, climb: .005 },
    "mp28": { ...smg, name: "MP 28", model: "mp28", caliber: "9x19", magazine: 32, interval: 60 / 600, kick: .024 },
    "sterling": { ...smg, name: "Sterling", model: "sterling", caliber: "9x19", magazine: 34, interval: 60 / 550, kick: .022 },
    "ithaca-m37": {
        ...rifle, action: "pump", name: "Ithaca 37", model: "ithaca-m37", caliber: "12-gauge", magazine: 5, interval: .75, zero: 25,
        hip: .03, aimed: .004, moving: .05, kick: .17, climb: .04, side: .03, reload: 3.6, reloadEmpty: 4.2,
    },
    /** 20 mm anti-tank rifle: 50 kg, slow up, slow back down */
    "lahti-l39": {
        ...rifle, name: "Lahti L-39", model: "lahti-l39", caliber: "20x138b", magazine: 10, interval: .5, zero: 300,
        hip: .09, aimed: .0012, moving: .15, bloom: .04, settle: .04, kick: .3, climb: .07, side: .04, raise: .8, reload: 4, reloadEmpty: 4.6,
    },
    "double-deuce": { ...rifle, action: "break", name: "Double rifle", model: "double-deuce", caliber: "450-nitro", magazine: 2, interval: .15, aimed: .0015, kick: .2, climb: .05, reload: 2.6, reloadEmpty: 2.6 },
};
