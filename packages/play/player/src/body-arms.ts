import { Quaternion } from "@papit/quaternion";
import { Vector3 } from "@papit/vector";
import type { Vec3 } from "@polywar/viewmodel";

type P = ArrayLike<number>;
type Bone = {
    name: string; parent: Bone | null; children: Bone[];
    head: Vector3; worldRotation: Quaternion; rotation: Quaternion;
    moveTo(point: P): void;
};
/** the bits of `@polywar/skeleton` used here */
export type SkinLike = {
    bones: Bone[]; matrices: Float32Array;
    armature: { find(name: string): Bone | null | undefined };
    ik: Map<string, unknown>;
    setIK(bone: string, weight: number): void;
    update(): Float32Array;
    reset(): void;
};

/** an arm of the rig: chain (upper arm, forearm, hand) + its controls (`hand.ik`, `elbow.pole`) */
export type BodyArm = {
    upper: Bone; forearm: Bone; hand: Bone; control: Bone; pole: Bone;
    /** the clavicle: turns forward when the hand is out of reach */
    shoulder?: Bone;
    /** shoulder to wrist, straight */
    length: number;
    /**
     * rest, skin space: the hand's world rotation, its direction (knuckles) and palm,
     * `contact`: wrist to the middle of the palm (what goes on the gun)
     */
    rest: { rotation: Quaternion; dir: Vector3; palm: Vector3; contact: Vector3 };
};

/** how a hand sits on a gun, gun space (x right, y up, -z forward): knuckle direction + palm normal */
export type HandFrame = { dir: Vec3; palm: Vec3 };
/** the trigger hand: knuckles forward and down, palm on the grip's right side */
export const GRIP_HAND: HandFrame = { dir: [0, -.55, -.85], palm: [-1, 0, 0] };
/** the support hand: knuckles forward, palm up under the fore end */
export const FORE_HAND: HandFrame = { dir: [.15, .1, -1], palm: [.5, .85, 0] };

const v = (p: P) => new Vector3(p[0], p[1], p[2]);
/** `a` without its part along unit `n`, normalized */
const reject = (a: P, n: Vector3) => v(a).subtract(n.clone.multiply(n.dot(v(a)))).normalize();

/**
 * Finds an arm of the human rig (`tools/blender/lib/human_rig.py`) by side ("L" / "R"), undefined without the
 * controls. Reads the rest frame: call before posing (resets the skin).
 */
export function bodyArm(skin: SkinLike, names: [string, string, string], side: "L" | "R"): BodyArm | undefined {
    const [upper, forearm, hand] = names.map(n => skin.armature.find(n));
    const control = skin.armature.find(`hand.ik.${side}`), pole = skin.armature.find(`elbow.pole.${side}`);
    if (!upper || !forearm || !hand || !control || !pole || !skin.ik.has(forearm.name)) return undefined;
    skin.reset(); skin.update();
    // rest is a T-pose, palms down
    const top = skin.armature.find("head") ?? skin.armature.find("neck"), hips = skin.armature.find("hips");
    const up = top && hips ? v(top.head).subtract(hips.head).normalize() : new Vector3(0, 1, 0);
    const tip = hand.children.find(c => /^fingers\.1|^index\.1/.test(c.name));
    const dir = tip ? v(tip.head).subtract(hand.head).normalize() : v(hand.head).subtract(forearm.head).normalize();
    const palm = reject(up.multiply(-1), dir);
    const knuckles = tip ? Vector3.distance(tip.head, hand.head) : .08;
    const contact = dir.clone.multiply(knuckles * .6).add(palm.clone.multiply(.025));
    const length = Vector3.distance(upper.head, forearm.head) + Vector3.distance(forearm.head, hand.head);
    const shoulder = upper.parent && /shoulder|clavicle/i.test(upper.parent.name) ? upper.parent : undefined;
    return { upper, forearm, hand, control, pole, shoulder, length, rest: { rotation: hand.worldRotation.clone, dir, palm, contact } };
}

/** the world (skin space) rotation that turns the rest hand onto knuckles `dir` and palm `palm` (unit, skin space) */
export function handRotation(arm: BodyArm, dir: P, palm: P) {
    const d = v(dir).normalize();
    const swing = Quaternion.fromTo(arm.rest.dir, d);
    const p0 = reject(swing.rotate(arm.rest.palm.clone), d), p1 = reject(palm, d);
    const angle = Math.atan2(v(p0).cross(p1).dot(d), p0.dot(p1));
    const twist = Quaternion.fromAxisAngle(d, angle);
    const out = Quaternion.identity;
    Quaternion.multiplyInto(out, swing, arm.rest.rotation);
    return Quaternion.multiplyInto(out, twist, out);
}

/** a hand frame tilted (round the side axis) and twisted (round its knuckles), radians */
export function turnFrame(frame: HandFrame, tilt: number, twist: number): HandFrame {
    const d = v(frame.dir).normalize(), p = reject(frame.palm, d);
    const side = d.clone.cross(p).normalize();
    const qt = Quaternion.fromAxisAngle(side, tilt), qw = Quaternion.fromAxisAngle(d, twist);
    const dir = qt.rotate(d.clone), palm = qw.rotate(qt.rotate(p.clone));
    return { dir: [dir[0], dir[1], dir[2]], palm: [palm[0], palm[1], palm[2]] };
}

/** how far the clavicle turns forward at most (radians) */
const SHRUG = .6;

/**
 * Bends the arm with the rig's own IK: the palm goes on `target` with the hand turned to `rotation` (the hand
 * copies the control), the elbow pole out along `pole` (a direction) from the middle of the arm. Out of reach,
 * the clavicle turns toward it first. Skin space, on a posed skin. Call `skin.update()` after.
 */
export function reach(skin: SkinLike, arm: BodyArm, target: P, rotation: Quaternion, pole: P) {
    const { control, upper, shoulder } = arm;
    const now = Quaternion.multiplyInto(Quaternion.identity, rotation, arm.rest.rotation.clone.conjugate());
    const wrist = v(target).subtract(now.rotate(arm.rest.contact.clone));
    if (shoulder)
    {
        const arc = v(upper.head).subtract(shoulder.head), to = v(wrist).subtract(shoulder.head);
        const extra = Vector3.distance(wrist, upper.head) - arm.length * .97;
        if (extra > 0)
        {
            const axis = arc.clone.cross(to), turn = Quaternion.fromAxisAngle(axis, Math.min(SHRUG, extra / arc.magnitude));
            const world = Quaternion.multiplyInto(Quaternion.identity, turn, shoulder.worldRotation);
            Quaternion.multiplyInto(shoulder.rotation, shoulder.parent?.worldRotation.clone.conjugate() ?? Quaternion.identity, world);
        }
    }
    control.moveTo(wrist);
    const parent = control.parent?.worldRotation.clone.conjugate() ?? Quaternion.identity;
    Quaternion.multiplyInto(control.rotation, parent, rotation);
    const mid = v(upper.head).add(wrist).multiply(.5).add(v(pole).normalize().multiply(.5));
    arm.pole.moveTo(mid);
    skin.setIK(arm.forearm.name, 1);
}

/** lets go: the arm back to the clip (FK) */
export function release(skin: SkinLike, arm: BodyArm) { skin.setIK(arm.forearm.name, 0); }
