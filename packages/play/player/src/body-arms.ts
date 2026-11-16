import type { Vec3 } from "@polywar/viewmodel";

type Bone = { name: string; head: ArrayLike<number>; children: Bone[] };
/** the bits of `@polywar/skeleton` used here */
export type SkinLike = { bones: Bone[]; matrices: Float32Array; armature: { find(name: string): Bone | null | undefined } };

const sub = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** column major 4x4 helpers */
function mul(a: ArrayLike<number>, b: ArrayLike<number>, out: Float32Array<ArrayBufferLike> = new Float32Array(16)) {
    const r = new Float32Array(16);
    for (let c = 0; c < 4; c++)
        for (let row = 0; row < 4; row++)
            r[c * 4 + row] = a[row] * b[c * 4] + a[4 + row] * b[c * 4 + 1] + a[8 + row] * b[c * 4 + 2] + a[12 + row] * b[c * 4 + 3];
    out.set(r);
    return out;
}
const apply = (m: ArrayLike<number>, p: Vec3): Vec3 => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/** rotation (unit quaternion x y z w) to a matrix turning round `at` */
function turnAt(q: number[], at: Vec3) {
    const [x, y, z, w] = q;
    const m = new Float32Array([
        1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
        2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
        2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
        0, 0, 0, 1]);
    const r = apply(m, at);
    m[12] = at[0] - r[0]; m[13] = at[1] - r[1]; m[14] = at[2] - r[2];
    return m;
}
/** shortest turn from `a` to `b` (unit) */
function arc(a: Vec3, b: Vec3): number[] {
    const d = dot(a, b);
    if (d < -.9999) { const ax = norm(Math.abs(a[0]) < .9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0])); return [...ax, 0]; }
    const c = cross(a, b), w = 1 + d, l = Math.hypot(c[0], c[1], c[2], w);
    return [c[0] / l, c[1] / l, c[2] / l, w / l];
}
/** turn of `angle` round `axis` (unit) */
const about = (axis: Vec3, angle: number) => { const s = Math.sin(angle / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)]; };

/** a joint's posed head (the space the joint matrices put the mesh in) */
const headNow = (_: SkinLike, bone: Bone): Vec3 => [bone.head[0], bone.head[1], bone.head[2]];

/** a bone and everything under it */
const below = (b: Bone): Bone[] => [b, ...b.children.flatMap(below)];

/**
 * Bends a body's arm (`upper`, `forearm`, `hand` bone names) so the hand's head reaches `target`, the elbow toward
 * `pole` (a direction), all in the skin's space, on top of the posed joint matrices. `turn`: the hand's own tilt and
 * twist (radians) round the forearm's end.
 */
export function reach(skin: SkinLike, names: [string, string, string], target: Vec3, pole: Vec3, turn: [number, number] = [0, 0]) {
    const [u, f, h] = names.map(n => skin.armature.find(n));
    if (!u || !f || !h) return;
    const S = headNow(skin, u), E0 = headNow(skin, f), H0 = headNow(skin, h);
    const l1 = len(sub(E0, S)), l2 = len(sub(H0, E0));
    const d = sub(target, S), reachLen = Math.min(len(d), l1 + l2 - 1e-4), dir = norm(d);
    const a = (l1 * l1 - l2 * l2 + reachLen * reachLen) / (2 * reachLen), out = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const side = norm(sub(pole, dir.map(v => v * dot(pole, dir)) as Vec3));
    const E: Vec3 = [S[0] + dir[0] * a + side[0] * out, S[1] + dir[1] * a + side[1] * out, S[2] + dir[2] * a + side[2] * out];
    const T: Vec3 = [S[0] + dir[0] * reachLen, S[1] + dir[1] * reachLen, S[2] + dir[2] * reachLen];

    const d1 = turnAt(arc(norm(sub(E0, S)), norm(sub(E, S))), S);
    const fore = norm(sub(apply(d1, H0), apply(d1, E0)));
    const move1 = apply(d1, E0);
    const d2 = mul(turnAt(arc(fore, norm(sub(T, E))), E), new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, E[0] - move1[0], E[1] - move1[1], E[2] - move1[2], 1]));
    const lower = mul(d2, d1);
    // the hand: tilt round the side axis, twist round the forearm, at the wrist
    const fd = norm(sub(T, E)), tiltAxis = norm(cross(fd, side));
    const hand = mul(mul(turnAt(about(fd, turn[1]), T), turnAt(about(tiltAxis, turn[0]), T)), lower);

    const set = (bone: Bone, m: Float32Array) => { const j = skin.bones.indexOf(bone); if (j >= 0) mul(m, skin.matrices.subarray(j * 16, j * 16 + 16), skin.matrices.subarray(j * 16, j * 16 + 16)); };
    set(u, d1);
    set(f, lower);
    for (const b of below(h)) set(b, hand);
}
