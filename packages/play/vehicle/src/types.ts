import type { Vector3 } from "@papit/vector";
import type { World } from "@papit/rigidbody";

/** a point / direction as stored in json: [x, y, z] (math runs on `@papit/vector` Vector3) */
export type Point = ArrayLike<number>;

/** one wheel, model space (glTF: y up, nose -z, right +x), metres */
export type WheelSpec = {
    /** glTF node drawn as this wheel (pivot at its centre) */
    node?: string;
    /** centre at rest (car standing loaded on flat ground) */
    position: Point;
    radius: number;
    width?: number;
    steer?: boolean;
    drive?: boolean;
    /** tank: which track, -1 left / 1 right (the same node can stand for both sides of an axle) */
    side?: number;
    /** drawn radius when it differs from the contact `radius` (tank road wheels stand on the track), m */
    spin?: number;
};

/** what an asset's `vehicle.json` holds (see tools/blender/packs/jeep.py) */
export type VehicleSpec = {
    model?: string;
    /** "bike": two wheels in line, kept upright by a balance (leans into turns, kickstand when parked, falls on a crash) */
    kind?: "car" | "bike" | "tank";
    /** kg */
    mass: number;
    /** m/s */
    topSpeed: number;
    wheels: WheelSpec[];
    /** model space box the chassis collides as; default from the wheels */
    body?: { min: Point; max: Point };
    /** `axis` points from the rim to the driver; `radius` the rim's (m) */
    steeringWheel?: { node: string; position: Point; axis: Point; turns?: number; radius?: number };
    /** bike front: fork node turning round `axis` (up, raked back) through `position` (the front axle); the steering wheel rides it */
    fork?: { node: string; position: Point; axis: Point };
    /** handlebar ends [left, right], model space (rest, straight ahead) */
    grips?: Point[];
    seat?: Point;
    eye?: Point;
    exit?: Point;
    /** tank: turret node turning round y through `position` (the ring) */
    turret?: { node: string; position: Point };
    /** tank: gun node raised round x through `position` (the trunnion), `muzzle` its end at rest, `elevation` [down, up] degrees */
    gun?: { node: string; position: Point; muzzle: Point; elevation?: number[] };
    /** exhaust pipe end, model space (`Exhaust`); default low at the back, right side */
    exhaust?: Point;
};

/** a static axis aligned box the chassis bumps into and wheels drive onto (same shape as `@polywar/mover` boxes) */
export type Solid = { min: Point; max: Point };

/** a list, or the ones near x / z (e.g. a grid lookup like `@polywar/mover` colliders) */
export type SolidSource = Solid[] | ((x: number, z: number) => Solid[]);

export type VehicleSetting = {
    spec: VehicleSpec;
    /** ground height at x / z */
    ground: (x: number, z: number) => number;
    /** boxes to bump into / drive onto (ignored with a shared `world`: `Vehicles` keeps them) */
    solids?: SolidSource;
    /** a shared world (`Vehicles`): the host steps it and calls `drive` before each step */
    world?: World;
    /** suspension travel, m. Default .3 */
    travel?: number;
    /** spring frequency, Hz: lower is softer. Default 1.3 */
    frequency?: number;
    /** damping ratio: lower bounces more. Default .3 */
    damping?: number;
    /** tyre friction (load x grip). Default 1.1 */
    grip?: number;
    /** sideways grip left on the rear while the handbrake is on. Default .35 */
    slide?: number;
    /** full throttle acceleration, m/s². Default 3.5 */
    accel?: number;
    /** brake deceleration, m/s². Default 8 */
    brake?: number;
    /** reverse top speed, m/s. Default 5 */
    reverse?: number;
    /** front wheel lock, degrees. Default 34 */
    steer?: number;
    /** speed (m/s) where the lock is halved. Default 6 */
    steerFade?: number;
    /** centre of mass height above the axles, m (low keeps it on its wheels). Default 0 */
    centre?: number;
    /** anti-roll bar, share of the spring rate between an axle's wheels. Default 1.5 */
    antiRoll?: number;
    /** top speed x this (arcade: 1.5 is ~150 km/h for the jeep). Default 1 */
    boost?: number;
    /** each forward gear's top as a share of the top speed. Default [.3, .58, 1] (3-speed) */
    gears?: number[];
    /** pull per gear x `accel`. Default [1.7, 1.05, .7] */
    pull?: number[];
    /** seconds per shift: the power is cut, then eased back in. Default .55 */
    shiftTime?: number;
    /** rev / min. Defaults 800 / 3800 */
    idle?: number;
    redline?: number;
    /** how much of the tyre force's lean it keeps: 1 real (tips easily), 0 none. Default .3 */
    roll?: number;
    /** bike balance: lean spring (1/s²) and damping (1/s). Defaults 30 / 8 */
    balance?: number;
    balanceDamping?: number;
    /** bike: most lean, degrees. Default 45 */
    maxLean?: number;
    /** tank: turn on the spot, rad / s at full steer. Default .6 */
    pivotTurn?: number;
    /** tank: track rolling drag (share of the weight) with no throttle. Default .25 */
    rolling?: number;
};

export type DriveInput = {
    /** -1 back .. 1 forward (brakes when it opposes the motion) */
    throttle: number;
    /** -1 left .. 1 right */
    steer: number;
    handbrake?: boolean;
    /** parking brake: every wheel held (cars nobody drives) */
    parked?: boolean;
    /** bike: someone rides it (no rider + parked = on the kickstand) */
    ridden?: boolean;
};

export type WheelState = {
    spec: WheelSpec;
    grounded: boolean;
    /** spring length, 0 (bump) .. travel (full droop) */
    length: number;
    /** rolling angle, rad */
    spin: number;
    /** rad / s */
    omega: number;
    /** suspension force, N */
    load: number;
    /** sliding (grip used up) */
    slipping: boolean;
    contact: Vector3;
    normal: Vector3;
};
