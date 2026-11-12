import { loadGLTF, rig as makeRig, sample, upload, type GLTF, type GLTFAnimation, type GPUMesh, type Mesh, type Rig } from "@papit/game-mesh";
import { loadMaps, readMaps, type MapUrls, type Maps } from "@polywar/textured";
import { Matrix4 } from "@papit/matrix";
import { Quaternion } from "@papit/quaternion";
import type { DrawOptions, Renderer } from "./renderer";

/** a glTF + optional texture maps (urls or pixels) per mesh and primitive (`maps[mesh][primitive]`, as `readMaps` returns) */
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
    private items: { node: number; skinned: boolean; world: Matrix4 }[] = [];
    private rest: { offset: number[]; rotation: number[] }[] = [];
    /** world matrix of the skeleton's non-joint ancestors (e.g. a scaled Armature node); `rig()` leaves it out */
    private skeleton = Matrix4.create();

    static async load(gl: WebGL2RenderingContext, url: string) {
        const [gltf, maps] = await Promise.all([loadGLTF(url), readMaps(url).catch(() => [])]);
        const model = new Model(gl, Object.assign(gltf, { maps }));
        await model.ready;
        return model;
    }

    /** resolves when the textures are on the GPU */
    readonly ready: Promise<void>;

    constructor(private gl: WebGL2RenderingContext, readonly gltf: TexturedGLTF) {
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

        const visit = (index: number, parent: Matrix4) => {
            const world = parent.clone.multiply(local(gltf.nodes[index]));
            const node = gltf.nodes[index];
            if (node.mesh !== undefined) this.items.push({ node: index, skinned: node.skin !== undefined && !!this.rig, world });
            node.children.forEach(child => visit(child, world));
        };
        gltf.roots.forEach(root => visit(root, Matrix4.create()));

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
                this.skeleton.multiply(local(gltf.nodes[n]));
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
                    let m: Matrix4 = item.world;
                    if (item.skinned && joints && p.joints && p.weights)
                    {
                        // strongest joint is enough for bounds
                        let best = 0;
                        for (let k = 1; k < 4; k++) if (p.weights[vi * 4 + k] > p.weights[vi * 4 + best]) best = k;
                        m = this.skeleton.clone.multiply(Matrix4.create(joints.subarray(p.joints[vi * 4 + best] * 16, p.joints[vi * 4 + best] * 16 + 16)));
                    }
                    const v = m.clone.multiply([p.positions[i], p.positions[i + 1], p.positions[i + 2], 1]);
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

    draw(renderer: Renderer, matrix: Matrix4 = Matrix4.create(), options: DrawOptions = {}) {
        for (const item of this.items)
        {
            const meshIndex = this.gltf.nodes[item.node].mesh!;
            const m = matrix.clone.multiply(item.skinned ? this.skeleton : item.world);
            const o = item.skinned ? { ...options, joints: this.rig!.matrices } : options;
            this.gpu[meshIndex].forEach((gpu, i) => renderer.draw(gpu, m, { ...o, maps: this.textures[meshIndex]?.[i] }));
        }
    }

    destroy() {
        this.gpu.flat().forEach(g => g.destroy());
        // url textures are cached and shared, pixel ones belong to this model
        this.ready.then(() => (this.gltf.maps ?? []).forEach((mesh, m) => mesh.forEach((sources, i) => {
            const maps = this.textures[m]?.[i];
            if (!sources || !maps) return;
            for (const k of ["albedo", "normal", "spec", "ao"] as const)
                if (sources[k] && typeof sources[k] !== "string" && maps[k]) this.gl.deleteTexture(maps[k]!);
        })));
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

/** a glTF node's local matrix: its `matrix`, or translation * rotation * scale */
function local(node: { matrix?: ArrayLike<number>; translation: ArrayLike<number>; rotation: ArrayLike<number>; scale: ArrayLike<number> }) {
    if (node.matrix) return Matrix4.create(Array.from(node.matrix));
    const m = new Quaternion(Array.from(node.rotation)).writeMatrix(Matrix4.create());
    m[12] = node.translation[0]; m[13] = node.translation[1]; m[14] = node.translation[2];
    return m.scale(Array.from(node.scale));
}
