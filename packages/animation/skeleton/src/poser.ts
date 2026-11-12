import type { Bone } from "@papit/armature";
import type { Skeleton } from "./skeleton";

type V3 = ArrayLike<number>;
/** a world ray in armature space; `normal` is the camera's forward */
export type PoseRay = { origin: V3; direction: V3; normal: V3 };
/** a handle of the selected bone (armature space): move arrow along a global axis, or rotation ring around a local one */
export type PoseHandle = { kind: "move" | "turn"; axis: 0 | 1 | 2; origin: number[]; direction: number[]; size: number };
type Project = (p: V3) => ArrayLike<number> | null;

/** what a press and drag does: only select, move (arrows), rotate (rings) */
export type PoseTool = "select" | "move" | "rotate";

/**
 * Pose a `Skeleton` by hand, like Blender's pose mode. Press a bone to select it, then by `tool`:
 * - move: drag moves it on the view plane, arrows along global X / Y / Z.
 *   Moving an IK target or pole turns its IK on (rig.json may rest it at 0, e.g. arms).
 * - rotate: drag turns it around the view axis, rings around its own X (twist) / Y / Z.
 * - select: picks only, drags are left to the camera.
 * Any bone can do both (bones an IK solves follow the IK while it is on).
 * Edits stay on top of any clip: `apply()` after each `pose()`. Points are armature space.
 */
export class Poser {
    /** local pose per edited bone */
    readonly edits = new Map<Bone, { offset: number[]; rotation: number[] }>();
    selected?: Bone;
    tool: PoseTool = "move";
    /** handle size, armature units (e.g. 15% of the model) */
    size = .2;
    /** handle being dragged */
    active?: PoseHandle;
    /** IKs turned on by moving their target, back off on `clear()` */
    private enabled = new Map<string, number>();
    private grab?: { mode: "move" | "turn"; axis?: number[]; along?: boolean; head: number[]; start: number[]; world: number[]; s0?: number };

    constructor(readonly skeleton: Skeleton) { }

    /** controls: IK targets, poles and roots (picked over the bone they sit on) */
    movable(bone: Bone) {
        return !bone.parent || !!this.ikOf(bone);
    }

    private ikOf(bone: Bone) {
        for (const [name, ik] of this.skeleton.ik) if (ik.target === bone || ik.pole === bone) return name;
        return undefined;
    }

    /** handles of the selected bone */
    handles(): PoseHandle[] {
        const bone = this.selected;
        if (!bone) return [];
        const head = [...bone.head], out: PoseHandle[] = [];
        if (this.tool === "move") for (const axis of [0, 1, 2] as const) out.push({ kind: "move", axis, origin: head, direction: unitAxis(axis), size: this.size * 1.4 });
        if (this.tool === "rotate") for (const axis of [0, 1, 2] as const) out.push({ kind: "turn", axis, origin: head, direction: bone.worldRotation.rotate(unitAxis(axis)), size: this.size });
        return out;
    }

    /**
     * Pointer down at screen (x, y): grabs a handle of the selected bone, else selects the nearest bone.
     * True when something was grabbed (the camera should stay still).
     */
    press(x: number, y: number, project: Project, ray: PoseRay, within = 10) {
        let handle: PoseHandle | undefined, best = within;
        for (const h of this.handles())
        {
            const d = h.kind === "move" ? segment(x, y, project(h.origin), project(add(h.origin, h.direction, h.size))) : ringDistance(x, y, h, project);
            if (d < best) { best = d; handle = h; }
        }
        if (!handle)
        {
            let bone: Bone | undefined;
            best = within;
            for (const b of this.skeleton.armature.bones)
            {
                const a = project(b.head);
                // controls sit on top of their bone (hand.ik on hand): prefer them
                const d = segment(x, y, a, b.length > 0 ? project(b.tail) : a) - (this.movable(b) ? 3 : 0);
                if (d < best) { best = d; bone = b; }
            }
            this.selected = bone;
            if (!bone || this.tool === "select") return false;
        }
        const bone = this.selected!;
        this.active = handle;
        if (this.tool === "move")
        {
            const ik = this.ikOf(bone);
            const weight = ik ? this.skeleton.rig?.ik.find(c => c.bone === ik)?.weight ?? 1 : 1;
            if (ik && weight <= 0 && !this.enabled.has(ik)) { this.enabled.set(ik, weight); this.skeleton.setIK(ik, 1); this.skeleton.update(); }
        }
        const head = [...bone.head], world = [...bone.worldRotation];
        if (handle?.kind === "move")
        {
            this.grab = { mode: "move", axis: handle.direction, head, start: head, world, s0: along(head, handle.direction, ray) };
        }
        else
        {
            const axis = handle ? handle.direction : neg(ray.normal);
            const start = turnPoint(head, axis, ray);
            if (!start) return true;
            this.grab = { mode: this.tool === "move" ? "move" : "turn", axis, head, start, world };
        }
        return true;
    }

    /** pointer moved while grabbed */
    drag(ray: PoseRay) {
        const bone = this.selected, g = this.grab;
        if (!bone || !g) return;
        if (g.mode === "move")
        {
            let hit: number[] | undefined;
            if (g.s0 !== undefined) { const s = along(g.head, g.axis!, ray); if (s !== undefined) hit = add(g.head, g.axis!, s - g.s0); }
            else hit = plane(g.head, ray.normal, ray);
            if (!hit) return;
            const parent = bone.parent;
            // attach 0: head = parent.head + parent world rotation * offset
            bone.offset.set(parent ? parent.worldRotation.unrotate([hit[0] - parent.head[0], hit[1] - parent.head[1], hit[2] - parent.head[2]]) : hit);
        }
        else
        {
            const now = turnPoint(g.head, g.axis!, ray);
            if (!now) return;
            const a = flat(sub(g.start, g.head), g.axis!), b = flat(sub(now, g.head), g.axis!);
            const angle = Math.atan2(dot(cross(a, b), g.axis!), dot(a, b));
            let q = qmul(axisAngle(g.axis!, angle), g.world);
            if (bone.parent) q = qmul(conj([...bone.parent.worldRotation]), q);
            bone.rotation.set(q);
        }
        this.edits.set(bone, { offset: [...bone.offset], rotation: [...bone.rotation] });
        this.skeleton.update();
    }

    /** let go (the edit stays) */
    release() { this.grab = undefined; this.active = undefined; }

    /** writes the edits over the current pose and updates; call after `pose()` / `sample()` */
    apply() {
        if (!this.edits.size) return;
        for (const [bone, e] of this.edits) { bone.offset.set(e.offset); bone.rotation.set(e.rotation); }
        this.skeleton.update();
    }

    /** drop every edit and IK it turned on */
    clear() {
        this.edits.clear();
        for (const [ik, w] of this.enabled) this.skeleton.setIK(ik, w);
        this.enabled.clear();
        this.selected = undefined;
        this.release();
    }
}

const unitAxis = (axis: number) => [0, 1, 2].map(i => i === axis ? 1 : 0);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, d: V3, s: number) => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s];
const neg = (a: V3) => [-a[0], -a[1], -a[2]];
const cross = (a: V3, b: V3) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** a without its part along unit n */
const flat = (a: V3, n: V3) => add(a, n, -dot(a, n));

/** ray hits the plane through p with normal n */
function plane(p: V3, n: V3, ray: PoseRay) {
    const denom = dot(ray.direction, n);
    if (Math.abs(denom) < 1e-9) return undefined;
    const t = (dot(p, n) - dot(ray.origin, n)) / denom;
    return t > 0 ? add(ray.origin, ray.direction, t) : undefined;
}

/** where the ray meets a ring's plane, or the view plane when the ring is edge on */
function turnPoint(head: V3, axis: V3, ray: PoseRay) {
    const facing = Math.abs(dot(ray.direction, axis)) / Math.hypot(...Array.from(ray.direction));
    return plane(head, facing > .2 ? axis : ray.normal, ray);
}

/** parameter s of the point on line head + s * axis closest to the ray */
function along(head: V3, axis: V3, ray: PoseRay) {
    const w = sub(head, ray.origin), b = dot(axis, ray.direction), c = dot(ray.direction, ray.direction), a = dot(axis, axis);
    const den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return undefined;
    return (b * dot(ray.direction, w) - c * dot(axis, w)) / den;
}

function axisAngle(axis: V3, angle: number) {
    const s = Math.sin(angle / 2), l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    return [axis[0] / l * s, axis[1] / l * s, axis[2] / l * s, Math.cos(angle / 2)];
}

function qmul(a: V3, b: V3) {
    return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
}

const conj = (q: number[]) => [-q[0], -q[1], -q[2], q[3]];

/** two unit vectors square to `n` */
export function ringBasis(n: V3) {
    const u = Math.abs(n[0]) < .9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]);
    const l = Math.hypot(u[0], u[1], u[2]);
    const uu = [u[0] / l, u[1] / l, u[2] / l];
    return [uu, cross(n, uu)];
}

function ringDistance(x: number, y: number, h: PoseHandle, project: Project) {
    const [u, v] = ringBasis(h.direction);
    let best = Infinity, prev: ArrayLike<number> | null = null;
    for (let i = 0; i <= 48; i++)
    {
        const a = i / 48 * Math.PI * 2;
        const p = project(add(add(h.origin, u, Math.cos(a) * h.size), v, Math.sin(a) * h.size));
        if (prev && p) best = Math.min(best, segment(x, y, prev, p));
        prev = p;
    }
    return best;
}

/** px distance from (x, y) to the segment a-b */
function segment(x: number, y: number, a: ArrayLike<number> | null, b: ArrayLike<number> | null) {
    if (!a || !b) return Infinity;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l > 0 ? Math.min(Math.max(((x - a[0]) * dx + (y - a[1]) * dy) / l, 0), 1) : 0;
    return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}
