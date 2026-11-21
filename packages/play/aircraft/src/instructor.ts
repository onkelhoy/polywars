import type { Aircraft } from "./aircraft";
import type { Vec3 } from "./types";

/**
 * Mouse aim: flies the plane toward a world direction (`aim`, unit) by setting its stick and rudder, the way a
 * pilot would: far off the nose it banks so the aim is "above" and pulls; close to it the wings level and the rudder
 * + elevator fine tune. Pulls ease off near the stall. `roll` (-1..1, manual) overrides the bank while held.
 */
export function instruct(air: Aircraft, aim: Vec3, roll = 0) {
    const v = air.vehicle, c = air.controls, b = v.body, q = b.rotation;
    const f = v.toWorld([0, 0, -1], undefined, 0), u = v.toWorld([0, 1, 0], undefined, 0), r = v.toWorld([1, 0, 0], undefined, 0);
    void q;
    // aim in the plane's frame: x right, y up, z forward
    const lx = aim[0] * r[0] + aim[1] * r[1] + aim[2] * r[2];
    const ly = aim[0] * u[0] + aim[1] * u[1] + aim[2] * u[2];
    const lz = aim[0] * f[0] + aim[1] * f[1] + aim[2] * f[2];
    const off = Math.acos(clamp(lz, -1, 1));
    const om = b.angularVelocity;
    const rate = (a: ArrayLike<number>) => om.x * a[0] + om.y * a[1] + om.z * a[2];
    // wings level: the right wing's height against the up's
    const bank = Math.atan2(r[1], u[1]);
    // bank toward the aim only for its sideways part (an aim just above / below the nose is the elevator's)
    const turn = Math.atan2(lx, Math.abs(ly) + .05);
    const k = clamp((Math.abs(lx) - .015) / .2, 0, 1);
    // aim behind: bank hard toward its side
    const rollErr = lz < 0 && Math.abs(lx) < .2 ? Math.sign(lx || 1) * 1.4 : bank * (1 - k) + turn * k;
    c.roll = roll ? clamp(roll, -1, 1) : clamp(rollErr * 1.6 - rate(f) * .6, -1, 1);
    // pull onto the aim (a little push allowed), less near the stall
    const stallNear = clamp((air.alpha * 180 / Math.PI - 9) / 5, 0, 1);
    // the flight path, not the nose, goes onto the aim: the nose sits the angle of attack above it
    const pitch = Math.atan2(ly, Math.max(lz, .05)) + air.alpha * Math.max(0, Math.cos(bank));
    c.pitch = clamp(pitch * 5 - rate(r) * .6, -.5, 1) * (1 - stallNear * .8);
    // rudder: the last few degrees sideways
    c.yaw = clamp(Math.atan2(lx, Math.max(lz, .05)) * 4 * (1 - k * .7) + rate(u) * .3, -1, 1);
}

function clamp(x: number, lo: number, hi: number) { return x < lo ? lo : x > hi ? hi : x; }
