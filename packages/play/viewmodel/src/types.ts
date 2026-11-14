import type { Vec3 } from "./math";

/**
 * How something is held, in its own model space (metres, -z ahead, y up) and camera space (eye at 0, -z ahead).
 */
export type Hold = {
    /** the trigger hand's point on the item */
    grip: Vec3;
    /** the support hand's point (fore end), none = one handed */
    fore?: Vec3;
    /** where the bullet leaves */
    muzzle: Vec3;
    /** a point on the sight line (rear sight notch / scope eyepiece): aimed, the eye looks down it along -z */
    sight: Vec3;
    /** the far end of the sight line (front sight tip / scope objective): aimed, the gun turns so that
     * `sight` -> `front` runs straight down the view (none = the bore is the sight line) */
    front?: Vec3;
    /** camera space: where the grip sits at the hip */
    hip: Vec3;
    /** aimed: how far ahead of the eye the `sight` point is, m */
    eye: number;
    /** how hard it sways (heavier = slower, wider), default 1 */
    weight?: number;
    /** hip fire points the bore at the view's middle this far ahead, m (default 30) */
    converge?: number;
};

/** What the holder did this frame. */
export type Motion = {
    /** how much the view turned this frame, radians (yaw left +, pitch up +) */
    yaw: number;
    pitch: number;
    /** m/s over the ground */
    speed: number;
    /** sideways speed in view space (right +), m/s, for a lean into strafing */
    strafe?: number;
    grounded: boolean;
    /** set on the frame it landed: m/s it hit with */
    landed?: number;
    /** 0..1 up at the eye */
    aimed: number;
    /** 0..1 through a reload, -1 none */
    reload?: number;
    /** running flat out (gun held low across) */
    sprint?: boolean;
    /** 0..1 out of breath / hurt: more sway */
    shake?: number;
};
