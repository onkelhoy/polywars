import { Armature, Bone, IK } from "@papit/armature";
import { sampleChannel, type GLTF, type GLTFAnimation } from "@papit/game-mesh";
import { Quaternion } from "@papit/quaternion";
import type { RigJSON } from "./types";

// glTF bones point along +Y, @papit/armature bones along +X. C turns X onto Y (90° about Z).
const S = Math.SQRT1_2;
const C = [0, 0, S, S];
const CI = [0, 0, -S, S];
// rotation of C⁻¹ as a column major 4x4
const CI_MATRIX = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const value = new Float32Array(4);
const q = new Float64Array(4);
const tmp = new Float64Array(4);

/**
 * A glTF skin as an `@papit/armature` rig that IK can work on: bones point along +X with real lengths
 * (from `rig.json`, else the distance to the first child). IK and copy rotation come from `rig.json`.
 * Clips are sampled in glTF terms and converted, joint matrices come out ready for the skin shader.
 *
 * `pose(clip, time)` = rest + clip + `update()`. For more: `reset()`, `sample()`, `mix()`, change things, `update()`.
 */
export class Skeleton {
    readonly armature = new Armature();
    /** bone per skin joint, `JOINTS_0` order */
    readonly bones: Bone[];
    /** bone per glTF node index */
    readonly nodes = new Map<number, Bone>();
    readonly matrices: Float32Array;
    /** bones that move the mesh (all, without a rig.json) */
    readonly deform = new Set<Bone>();
    /** IK constraints by the bone they sit on */
    readonly ik = new Map<string, IK>();
    readonly copies: { bone: Bone; target: Bone; weight: number }[] = [];
    /** rest weight per IK, `ikEnabled = false` sets them all to 0 */
    private weights = new Map<IK, number>();
    private roots = new Set<Bone>();
    private rest: { offset: number[]; rotation: number[] }[] = [];
    private bind: Float32Array;
    /** per IK with a pole: rest bend plane normal, rest direction + world rotation per chain bone */
    private planes = new Map<IK, { normal: number[]; bones: { dir: number[] | undefined; world: number[] }[] }>();

    /** Loads `<url without .glb>.rig.json`, undefined when there is none. */
    static async rigFor(url: string): Promise<RigJSON | undefined> {
        const res = await fetch(url.replace(/\.(glb|gltf)$/i, "") + ".rig.json").catch(() => undefined);
        if (!res?.ok) return undefined;
        return res.json().catch(() => undefined);
    }

    /** For `Model.load(gl, url, { skin: Skeleton.skin })`: a Skeleton with the rig.json next to `url`, if any. */
    static skin = async (gltf: GLTF, url?: string) => new Skeleton(gltf, url ? await Skeleton.rigFor(url) : undefined);

    constructor(readonly gltf: GLTF, readonly rig?: RigJSON, skin = 0) {
        const source = gltf.skins[skin];
        if (!source) throw new Error(`skeleton: no skin ${skin}`);
        const parentOf = new Map<number, number>();
        gltf.nodes.forEach((node, i) => node.children.forEach(child => parentOf.set(child, i)));
        const isJoint = new Set(source.joints);

        const make = (index: number): Bone => {
            const existing = this.nodes.get(index);
            if (existing) return existing;
            const node = gltf.nodes[index];
            const p = parentOf.get(index);
            const parent = p !== undefined && isJoint.has(p) ? make(p) : undefined;
            const name = node.name && !this.armature.find(node.name) ? node.name : `joint ${index}`;
            const t = node.translation, r = node.rotation;
            const bone = this.armature.add(name, { parent, attach: 0, offset: parent ? [t[1], -t[0], t[2]] : [t[0], t[1], t[2]] });
            toPapit(r, !parent, bone.rotation);
            if (!parent) this.roots.add(bone);
            // length: rig.json, else the first child sitting straight along +Y
            const child = node.children.map(c => gltf.nodes[c]).find(c => isJoint.has(gltf.nodes.indexOf(c)) && Math.abs(c.translation[0]) + Math.abs(c.translation[2]) < 1e-4 * Math.abs(c.translation[1]));
            bone.length = rig?.bones[name]?.length ?? (child ? Math.abs(child.translation[1]) : 0);
            if (rig?.bones[name]?.deform ?? true) this.deform.add(bone);
            this.nodes.set(index, bone);
            return bone;
        };
        this.bones = source.joints.map(make);
        this.rest = this.armature.bones.map(b => ({ offset: [...b.offset], rotation: [...b.rotation] }));

        for (const c of rig?.ik ?? [])
        {
            const bone = this.armature.find(c.bone), target = this.armature.find(c.target);
            if (!bone || !target) continue;
            const pole = c.pole ? this.armature.find(c.pole) ?? undefined : undefined;
            const ik = this.armature.ik(bone, { chain: c.chain, target, pole, weight: c.weight });
            this.ik.set(c.bone, ik);
            this.weights.set(ik, c.weight);
        }
        this.armature.update();
        for (const ik of this.ik.values())
        {
            const normal = planeNormal(ik);
            if (normal) this.planes.set(ik, { normal, bones: ik.bones.map(b => ({ dir: direction(b), world: [...b.worldRotation] })) });
        }
        for (const c of rig?.copyRotation ?? [])
        {
            const bone = this.armature.find(c.bone), target = this.armature.find(c.target);
            if (bone && target) this.copies.push({ bone, target, weight: c.weight });
        }

        // joint = worldMatrix (papit, +X) * C⁻¹ * inverseBind
        this.matrices = new Float32Array(this.bones.length * 16);
        this.bind = new Float32Array(this.bones.length * 16);
        for (let j = 0; j < this.bones.length; j++)
            multiply(this.bind, j * 16, CI_MATRIX, 0, source.inverseBindMatrices ?? IDENTITY, source.inverseBindMatrices ? j * 16 : 0);
        this.update();
    }

    /** IK and copy rotation on (rest weights) or off (pure FK, what the clip says) */
    set ikEnabled(on: boolean) {
        for (const [ik, w] of this.weights) ik.weight = on ? w : 0;
        this._ik = on;
    }
    get ikEnabled() { return this._ik; }
    private _ik = true;

    /** Weight of one IK (by the bone it sits on) and its copy rotation, e.g. arms on for a weapon. */
    setIK(bone: string, weight: number) {
        const ik = this.ik.get(bone);
        if (!ik) return;
        this.weights.set(ik, weight);
        if (this._ik) ik.weight = weight;
        const end = ik.bone.children.find(c => this.copies.some(k => k.bone === c));
        for (const k of this.copies) if (k.bone === end) k.weight = weight;
    }

    /** Back to the bind pose (no update). */
    reset() {
        this.armature.bones.forEach((b, i) => { b.offset.set(this.rest[i].offset); b.rotation.set(this.rest[i].rotation); });
    }

    /** Writes a clip at `time` into the bones (no update). `loop` wraps, otherwise clamps. */
    sample(animation: GLTFAnimation, time: number, loop = true) {
        this.mix(animation, time, 1, loop);
    }

    /** Blends a clip at `time` over the current pose by `weight` (0..1, no update). */
    mix(animation: GLTFAnimation, time: number, weight: number, loop = true) {
        const d = animation.duration;
        if (d > 0) time = loop ? ((time % d) + d) % d : Math.min(Math.max(time, 0), d);
        for (const channel of animation.channels)
        {
            if (channel.path === "scale") continue;
            const bone = this.nodes.get(channel.node);
            if (!bone) continue;
            const root = this.roots.has(bone);
            if (channel.path === "rotation")
            {
                sampleChannel(channel, time, 4, value);
                toPapit(value, root, q);
                if (weight >= 1) bone.rotation.set(q);
                else nlerp(bone.rotation, q, weight);
            }
            else
            {
                sampleChannel(channel, time, 3, value);
                const x = root ? value[0] : value[1], y = root ? value[1] : -value[0], z = value[2];
                const o = bone.offset;
                o[0] += (x - o[0]) * weight; o[1] += (y - o[1]) * weight; o[2] += (z - o[2]) * weight;
            }
        }
    }

    /** FK, IK (+ twist like Blender), copy rotation, then the joint matrices. */
    update() {
        this.armature.update();
        for (const [ik, plane] of this.planes) if (ik.weight > 0) this.twist(ik, plane);
        for (const { bone, target, weight } of this.copies)
        {
            const w = this._ik ? weight : 0;
            if (w <= 0 || !bone.parent) continue;
            tmp.set(bone.parent.worldRotation);
            conjugate(tmp);
            Quaternion.multiplyInto(q, tmp, target.worldRotation);
            if (w >= 1) bone.solved.set(q);
            else nlerp(bone.solved, q, w);
            bone.refresh();
        }
        for (let j = 0; j < this.bones.length; j++)
            multiply(this.matrices, j * 16, this.bones[j].worldMatrix, 0, this.bind, j * 16);
        return this.matrices;
    }

    /**
     * papit IK turns bones the shortest way, so their twist drifts and a knee's hinge axis leaves the bend
     * plane. Blender keeps each chain bone's relation to the plane (root, target, pole): do the same.
     */
    private twist(ik: IK, plane: { normal: number[]; bones: { dir: number[] | undefined; world: number[] }[] }) {
        const normal = planeNormal(ik);
        if (!normal) return;
        ik.bones.forEach((bone, i) => {
            const dir = direction(bone);
            if (!dir) return;
            const rest = plane.bones[i];
            if (!rest.dir) return;
            // Q = frame(now) * frame(rest)^T, world = Q * rest world
            fromMatrix(multiply3(frame(dir, normal), transpose3(frame(rest.dir, plane.normal))), q);
            Quaternion.multiplyInto(q, q, rest.world);
            if (bone.parent)
            {
                tmp.set(bone.parent.worldRotation);
                conjugate(tmp);
                Quaternion.multiplyInto(q, tmp, q);
            }
            if (ik.weight >= 1) bone.solved.set(q);
            else nlerp(bone.solved, q, ik.weight);
            bone.place();
        });
        ik.bones[0].refresh();
    }

    /** rest + clip at `time` + update; no clip = rest pose */
    pose(animation: GLTFAnimation | undefined, time: number, loop = true) {
        this.reset();
        if (animation) this.sample(animation, time, loop);
        this.update();
    }
}

/** glTF local rotation to papit: C⁻¹ r C (root: r C) */
function toPapit(r: ArrayLike<number>, root: boolean, out: Float32Array | Float64Array) {
    Quaternion.multiplyInto(tmp, r, C);
    if (root) out.set(tmp);
    else Quaternion.multiplyInto(out, CI, tmp);
    return out;
}

type V3 = number[];
const sub = (a: ArrayLike<number>, b: ArrayLike<number>): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 | undefined => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : undefined; };
const pointOf = (p: unknown) => (p instanceof Bone ? p.head : p) as ArrayLike<number> | null;

/** normal of the plane through the chain root, the target and the pole */
function planeNormal(ik: IK) {
    const target = pointOf(ik.target), pole = pointOf(ik.pole);
    if (!target || !pole) return undefined;
    const root = ik.bones[0].head;
    return unit(cross(sub(target, root), sub(pole, root)));
}

/** world direction of a bone (+X), undefined for a zero length bone */
function direction(bone: Bone) {
    return unit(sub(bone.tail, bone.head));
}

/** orthonormal basis as columns (x = dir, z = normal made square to it), row major 3x3 */
function frame(dir: V3, normal: V3) {
    const z = unit(sub(normal, dir.map(v => v * dot(dir, normal)))) ?? [0, 0, 1];
    const y = cross(z, dir);
    return [dir[0], y[0], z[0], dir[1], y[1], z[1], dir[2], y[2], z[2]];
}

function transpose3(m: number[]) {
    return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function multiply3(a: number[], b: number[]) {
    const out = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
    return out;
}

/** row major rotation matrix to quaternion [x, y, z, w] */
function fromMatrix(m: number[], out: Float64Array) {
    const trace = m[0] + m[4] + m[8];
    if (trace > 0)
    {
        const s = Math.sqrt(trace + 1) * 2;
        out[3] = s / 4; out[0] = (m[7] - m[5]) / s; out[1] = (m[2] - m[6]) / s; out[2] = (m[3] - m[1]) / s;
    }
    else if (m[0] > m[4] && m[0] > m[8])
    {
        const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
        out[3] = (m[7] - m[5]) / s; out[0] = s / 4; out[1] = (m[1] + m[3]) / s; out[2] = (m[2] + m[6]) / s;
    }
    else if (m[4] > m[8])
    {
        const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
        out[3] = (m[2] - m[6]) / s; out[0] = (m[1] + m[3]) / s; out[1] = s / 4; out[2] = (m[5] + m[7]) / s;
    }
    else
    {
        const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
        out[3] = (m[3] - m[1]) / s; out[0] = (m[2] + m[6]) / s; out[1] = (m[5] + m[7]) / s; out[2] = s / 4;
    }
    return out;
}

function conjugate(a: Float64Array) {
    a[0] = -a[0]; a[1] = -a[1]; a[2] = -a[2];
}

/** a = normalize(a + (b - a) * t), along the short way */
function nlerp(a: Float32Array | Float64Array, b: ArrayLike<number>, t: number) {
    const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
    let len = 0;
    for (let i = 0; i < 4; i++) { a[i] += (b[i] * s - a[i]) * t; len += a[i] * a[i]; }
    len = Math.sqrt(len) || 1;
    for (let i = 0; i < 4; i++) a[i] /= len;
}

// out[o..] = a[ao..] * b[bo..], column major 4x4
function multiply(out: Float32Array, o: number, a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number) {
    for (let column = 0; column < 4; column++)
        for (let row = 0; row < 4; row++)
        {
            let sum = 0;
            for (let k = 0; k < 4; k++) sum += a[ao + k * 4 + row] * b[bo + column * 4 + k];
            out[o + column * 4 + row] = sum;
        }
}
