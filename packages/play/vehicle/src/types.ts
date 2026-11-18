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
};

/** what an asset's `vehicle.json` holds (see tools/blender/packs/jeep.py) */
export type VehicleSpec = {
    model?: string;
    /** kg */
    mass: number;
    /** m/s */
    topSpeed: number;
    wheels: WheelSpec[];
    /** model space box the chassis collides as; default from the wheels */
    body?: { min: Point; max: Point };
    /** `axis` points from the rim to the driver; `radius` the rim's (m) */
    steeringWheel?: { node: string; position: Point; axis: Point; turns?: number; radius?: number };
    seat?: Point;
    eye?: Point;
    exit?: Point;
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
};

export type DriveInput = {
    /** -1 back .. 1 forward (brakes when it opposes the motion) */
    throttle: number;
    /** -1 left .. 1 right */
    steer: number;
    handbrake?: boolean;
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
