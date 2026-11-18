export type Vec3 = [number, number, number];

/** one wheel, model space (glTF: y up, nose -z, right +x), metres */
export type WheelSpec = {
    /** glTF node drawn as this wheel (pivot at its centre) */
    node?: string;
    /** centre at rest (car standing loaded on flat ground) */
    position: Vec3;
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
    body?: { min: Vec3; max: Vec3 };
    steeringWheel?: { node: string; position: Vec3; axis: Vec3; turns?: number };
    seat?: Vec3;
    eye?: Vec3;
    exit?: Vec3;
};

/** a static axis aligned box the chassis bumps into and wheels drive onto (same shape as `@polywar/mover` boxes) */
export type Solid = { min: Vec3; max: Vec3 };

export type VehicleSetting = {
    spec: VehicleSpec;
    /** ground height at x / z */
    ground: (x: number, z: number) => number;
    solids?: Solid[];
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
    /** centre of mass height above the axles, m. Default .15 */
    centre?: number;
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
    contact: Vec3;
    normal: Vec3;
};
