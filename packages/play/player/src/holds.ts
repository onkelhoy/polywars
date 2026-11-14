import type { Model } from "@polywar/renderer";
import type { GunSpec } from "@polywar/weapons";
import type { Hold, ScopeMount, Vec3 } from "@polywar/viewmodel";

/** a bone's head in model space (rest pose) */
export function bonePoint(model: Model, name: string): Vec3 | undefined {
    const bone = model.rig?.armature.find(name);
    if (!bone) return undefined;
    const h = bone.head, m = model.skeletonMatrix;
    return [m[0] * h[0] + m[4] * h[1] + m[8] * h[2] + m[12], m[1] * h[0] + m[5] * h[1] + m[9] * h[2] + m[13], m[2] * h[0] + m[6] * h[1] + m[10] * h[2] + m[14]];
}

/**
 * The top of the gun near a z (model space, the middle few cm in x): the front sight near the muzzle.
 * Skinned guns: the bind pose is the model pose.
 */
export function topNear(model: Model, z: number, reach = .05): number | undefined {
    let top: number | undefined;
    for (const mesh of model.gltf.meshes)
        for (const p of mesh.primitives)
            for (let i = 0; i < p.positions.length; i += 3)
                if (Math.abs(p.positions[i + 2] - z) < reach && Math.abs(p.positions[i]) < .02 && (top === undefined || p.positions[i + 1] > top)) top = p.positions[i + 1];
    return top;
}

/** camera space hip spots and aimed eye distance (to the rear sight) per kind of gun */
const KIND = {
    pistol: { hip: [.17, -.19, -.42] as Vec3, eye: .42, weight: .7 },
    smg: { hip: [.15, -.17, -.3] as Vec3, eye: .3, weight: 1.1 },
    rifle: { hip: [.14, -.16, -.26] as Vec3, eye: .32, weight: 1.4 },
};

/**
 * How a gun from `assets/models/weapons/guns/` is held, from its bones (`trigger`, `muzzle`, `action`):
 * the hand under and behind the trigger, the other on the fore end (long guns) or under the grip (pistols),
 * the sight line along the top of the gun.
 */
export function holdOf(model: Model, spec: GunSpec): Hold {
    const trigger = bonePoint(model, "trigger") ?? [0, 0, 0], muzzle = bonePoint(model, "muzzle") ?? [0, 0, -.5];
    const action = bonePoint(model, "action") ?? trigger, top = model.bounds.max[1], k = KIND[spec.kind];
    const grip: Vec3 = [trigger[0], trigger[1] - .035, trigger[2] + .03];
    // aimed, the front sight's tip goes on the middle of the view (bullets follow the bore, zeroed)
    const rearZ = spec.kind === "pistol" ? trigger[2] + .02 : action[2];
    const front = topNear(model, muzzle[2] + .03, .04) ?? top;
    return {
        grip, muzzle,
        fore: spec.kind === "pistol" ? [grip[0] - .015, grip[1] - .04, grip[2] + .01] : [muzzle[0], muzzle[1] - .035, trigger[2] + (muzzle[2] - trigger[2]) * .45],
        sight: [0, front, muzzle[2] + .03],
        hip: k.hip, eye: k.eye + rearZ - (muzzle[2] + .03), weight: k.weight,
    };
}

/** where a scope goes on a scoped gun: over the action, a little behind it */
export function scopeMountOf(model: Model): ScopeMount {
    const action = bonePoint(model, "action") ?? [0, 0, 0], top = model.bounds.max[1];
    return { eyepiece: [0, top + .045, action[2] + .13], length: .3, lens: .018 };
}
