import type { Bone } from "@papit/armature";
import { MeshBuilder, upload, type GPUMesh, type Mesh } from "@papit/game-mesh";
import type { Renderer } from "@polywar/renderer";
import type { GizmoColors, GizmoOptions, RGBA, RigView } from "./gizmo-types";

// colours (linear) after Blender's bone theme
export const GIZMO_COLORS: GizmoColors = {
    bone: [.55, .55, .55, .35],
    wire: [.02, .02, .02, .9],
    joint: [.25, .25, .25, .9],
    ik: [.9, .7, .05, .5],
    chain: [.85, .8, .4, .4],
    copy: [.25, .7, .45, .45],
    target: [.95, .4, .05, .6],
    pole: [.1, .45, .95, .6],
    control: [.6, .3, .8, .5],
    parent: [.05, .05, .05, .6],
    selected: [.95, .6, .2, .7],
};

/**
 * Draws an armature the way Blender shows bones: see-through octahedra (head, 10% waist, tail), a ball on
 * each joint, a dashed line from a bone to a parent it isn't connected to. IK: the constrained bone is
 * yellow, its chain pale yellow, the target orange and the pole blue, with dashed lines tip -> target and
 * joint -> pole. Copy rotation bones are green, other non-deforming bones purple.
 *
 * Bones point along +X (papit). `matrix` places the armature space (e.g. model matrix * skeleton matrix).
 */
export class RigGizmo {
    colors: GizmoColors = structuredClone(GIZMO_COLORS);
    private body: GPUMesh;
    private outline: GPUMesh;
    private ball: GPUMesh;
    private dash: GPUMesh;
    private m = new Float32Array(16);

    constructor(readonly gl: WebGL2RenderingContext) {
        this.body = upload(gl, octahedron());
        this.outline = upload(gl, octahedronLines());
        this.ball = upload(gl, new MeshBuilder().sphere([1, 1, 1], {}, 1).build());
        this.dash = upload(gl, dashes(10));
    }

    draw(renderer: Renderer, rig: RigView, matrix: ArrayLike<number>, options: GizmoOptions = {}) {
        const gl = this.gl, c = this.colors;
        const { inFront = true, lines = true, selected, scale = 1 } = options;
        const bones = rig.armature.bones;
        const style = this.styles(rig, selected);

        if (inFront) gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);

        // bodies, then outlines and links, then joints on top
        for (const bone of bones)
        {
            if (bone.length <= 0) continue;
            renderer.draw(this.body, this.boneMatrix(matrix, bone, scale), { tint: style.get(bone)! });
        }
        if (lines)
        {
            for (const bone of bones)
            {
                if (bone.length > 0) renderer.draw(this.outline, this.boneMatrix(matrix, bone, scale), { tint: c.wire, unlit: true }, gl.LINES);
                const parent = bone.parent;
                if (parent && distance(parent.tail, bone.head) > 1e-4) this.line(renderer, matrix, parent.tail, bone.head, c.parent);
            }
            for (const ik of rig.armature.constraints)
            {
                const target = point(ik.target), pole = point(ik.pole);
                if (target) this.line(renderer, matrix, ik.bone.tail, target, c.target);
                if (pole && ik.bones.length > 1) this.line(renderer, matrix, ik.bones[1].head, pole, c.pole);
            }
        }
        for (const bone of bones)
        {
            const size = Math.max(bone.length, .02) * .06 * scale;
            const tint: RGBA = selected?.has(bone) ? c.selected : c.joint;
            renderer.draw(this.ball, this.pointMatrix(matrix, bone.head, size), { tint, unlit: true });
            if (bone.length > 0 && !bone.children.some((k: Bone) => distance(k.head, bone.tail) < 1e-4))
                renderer.draw(this.ball, this.pointMatrix(matrix, bone.tail, size * .8), { tint, unlit: true });
        }

        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
    }

    destroy() {
        for (const g of [this.body, this.outline, this.ball, this.dash]) g.destroy();
    }

    /** colour per bone: selected > IK > chain > target/pole > copy > control > bone */
    private styles(rig: RigView, selected?: Set<Bone>) {
        const c = this.colors, out = new Map<Bone, RGBA>();
        for (const bone of rig.armature.bones) out.set(bone, rig.deform && !rig.deform.has(bone) ? c.control : c.bone);
        for (const { bone } of rig.copies ?? []) out.set(bone, c.copy);
        for (const ik of rig.armature.constraints)
        {
            if (ik.target && typeof ik.target === "object" && "head" in ik.target) out.set(ik.target as Bone, c.target);
            if (ik.pole && typeof ik.pole === "object" && "head" in ik.pole) out.set(ik.pole as Bone, c.pole);
            for (const b of ik.bones) out.set(b, c.chain);
            out.set(ik.bone, c.ik);
        }
        for (const b of selected ?? []) out.set(b, c.selected);
        return out;
    }

    /** matrix * bone.worldMatrix * scale(length, length * s, length * s) */
    private boneMatrix(matrix: ArrayLike<number>, bone: Bone, s: number) {
        const L = bone.length, w = bone.worldMatrix;
        multiply(this.m, matrix, w);
        for (let i = 0; i < 4; i++) { this.m[i] *= L; this.m[4 + i] *= L * s; this.m[8 + i] *= L * s; }
        return this.m;
    }

    private pointMatrix(matrix: ArrayLike<number>, p: ArrayLike<number>, size: number) {
        multiply(this.m, matrix, [size, 0, 0, 0, 0, size, 0, 0, 0, 0, size, 0, p[0], p[1], p[2], 1]);
        return this.m;
    }

    /** dashed line a -> b (armature space) */
    private line(renderer: Renderer, matrix: ArrayLike<number>, a: ArrayLike<number>, b: ArrayLike<number>, tint: RGBA) {
        multiply(this.m, matrix, [b[0] - a[0], b[1] - a[1], (b[2] ?? 0) - (a[2] ?? 0), 0, 0, 0, 0, 0, 0, 0, 0, 0, a[0], a[1], a[2] ?? 0, 1]);
        renderer.draw(this.dash, this.m, { tint, unlit: true }, this.gl.LINES);
    }
}

const point = (p: unknown) => (p && typeof p === "object" && "head" in p ? (p as Bone).head : p) as ArrayLike<number> | null;
const distance = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0));

/** Blender's octahedral bone along +X, length 1: head, a square waist at 10% (half width .1), tail */
function octahedron(): Mesh {
    const head = [0, 0, 0], tail = [1, 0, 0];
    const ring = [[.1, .1, 0], [.1, 0, .1], [.1, -.1, 0], [.1, 0, -.1]];
    const positions: number[] = [], normals: number[] = [];
    const tri = (a: number[], b: number[], c: number[]) => {
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        positions.push(...a, ...b, ...c);
        for (let k = 0; k < 3; k++) normals.push(n[0] / l, n[1] / l, n[2] / l);
    };
    for (let i = 0; i < 4; i++)
    {
        const a = ring[i], b = ring[(i + 1) % 4];
        tri(head, b, a);
        tri(tail, a, b);
    }
    return mesh(positions, normals);
}

function octahedronLines(): Mesh {
    const head = [0, 0, 0], tail = [1, 0, 0];
    const ring = [[.1, .1, 0], [.1, 0, .1], [.1, -.1, 0], [.1, 0, -.1]];
    const p: number[] = [];
    for (let i = 0; i < 4; i++) p.push(...head, ...ring[i], ...tail, ...ring[i], ...ring[i], ...ring[(i + 1) % 4]);
    return mesh(p, new Array(p.length).fill(0));
}

/** `n` dashes along +X from 0 to 1 */
function dashes(n: number): Mesh {
    const p: number[] = [];
    for (let i = 0; i < n; i++) p.push(i / n, 0, 0, (i + .5) / n, 0, 0);
    return mesh(p, new Array(p.length).fill(0));
}

function mesh(positions: number[], normals: number[]): Mesh {
    const count = positions.length / 3;
    return {
        positions: new Float32Array(positions), normals: new Float32Array(normals),
        colors: new Float32Array(count * 4).fill(1),
        bounds: { min: { x: 0, y: -.1, z: -.1 }, max: { x: 1, y: .1, z: .1 }, radius: 1 },
    };
}

// out = a * b, column major 4x4
function multiply(out: Float32Array, a: ArrayLike<number>, b: ArrayLike<number>) {
    for (let column = 0; column < 4; column++)
        for (let row = 0; row < 4; row++)
        {
            let sum = 0;
            for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
            out[column * 4 + row] = sum;
        }
    return out;
}
