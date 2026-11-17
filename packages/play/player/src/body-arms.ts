import { Quaternion } from "@papit/quaternion";
import { Vector3 } from "@papit/vector";
import type { Vec3 } from "@polywar/viewmodel";

type P = ArrayLike<number>;
type Bone = {
    name: string; parent: Bone | null; children: Bone[];
    head: Vector3; tail: Vector3; offset: Vector3; worldRotation: Quaternion; rotation: Quaternion;
    length: number; attach: number;
    moveTo(point: P): void;
    update(): void;
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

/** a finger: 3 bones, its tip control (IK, chain 3) and pole; rest base (skin space) and length */
type Finger = { name: "thumb" | "index" | "fingers"; ik: string; tip: Bone; pole: Bone; base: Vector3; length: number };

/** an arm of the rig: chain (upper arm, forearm, hand) + its controls (`hand.ik`, `elbow.pole`) */
export type BodyArm = {
    upper: Bone; forearm: Bone; hand: Bone; control: Bone; pole: Bone;
    /** the clavicle: turns forward when the hand is out of reach */
    shoulder?: Bone;
    /** shoulder to wrist, straight */
    length: number;
    /** the body's up at rest (skin space) */
    up: Vector3;
    /**
     * rest, skin space: the hand's world rotation, its direction (knuckles) and palm,
     * `contact`: wrist to the middle of the palm (what goes on the gun)
     */
    rest: { rotation: Quaternion; head: Vector3; dir: Vector3; palm: Vector3; contact: Vector3 };
    /** fingers with tip controls (none on rigs without) */
    fingers: Finger[];
    /** 1 when the thumb sits on the +(dir x palm) side of the hand, else -1 */
    thumb: number;
};

/**
 * How a hand holds a bar of the gun, gun space (x right, y up, -z forward): `axis` the bar (the thumb points
 * along it), `palm` the palm's normal (toward the bar), `radius` the bar's (m). The fingers wrap round it.
 */
export type HandFrame = { axis: Vec3; palm: Vec3; radius: number };
/** the trigger hand on a straight stock's wrist: the fingers wrap it on a slant (thumb up and forward), palm on its right side */
export const WRIST_GRIP: HandFrame = { axis: [0, .7, -.7], palm: [-1, .15, 0], radius: .017 };
/** the trigger hand on a pistol grip: thumb up and forward */
export const PISTOL_GRIP: HandFrame = { axis: [0, .9, -.4], palm: [-1, 0, 0], radius: .015 };
/** the support hand: thumb forward along the fore end, palm up under it */
export const FORE_HAND: HandFrame = { axis: [0, 0, -1], palm: [.45, .9, 0], radius: .022 };

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
    const palm = reject(up.clone.multiply(-1), dir);
    const knuckles = tip ? Vector3.distance(tip.head, hand.head) : .08;
    const contact = dir.clone.multiply(knuckles * .6).add(palm.clone.multiply(.025));
    const length = Vector3.distance(upper.head, forearm.head) + Vector3.distance(forearm.head, hand.head);
    const shoulder = upper.parent && /shoulder|clavicle/i.test(upper.parent.name) ? upper.parent : undefined;
    const fingers: Finger[] = [];
    for (const name of ["thumb", "index", "fingers"] as const)
    {
        const one = skin.armature.find(`${name}.1.${side}`), three = skin.armature.find(`${name}.3.${side}`);
        const tip = skin.armature.find(`${name}.ik.${side}`), fp = skin.armature.find(`${name}.pole.${side}`), ik = `${name}.3.${side}`;
        if (one && three && tip && fp && skin.ik.has(ik) && tip.parent === hand && fp.parent === hand)
            fingers.push({ name, ik, tip, pole: fp, base: v(one.head), length: Vector3.distance(one.head, three.tail) });
    }
    const thumbBone = skin.armature.find(`thumb.1.${side}`);
    const thumb = thumbBone && v(thumbBone.head).subtract(hand.head).dot(dir.clone.cross(palm)) < 0 ? -1 : 1;
    return { upper, forearm, hand, control, pole, shoulder, length, up, fingers, thumb, rest: { rotation: hand.worldRotation.clone, head: v(hand.head), dir, palm, contact } };
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

/** the hand's rotation (skin space) for a bar along `axis` with the palm toward `palm` (both skin space) */
export function holdRotation(arm: BodyArm, axis: P, palm: P) {
    const a = v(axis).normalize(), p = reject(palm, a);
    // thumb along the bar: dir x palm = thumb * axis
    return handRotation(arm, p.clone.cross(a).multiply(arm.thumb), p);
}

/** a hand frame tilted (round the knuckle line) and twisted (round the bar), radians */
export function turnFrame(frame: HandFrame, tilt: number, twist: number): HandFrame {
    const a = v(frame.axis).normalize(), p = reject(frame.palm, a);
    const knuckles = p.clone.cross(a).normalize();
    const qt = Quaternion.fromAxisAngle(knuckles, tilt), qw = Quaternion.fromAxisAngle(a, twist);
    const axis = qt.rotate(a.clone), palm = qw.rotate(qt.rotate(p.clone));
    return { axis: [axis[0], axis[1], axis[2]], palm: [palm[0], palm[1], palm[2]], radius: frame.radius };
}

/**
 * Bends the body round `axis` (skin space) by `angle` spread over `bones` (e.g. spine, spine.1, chest) by `shares`,
 * on a posed skin, then moves the whole body so `keep` (the head: the eye) stays put, the hips go back instead.
 * The torso follows the view's pitch round the eye, the arms keep their reach.
 */
export function bend(skin: SkinLike, bones: string[], shares: number[], axis: P, angle: number, keep = "head") {
    const kept = skin.armature.find(keep), was = kept && v(kept.head);
    bones.forEach((name, i) => {
        const bone = skin.armature.find(name);
        if (!bone) return;
        const turn = Quaternion.fromAxisAngle(axis, angle * shares[i]);
        const world = Quaternion.multiplyInto(Quaternion.identity, turn, bone.worldRotation);
        Quaternion.multiplyInto(bone.rotation, bone.parent?.worldRotation.clone.conjugate() ?? Quaternion.identity, world);
        bone.update();
    });
    let root = kept;
    while (root?.parent) root = root.parent;
    if (!root || !kept || !was) return;
    root.moveTo(v(root.head).add(was.subtract(kept.head)));
    root.update();
}

/** how far the clavicle turns at most (radians) */
const SHRUG = .6;
/** the shoulder joint lifts up to this far below a raised wrist (m): a shooter's shoulder comes up to the stock */
const LIFT = .12;

/**
 * Bends the arm with the rig's own IK: the palm goes on `target` with the hand turned to `rotation` (the hand
 * copies the control), the elbow toward `pole` (a direction from the shoulder). Out of reach,
 * the clavicle turns toward it first. Skin space, on a posed skin. Call `skin.update()` after.
 */
export function reach(skin: SkinLike, arm: BodyArm, target: P, rotation: Quaternion, pole: P) {
    const { control, upper, shoulder } = arm;
    const now = Quaternion.multiplyInto(Quaternion.identity, rotation, arm.rest.rotation.clone.conjugate());
    const wrist = v(target).subtract(now.rotate(arm.rest.contact.clone));
    if (shoulder)
    {
        // the shoulder joint goes up toward a raised hand and forward toward one out of reach
        const arc = v(upper.head).subtract(shoulder.head), length = arc.magnitude;
        const rise = Math.max(0, v(wrist).subtract(upper.head).dot(arm.up) - LIFT);
        const extra = Math.max(0, Vector3.distance(wrist, upper.head) - arm.length * .97);
        const toward = v(wrist).subtract(upper.head).normalize().multiply(extra).add(arm.up.clone.multiply(rise));
        if (toward.magnitude > 1e-4)
        {
            const swing = Quaternion.fromTo(arc, arc.clone.add(toward));
            const angle = 2 * Math.acos(Math.min(1, Math.abs(swing[3]))), limit = Math.min(SHRUG, toward.magnitude / length);
            const turn = angle > limit ? Quaternion.identity.slerp(swing, limit / angle) : swing;
            const world = Quaternion.multiplyInto(Quaternion.identity, turn, shoulder.worldRotation);
            Quaternion.multiplyInto(shoulder.rotation, shoulder.parent?.worldRotation.clone.conjugate() ?? Quaternion.identity, world);
        }
    }
    control.moveTo(wrist);
    const parent = control.parent?.worldRotation.clone.conjugate() ?? Quaternion.identity;
    Quaternion.multiplyInto(control.rotation, parent, rotation);
    // papit's two bone IK bends toward the pole as seen from the chain's root
    arm.pole.moveTo(v(upper.head).add(v(pole).normalize().multiply(.5)));
    skin.setIK(arm.forearm.name, 1);
    return wrist;
}

/** how far a finger wraps round the bar at most (radians round its middle) */
const WRAP = 4.2;

/**
 * Curls the fingers round the bar of `radius` in the palm (tip controls + poles, hand space, so they ride with the
 * hand whatever the arm does). `trigger` (skin space, with the `wrist` / `rotation` from `reach`): the index goes
 * on it instead. Call `skin.update()` after.
 */
export function grip(skin: SkinLike, arm: BodyArm, radius: number, trigger?: { at: P; wrist: P; rotation: Quaternion }) {
    const { head, dir: d, palm: p, contact, rotation } = arm.rest;
    const axis = d.clone.cross(p).multiply(arm.thumb), out = p.clone.multiply(-1);
    const centre = v(head).add(contact).add(p.clone.multiply(radius));
    const round = (angle: number, along: number, r: number) =>
        centre.clone.add(out.clone.multiply(r * Math.cos(angle))).add(d.clone.multiply(r * Math.sin(angle))).add(axis.clone.multiply(along));
    // a rest pose point -> the hand bone's local offset (head on the hand's head + length * attach)
    const put = (bone: Bone, at: Vector3) => {
        const local = rotation.unrotate(at.subtract(head));
        bone.offset.set([local[0] - arm.hand.length * bone.attach, local[1], local[2]]);
    };
    for (const f of arm.fingers)
    {
        const k = f.base.clone.subtract(centre), along = k.dot(axis);
        if (f.name === "thumb")
        {
            // over the top of the bar to meet the fingers
            put(f.tip, round(Math.PI + .3, along * .25, radius));
            put(f.pole, f.base.clone.add(axis.clone.multiply(.03)).add(out.clone.multiply(.03)));
        }
        else if (f.name === "index" && trigger)
        {
            const q = Quaternion.multiplyInto(Quaternion.identity, rotation, trigger.rotation.clone.conjugate());
            put(f.tip, v(head).add(q.rotate(v(trigger.at).subtract(v(trigger.wrist)))));
            put(f.pole, f.base.clone.add(out.clone.multiply(.04)).add(d.clone.multiply(.01)));
        }
        else
        {
            const from = Math.atan2(k.dot(d), k.dot(out)), to = from + Math.min(WRAP, .85 * f.length / radius), mid = (from + to) / 2;
            put(f.tip, round(to, along, radius));
            put(f.pole, round(mid, along, radius + .06));
        }
        skin.setIK(f.ik, 1);
    }
}

/** lets go: the arm and fingers back to the clip (FK) */
export function release(skin: SkinLike, arm: BodyArm) {
    skin.setIK(arm.forearm.name, 0);
    for (const f of arm.fingers) skin.setIK(f.ik, 0);
}
