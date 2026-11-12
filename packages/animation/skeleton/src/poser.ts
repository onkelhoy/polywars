import type { Bone } from "@papit/armature";
import type { Skeleton } from "./skeleton";

type V3 = ArrayLike<number>;

/**
 * Pose a `Skeleton` by hand: pick a bone on screen, drag it. IK targets, poles and root bones move,
 * the others turn (FK, tail follows). Edits stay on top of any clip: `apply()` after each `pose()`.
 * All points are armature space (`Skeleton` bones' space).
 */
export class Poser {
    /** local pose per edited bone */
    readonly edits = new Map<Bone, { offset: number[]; rotation: number[] }>();
    selected?: Bone;
    private plane?: { point: number[]; mode: "move" | "turn" };

    constructor(readonly skeleton: Skeleton) { }

    /** bones that move instead of turn: IK targets, poles and roots */
    movable(bone: Bone) {
        if (!bone.parent) return true;
        for (const ik of this.skeleton.ik.values()) if (ik.target === bone || ik.pole === bone) return true;
        return false;
    }

    /** nearest bone (segment, or head when it has no length) within `within` px; `project` maps an armature point to screen px */
    pick(x: number, y: number, project: (p: V3) => ArrayLike<number> | null, within = 12) {
        let best: Bone | undefined, bestD = within;
        for (const bone of this.skeleton.armature.bones)
        {
            const a = project(bone.head), b = bone.length > 0 ? project(bone.tail) : a;
            if (!a || !b) continue;
            const d = segment(x, y, a, b);
            if (d < bestD) { bestD = d; best = bone; }
        }
        this.selected = best;
        if (best) this.plane = this.movable(best) ? { point: [...best.head], mode: "move" } : { point: [...best.tail], mode: "turn" };
        return best;
    }

    /** drag the selected bone to where a ray meets the plane through it facing `normal` (the camera's forward) */
    drag(origin: V3, direction: V3, normal: V3) {
        const bone = this.selected, plane = this.plane;
        if (!bone || !plane) return;
        const denom = dot(direction, normal);
        if (Math.abs(denom) < 1e-9) return;
        const t = (dot(plane.point, normal) - dot(origin, normal)) / denom;
        if (t <= 0) return;
        const hit = [0, 1, 2].map(i => origin[i] + direction[i] * t);
        if (plane.mode === "move")
        {
            const parent = bone.parent;
            if (parent)
            {
                // attach 0: head = parent.head + parent world rotation * offset
                const v = parent.worldRotation.unrotate([hit[0] - parent.head[0], hit[1] - parent.head[1], hit[2] - parent.head[2]]);
                bone.offset.set(v);
            }
            else bone.offset.set(hit);
        }
        else bone.pointAt(hit);
        this.edits.set(bone, { offset: [...bone.offset], rotation: [...bone.rotation] });
        this.skeleton.update();
    }

    /** let go (the edit stays) */
    release() { this.plane = undefined; }

    /** writes the edits over the current pose and updates; call after `pose()` / `sample()` */
    apply() {
        if (!this.edits.size) return;
        for (const [bone, e] of this.edits) { bone.offset.set(e.offset); bone.rotation.set(e.rotation); }
        this.skeleton.update();
    }

    /** drop every edit (or one bone's) */
    clear(bone?: Bone) {
        if (bone) this.edits.delete(bone);
        else this.edits.clear();
    }
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** px distance from (x, y) to the segment a-b */
function segment(x: number, y: number, a: ArrayLike<number>, b: ArrayLike<number>) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l > 0 ? Math.min(Math.max(((x - a[0]) * dx + (y - a[1]) * dy) / l, 0), 1) : 0;
    return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}
