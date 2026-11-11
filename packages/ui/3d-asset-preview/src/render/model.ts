import { loadGLTF, rig as makeRig, sample, upload, type GLTF, type GLTFAnimation, type GPUMesh, type Mesh, type Rig } from "@papit/game-mesh";
import { loadMaps, readMaps, type MapUrls, type Maps } from "@polywar/textured";
import { fromTRS, mat4, multiply, transformPoint, type Mat4 } from "./math";
import type { DrawOptions, Renderer } from "./renderer";

/** a glTF + optional texture map urls per mesh and primitive (`maps[mesh][primitive]`, as `readMaps` returns) */
export type TexturedGLTF = GLTF & { maps?: (MapUrls | undefined)[][] };

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
    /** textures per mesh and primitive, filled in once loaded */
    private textures: (Maps | undefined)[][] = [];
    private items: { node: number; skinned: boolean; world: Mat4 }[] = [];
    private rest: { offset: number[]; rotation: number[] }[] = [];
    /** world matrix of the skeleton's non-joint ancestors (e.g. a scaled Armature node); `rig()` leaves it out */
    private skeleton = mat4();
    private scratch = mat4();

    static async load(gl: WebGL2RenderingContext, url: string) {
        const [gltf, maps] = await Promise.all([loadGLTF(url), readMaps(url).catch(() => [])]);
        const model = new Model(gl, Object.assign(gltf, { maps }));
        await model.ready;
        return model;
    }

    /** resolves when the textures are on the GPU */
    readonly ready: Promise<void>;

    constructor(gl: WebGL2RenderingContext, readonly gltf: TexturedGLTF) {
        this.gpu = gltf.meshes.map(m => m.primitives.map(p => upload(gl, p)));
        this.ready = Promise.all((gltf.maps ?? []).map((mesh, m) => Promise.all(mesh.map(async (urls, i) => {
            if (!urls) return;
            (this.textures[m] ??= [])[i] = await loadMaps(gl, urls);
        })))).then(() => undefined);
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

        if (gltf.skins.length)
        {
            const joints = new Set(gltf.skins[0].joints);
            const parentOf = new Map<number, number>();
            gltf.nodes.forEach((n, i) => n.children.forEach(c => parentOf.set(c, i)));
            const root = gltf.skins[0].joints.find(j => !joints.has(parentOf.get(j) ?? -1));
            const chain: number[] = [];
            for (let p = parentOf.get(root ?? -1); p !== undefined; p = parentOf.get(p)) chain.unshift(p);
            for (const n of chain)
            {
                const node = gltf.nodes[n];
                multiply(this.skeleton, this.skeleton, node.matrix ? node.matrix : fromTRS(mat4(), node.translation, node.rotation, node.scale));
            }
        }

        // bounds from the rest pose (skinned vertices posed on the CPU once)
        const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
        for (const item of this.items)
            for (const p of gltf.meshes[gltf.nodes[item.node].mesh!].primitives)
            {
                const joints = this.rig?.matrices;
                for (let i = 0, vi = 0; i < p.positions.length; i += 3, vi++)
                {
                    let m: ArrayLike<number> = item.world;
                    if (item.skinned && joints && p.joints && p.weights)
                    {
                        // strongest joint is enough for bounds
                        let best = 0;
                        for (let k = 1; k < 4; k++) if (p.weights[vi * 4 + k] > p.weights[vi * 4 + best]) best = k;
                        m = multiply(this.scratch, this.skeleton, joints.subarray(p.joints[vi * 4 + best] * 16, p.joints[vi * 4 + best] * 16 + 16));
                    }
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
            const m = multiply(this.scratch, matrix, item.skinned ? this.skeleton : item.world);
            const o = item.skinned ? { ...options, joints: this.rig!.matrices } : options;
            this.gpu[meshIndex].forEach((gpu, i) => renderer.draw(gpu, m, { ...o, maps: this.textures[meshIndex]?.[i] }));
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
