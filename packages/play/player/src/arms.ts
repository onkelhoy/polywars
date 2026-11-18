import { Vector3 } from "@papit/vector";
import type { Vec3 } from "@polywar/viewmodel";

/** arm proportions for the editor's arm lines and the default pose */
export type ArmsLook = {
    /** camera space shoulders (right; the left is mirrored) */
    shoulder: Vec3;
    upper: number;
    forearm: number;
};

/** where the arms start and bend, camera space, [right, left]: the IK pole runs shoulder -> elbow */
export type ArmsPose = { shoulder: [Vec3, Vec3]; elbow: [Vec3, Vec3] };

/** the pose for a look: shoulders mirrored, elbows out and down */
export function armsPoseOf(look: ArmsLook): ArmsPose {
    const s = look.shoulder, k = .2 / Math.hypot(1, 1, .4);
    return { shoulder: [[s[0], s[1], s[2]], [-s[0], s[1], s[2]]], elbow: [[s[0] + k, s[1] - k, s[2] + .4 * k], [-s[0] - k, s[1] - k, s[2] + .4 * k]] };
}

/** a grown up's arms */
export const ARMS: ArmsLook = { shoulder: [.21, -.34, .06], upper: .34, forearm: .36 };

/** the elbow of a two bone arm from `shoulder` to `hand`, bent toward `pole` (a direction) */
export function elbowOf(look: { upper: number; forearm: number }, shoulder: Vec3, hand: Vec3, pole: Vec3): Vec3 {
    const { upper, forearm } = look;
    const d = new Vector3(hand[0], hand[1], hand[2]).subtract(shoulder);
    const reach = d.magnitude || 1e-6;
    const along = Math.min(reach, upper + forearm - 1e-3);
    const a = (upper * upper - forearm * forearm + along * along) / (2 * along);
    const out = Math.sqrt(Math.max(0, upper * upper - a * a));
    const u = d.normalize(), p = new Vector3(pole[0], pole[1], pole[2]);
    const side = p.subtract(u.clone.multiply(p.dot(u))).normalize();
    const e = u.multiply(a).add(side.multiply(out)).add(shoulder);
    return [e[0], e[1], e[2]];
}
