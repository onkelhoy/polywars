import { Matrix4 } from "@papit/matrix";
import { Model, type Renderer } from "@polywar/renderer";
import type { Character } from "./character";

/**
 * A character's worn things on its bones: loads the models when first worn, draws them where the bones are.
 * `wear(name)` / `remove(name)`; a slot holds one (wearing another helmet takes the first off).
 */
export class Attachments {
    /** names worn now */
    readonly worn = new Set<string>();
    private models = new Map<string, Promise<Model>>();
    private loaded = new Map<string, Model>();

    constructor(readonly gl: WebGL2RenderingContext, readonly character: Character) { }

    /** every attachment name, grouped by slot ("" = none) */
    get slots() {
        const out: Record<string, string[]> = {};
        for (const [name, a] of Object.entries(this.character.json.attachments ?? {})) (out[a.slot ?? ""] ??= []).push(name);
        return out;
    }

    async wear(name: string) {
        const a = this.character.json.attachments?.[name];
        if (!a) return;
        if (a.slot) for (const other of [...this.worn]) if (this.character.json.attachments?.[other]?.slot === a.slot) this.worn.delete(other);
        this.worn.add(name);
        if (!this.models.has(name))
        {
            const url = new URL(a.model, new URL(this.character.url, location.href)).pathname;
            const p = Model.load(this.gl, url);
            this.models.set(name, p);
            this.loaded.set(name, await p);
        }
    }

    remove(name: string) { this.worn.delete(name); }

    toggle(name: string) { return this.worn.has(name) ? (this.remove(name), false) : (this.wear(name), true); }

    /**
     * Draw what's worn on `model` placed at `matrix` (the same matrix the character model is drawn with).
     * `bone` finds a bone's world matrix in armature space (the skin's: `Skeleton` or the glTF rig).
     */
    draw(renderer: Renderer, model: Model, matrix: Matrix4) {
        for (const name of this.worn)
        {
            const item = this.loaded.get(name), a = this.character.json.attachments![name];
            if (!item) continue;
            const bone = boneOf(model, a.bone);
            if (!bone) continue;
            const [yaw, pitch, roll] = (a.turn ?? [0, 0, 0]).map(d => d * Math.PI / 180);
            const local = Matrix4.rotationY(yaw).multiply(Matrix4.rotationX(pitch)).multiply(Matrix4.rotationZ(roll));
            local[12] = a.at?.[0] ?? 0; local[13] = a.at?.[1] ?? 0; local[14] = a.at?.[2] ?? 0;
            if (a.scale) local.scale([a.scale, a.scale, a.scale]);
            item.draw(renderer, matrix.clone.multiply(model.skeletonMatrix).multiply(bone).multiply(local));
        }
    }
}

/** `@polywar/skeleton` bones run along +X; this turns one back into the glTF node's frame (+Y along) */
const TO_GLTF = Matrix4.create([0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** a bone's world matrix (armature space, glTF node frame: +Y along the bone) on a model: its `Skeleton` skin or its glTF rig */
export function boneOf(model: Model, name: string): Matrix4 | undefined {
    const skin = model.skin as unknown as { armature?: { find(n: string): { worldMatrix: Matrix4 } | null } } | undefined;
    const fromSkin = skin?.armature?.find(name);
    if (fromSkin) return fromSkin.worldMatrix.clone.multiply(TO_GLTF);
    return model.rig?.armature.find(name)?.worldMatrix;
}
