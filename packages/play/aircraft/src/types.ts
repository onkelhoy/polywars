export type Vec3 = [number, number, number];

/** the pilot's hands and feet, each step */
export type Controls = {
    /** 0..1 (the engine spools to it) */
    throttle: number;
    /** -1 push .. 1 pull (nose up) */
    pitch: number;
    /** -1 left .. 1 right */
    roll: number;
    /** rudder, -1 left .. 1 right (also the tail wheel on the ground) */
    yaw: number;
    /** flaps, 0 up .. 1 down (take off / landing: lift at low speed). Default 1 */
    flaps?: number;
    /** wheel brakes */
    brake?: boolean;
};

/** what a fighter's `vehicle.json` adds (tools/blender/packs/fighter.py) */
export type WingSpec = {
    /** m */
    span: number;
    /** m² */
    area: number;
    /** wing tips, model space (vapour trails) */
    tips: Vec3[];
};

export type AircraftSetting = {
    wing: WingSpec;
    /** engine, W (P-51: ~1.1 MW). Default 1.1e6 */
    power?: number;
    /** most thrust standing still, N. Default 20000 */
    staticThrust?: number;
    /** zero lift drag coefficient. Default .019 */
    drag?: number;
    /** lift per rad of angle of attack. Default 5.2 */
    liftSlope?: number;
    /** stall angle, degrees. Default 15 */
    stall?: number;
    /** wing set at this to the fuselage, degrees. Default 1.5 */
    incidence?: number;
    /** lift the flaps add, fully down. Default .9 */
    flapLift?: number;
    /** control authority: pitch / roll / yaw (rad/s² at 100 m/s). Defaults 3 / 5 / 1.6 */
    elevator?: number;
    aileron?: number;
    rudder?: number;
    /** steady wind, m/s (world) */
    wind?: Vec3;
    /** gusts, m/s: turbulence on top of the wind (light planes get bumped). Default 2 */
    gust?: number;
    /** engine rev / min idle .. full. Defaults 700 / 3000 */
    idle?: number;
    redline?: number;
};

/** fixed forward guns: muzzles (model space), rate per gun, rounds per gun */
export type GunsSetting = {
    muzzles: Vec3[];
    /** rounds / min, each gun. Default 800 (M2 .50 in a wing) */
    rate?: number;
    /** rounds each gun carries (default 400 inboard .. 270 outboard: P-51D, 1880 in all) */
    rounds?: number[];
    /** m/s. Default 870 */
    speed?: number;
    /** the guns meet at this far ahead, m. Default 300 */
    convergence?: number;
    /** spread, rad. Default .0025 */
    spread?: number;
    /** kg a round (recoil). Default .046 */
    bullet?: number;
    /** every nth round a tracer. Default 4 */
    tracer?: number;
};

export type Shot = { from: Vec3; direction: Vec3; speed: number; tracer: boolean; gun: number };
