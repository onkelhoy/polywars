import type { GLTF } from "@papit/game-mesh";
import { Skeleton, type RigJSON } from "@polywar/skeleton";
import { RIGS } from "./rigs";
import type { BaseRig, CharacterJSON } from "./types";

/**
 * One character from its `character.json`: model url, rig.json, base rig, sockets, parts, skins.
 * `skin` goes to `Model.load(gl, character.model, { skin: character.skin })`.
 */
export class Character {
    /** absolute model url */
    readonly model: string;
    readonly base: BaseRig | undefined;

    private constructor(readonly url: string, readonly json: CharacterJSON, readonly rig: RigJSON | undefined) {
        this.model = resolve(url, json.model);
        this.base = RIGS[json.base ?? "humanoid"];
    }

    static async load(url: string) {
        const json: CharacterJSON = await (await fetch(url)).json();
        const rig = json.rig ? await fetch(resolve(url, json.rig)).then(r => r.ok ? r.json() : undefined).catch(() => undefined) : undefined;
        return new Character(url, json, rig);
    }

    get name() { return this.json.name; }
    get sockets() { return { ...this.base?.sockets, ...this.json.sockets }; }
    get parts() { return { ...this.base?.parts, ...this.json.parts }; }
    /** skin name: absolute url */
    get skins() { return Object.fromEntries(Object.entries(this.json.skins ?? {}).map(([k, v]) => [k, resolve(this.url, v)])); }

    /** for `Model.load` */
    skin = (gltf: GLTF) => new Skeleton(gltf, this.rig);

    /** the bone of a socket */
    socket(skeleton: Skeleton, name: string) {
        const bone = this.sockets[name];
        return bone ? skeleton.armature.find(bone) ?? undefined : undefined;
    }

    /** the bones of a part */
    part(skeleton: Skeleton, name: string) {
        return (this.parts[name] ?? []).map(n => skeleton.armature.find(n)).filter(b => !!b);
    }

    /** base rig bones the skeleton lacks (empty = it fits) */
    missing(skeleton: Skeleton) {
        return (this.base?.bones ?? []).filter(n => !skeleton.armature.find(n));
    }
}

function resolve(base: string, path: string) {
    return new URL(path, new URL(base, location.href)).pathname;
}
