import { loadGLTF, rig as makeRig, sample, upload, type GLTF, type GLTFAnimation, type GPUMesh, type Mesh, type Rig } from "@papit/game-mesh";
import { fromTRS, mat4, multiply, transformPoint, type Mat4 } from "./math";
import type { DrawOptions, Renderer } from "./renderer";

export type Box = { min: [number, number, number]; max: [number, number, number] };

/**
 * A glTF on the GPU: every mesh node, its hierarchy, an optional skin (skin 0) and its animations.
 * `pose(name, time)` plays an animation on the rig; `draw(renderer, matrix)` places the whole model.
 */
export class Model {
    readonly rig?: Rig;
    readonly animations: GLTFAnimation[];
    readonly bounds: Box;
    private gpu: GPUMesh[][];
    private items: { node: number; skinned: boolean; world: Mat4 }[] = [];
    private rest: { offset: number[]; rotation: number[] }[] = [];
    private scratch = mat4();

    static async load(gl: WebGL2RenderingContext, url: string) {
        return new Model(gl, await loadGLTF(url));
    }

    constructor(gl: WebGL2RenderingContext, readonly gltf: GLTF) {
        this.gpu = gltf.meshes.map(m => m.primitives.map(p => upload(gl, p)));
        this.animations = gltf.animations;
        if (gltf.skins.length)
        {
            this.rig = makeRig(gltf, 0);
            this.rest = this.rig.bones.map(b => ({ offset: [...b.offset], rotation: [...b.rotation] }));
            this.rig.update();
        }

        const visit = (index: number, parent: Mat4) => {
            const node = gltf.nodes[index];
            const local = node.matrix ? new Float32Array(node.matrix) : fromTRS(mat4(), node.translation, node.rotation, node.scale);
            const world = multiply(mat4(), parent, local);
            if (node.mesh !== undefined) this.items.push({ node: index, skinned: node.skin !== undefined && !!this.rig, world });
            node.children.forEach(child => visit(child, world));
        };
        gltf.roots.forEach(root => visit(root, mat4()));

        // bounds from the rest pose
        const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
        for (const item of this.items)
            for (const p of gltf.meshes[gltf.nodes[item.node].mesh!].primitives)
            {
                const m = item.skinned ? mat4() : item.world;
                for (let i = 0; i < p.positions.length; i += 3)
                {
                    const v = transformPoint(m, p.positions[i], p.positions[i + 1], p.positions[i + 2]);
                    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
                }
            }
        this.bounds = this.items.length ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
    }

    get size(): [number, number, number] {
        const { min, max } = this.bounds;
        return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    }

    get center(): [number, number, number] {
        const { min, max } = this.bounds;
        return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    }

    animation(name: string) {
        return this.animations.find(a => a.name === name);
    }

    /** Back to the bind pose. */
    reset() {
        if (!this.rig) return;
        this.rig.bones.forEach((b, i) => { b.offset.set(this.rest[i].offset); b.rotation.set(this.rest[i].rotation); });
        this.rig.armature.update();
        this.rig.update();
    }

    /** Pose the rig at `time` seconds of an animation (by name or object). */
    pose(animation: string | GLTFAnimation | undefined, time: number, loop = true) {
        if (!this.rig) return;
        this.reset();
        const a = typeof animation === "string" ? this.animation(animation) : animation;
        if (!a) return;
        sample(a, time, this.rig, loop);
        this.rig.armature.update();
        this.rig.update();
    }

    draw(renderer: Renderer, matrix: ArrayLike<number> = mat4(), options: DrawOptions = {}) {
        for (const item of this.items)
        {
            const meshIndex = this.gltf.nodes[item.node].mesh!;
            const m = item.skinned ? matrix : multiply(this.scratch, matrix, item.world);
            const o = item.skinned ? { ...options, joints: this.rig!.matrices } : options;
            for (const gpu of this.gpu[meshIndex]) renderer.draw(gpu, m, o);
        }
    }

    destroy() {
        this.gpu.flat().forEach(g => g.destroy());
    }
}

/** Wrap meshes (e.g. from `MeshBuilder`) as a static glTF, so anything that takes a glTF can show them. */
export function gltfFromMesh(...meshes: Mesh[]): GLTF {
    return {
        meshes: [{ primitives: meshes }],
        nodes: [{ mesh: 0, children: [], translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }],
        skins: [], roots: [0], animations: [],
    };
}
