/** A cartridge: what leaves the barrel. */
export type Caliber = {
    /** muzzle speed, m/s */
    speed: number;
    /** quadratic drag per metre (v = v0·e^(-drag·x)) */
    drag: number;
    /** seconds a bullet lives */
    life: number;
    /** folder under `assets/models/weapons/ammo/` */
    model: string;
};

/**
 * How a gun shoots. Angles are radians (a cone). `hip` / `aimed` spread standing still, `moving` added at a
 * full walk (less when aimed), `bloom` per quick shot (gone again at `settle` per second, at most `bloom * 3`).
 * Recoil: `kick` the view jumps up and springs back, `climb` of it stays, `side` at most to either side.
 */
export type GunSpec = {
    name: string;
    /** folder under `assets/models/weapons/guns/` (model.glb: fire / idle / reload / reload-empty clips) */
    model: string;
    caliber: string;
    /** rounds in a full gun */
    magazine: number;
    /** auto: held trigger keeps firing */
    auto: boolean;
    /** least seconds between shots */
    interval: number;
    /** seconds for a reload (the clip plays at this length), empty one */
    reload: number;
    reloadEmpty: number;
    /** metres where the bullet meets the sights */
    zero: number;
    hip: number; aimed: number; moving: number; bloom: number; settle: number;
    kick: number; climb: number; side: number;
    /** seconds to go up to the eye */
    raise: number;
    /** pistol (one hand, near) or long gun (shoulder) */
    kind: "pistol" | "smg" | "rifle";
    /** a scope instead of iron sights: magnification range (the wheel picks) */
    scope?: { min: number; max: number };
};

export type GunEvent = "shot" | "empty" | "reload" | "reloaded" | null;
