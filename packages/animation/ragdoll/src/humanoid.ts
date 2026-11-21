import { Ragdoll, type RagdollOptions, type Vec } from "./ragdoll";

/** the body's points (world) */
export const HUMAN_STICKS = [
    // torso, braced so it stays a box
    ["pelvis", "chest"], ["lShoulder", "rShoulder"], ["lShoulder", "chest"], ["rShoulder", "chest"],
    ["lShoulder", "pelvis"], ["rShoulder", "pelvis"], ["lHip", "rHip"], ["lHip", "chest"], ["rHip", "chest"],
    ["pelvis", "lHip"], ["pelvis", "rHip"], ["lShoulder", "rHip"], ["rShoulder", "lHip"],
    // head on a stiff neck
    ["head", "chest"], ["head", "lShoulder"], ["head", "rShoulder"], ["head", "pelvis"],
    // limbs
    ["lShoulder", "lElbow"], ["lElbow", "lHand"], ["rShoulder", "rElbow"], ["rElbow", "rHand"],
    ["lHip", "lKnee"], ["lKnee", "lFoot"], ["rHip", "rKnee"], ["rKnee", "rFoot"],
] as const;
export type HumanPoint = typeof HUMAN_STICKS[number][number];

const RADIUS: Record<string, number> = { head: .12, chest: .16, pelvis: .14, lShoulder: .07, rShoulder: .07, lHip: .08, rHip: .08, lElbow: .05, rElbow: .05, lHand: .04, rHand: .04, lKnee: .06, rKnee: .06, lFoot: .05, rFoot: .05 };

/** a bone point: the bone's head, or its tail */
type BonePoint = { bone: string; tail?: boolean };
/** where each point sits on the `@polywar/characters` HUMANOID rig */
export const HUMANOID_POINTS: Record<HumanPoint, BonePoint> = {
    pelvis: { bone: "hips" }, chest: { bone: "neck" }, head: { bone: "head", tail: true },
    lShoulder: { bone: "upper_arm.L" }, lElbow: { bone: "forearm.L" }, lHand: { bone: "hand.L" },
    rShoulder: { bone: "upper_arm.R" }, rElbow: { bone: "forearm.R" }, rHand: { bone: "hand.R" },
    lHip: { bone: "thigh.L" }, lKnee: { bone: "shin.L" }, lFoot: { bone: "foot.L" },
    rHip: { bone: "thigh.R" }, rKnee: { bone: "shin.R" }, rFoot: { bone: "foot.R" },
};
/** bones turned to point at a point (parents first); the torso goes as one block (the body matrix) */
const AIM: [string, HumanPoint][] = [
    ["neck", "head"],
    ["upper_arm.L", "lElbow"], ["forearm.L", "lHand"], ["upper_arm.R", "rElbow"], ["forearm.R", "rHand"],
    ["thigh.L", "lKnee"], ["shin.L", "lFoot"], ["thigh.R", "rKnee"], ["shin.R", "rFoot"],
];
/** IK that would fight the points while limp */
const IK_OFF = ["forearm.L", "forearm.R", "shin.L", "shin.R"];

type M = ArrayLike<number>;
type BoneLike = { head: ArrayLike<number>; tail: ArrayLike<number>; pointAt(p: ArrayLike<number>): void };
/** what is needed of a skin (`@polywar/skeleton` Skeleton) */
export type RagdollSkin = { armature: { find(name: string): BoneLike | null | undefined }; setIK(bone: string, weight: number): void; update(): unknown };

/**
 * A rigged body gone limp: `HumanRagdoll.from(skin, body, skeleton, ground)` starts the points where the posed
 * bones are (world = `body` x `skeleton` x armature), then `update(dt)` and each frame `pose(skin)` turns the
 * bones to the points and `body` (read after) is the draw matrix (torso as one block). About 80 kg of heavy.
 */
export class HumanRagdoll {
    readonly doll: Ragdoll<HumanPoint>;
    /** the body's draw matrix now (column major) */
    readonly body = new Float64Array(16);
    private torso0: Float64Array;
    private body0: Float64Array;
    private skeleton: Float64Array;

    private constructor(start: Record<HumanPoint, Vec>, body: M, skeleton: M, ground: (x: number, z: number) => number, options: RagdollOptions) {
        this.doll = new Ragdoll(start, HUMAN_STICKS, ground, { radius: RADIUS, ...options });
        this.body0 = Float64Array.from(body);
        this.skeleton = Float64Array.from(skeleton);
        this.torso0 = this.torso(new Float64Array(16));
        this.body.set(this.body0);
    }

    /** from the skin as posed now (call after its pose / update) */
    static from(skin: RagdollSkin, body: M, skeleton: M, ground: (x: number, z: number) => number, options: RagdollOptions = {}) {
        const world = mul(body, skeleton);
        const start = {} as Record<HumanPoint, Vec>;
        for (const name of Object.keys(HUMANOID_POINTS) as HumanPoint[])
        {
            const { bone, tail } = HUMANOID_POINTS[name], b = skin.armature.find(bone);
            start[name] = b ? apply(world, tail ? b.tail : b.head) : apply(world, [0, 0, 0]);
        }
        return new HumanRagdoll(start, body, skeleton, ground, options);
    }

    update(dt: number) { this.doll.update(dt); }
    get resting() { return this.doll.resting; }
    /** the head point (eye goes here) */
    get head() { return this.doll.at("head"); }

    /** turns the skin's bones to the points (the skin holds its base pose: call after posing it) and updates it */
    pose(skin: RagdollSkin) {
        // torso: the rest torso frame -> now, as one rigid move of the whole body
        const now = this.torso(new Float64Array(16));
        this.body.set(mul(mul(now, invert(this.torso0)), this.body0));
        const toSkin = invert(mul(this.body, this.skeleton));
        for (const ik of IK_OFF) skin.setIK(ik, 0);
        skin.update();
        for (const [bone, point] of AIM) skin.armature.find(bone)?.pointAt(apply(toSkin, this.doll.at(point)));
        skin.update();
    }

    /** the torso frame from the points: at the pelvis, y up the spine, x to the left side */
    private torso(out: Float64Array) {
        const d = this.doll, p = d.at("pelvis"), c = d.at("chest");
        const l = d.centre(["lShoulder", "lHip"]), r = d.centre(["rShoulder", "rHip"]);
        return frame(out, p, [l[0] - r[0], l[1] - r[1], l[2] - r[2]], [c[0] - p[0], c[1] - p[1], c[2] - p[2]]);
    }
}

/** a frame at `at`, y along `up`, x as near `x` as it can (column major) */
function frame(out: Float64Array, at: Vec, x: Vec, up: Vec) {
    let l = Math.hypot(...up) || 1;
    const yx = up[0] / l, yy = up[1] / l, yz = up[2] / l;
    const d = x[0] * yx + x[1] * yy + x[2] * yz;
    let ax = x[0] - yx * d, ay = x[1] - yy * d, az = x[2] - yz * d;
    l = Math.hypot(ax, ay, az);
    if (l < 1e-6) { ax = 1; ay = 0; az = 0; l = 1; }
    ax /= l; ay /= l; az /= l;
    const zx = ay * yz - az * yy, zy = az * yx - ax * yz, zz = ax * yy - ay * yx;
    out.set([ax, ay, az, 0, yx, yy, yz, 0, zx, zy, zz, 0, at[0], at[1], at[2], 1]);
    return out;
}

function apply(m: M, p: ArrayLike<number>): Vec {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

function mul(a: M, b: M) {
    const o = new Float64Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
}

/** affine inverse (rotation + scale + translation) */
function invert(m: M) {
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1e-12;
    const o = new Float64Array(16);
    o[0] = A / det; o[4] = -(b * i - c * h) / det; o[8] = (b * f - c * e) / det;
    o[1] = B / det; o[5] = (a * i - c * g) / det; o[9] = -(a * f - c * d) / det;
    o[2] = C / det; o[6] = -(a * h - b * g) / det; o[10] = (a * e - b * d) / det;
    const tx = m[12], ty = m[13], tz = m[14];
    o[12] = -(o[0] * tx + o[4] * ty + o[8] * tz);
    o[13] = -(o[1] * tx + o[5] * ty + o[9] * tz);
    o[14] = -(o[2] * tx + o[6] * ty + o[10] * tz);
    o[15] = 1;
    return o;
}
