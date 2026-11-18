import type { BaseRig } from "./types";

const sides = (names: string[]) => names.flatMap(n => [`${n}.L`, `${n}.R`]);

type Control = NonNullable<BaseRig["controls"]>[number];
/** a left side control and its mirror (x flipped, `.L` -> `.R`) */
const mirrored = (c: Control): Control[] => {
    const r = (n: string) => n.replace(/\.L$/, ".R");
    return [c, {
        ...c, bone: r(c.bone), target: r(c.target), parent: c.parent && r(c.parent), copy: c.copy && r(c.copy),
        pole: c.pole && { name: r(c.pole.name), near: r(c.pole.near), offset: [-c.pole.offset[0], c.pole.offset[1], c.pole.offset[2]] },
    }];
};

/**
 * `characters/base/model.blend` exported with `--bake`: spine, arms with fingers, legs, clips as FK. The Blender
 * controls are gone; `controls` makes the ones the game drives (arms on a gun, finger tips, feet), poles as they sit
 * in the blend (glTF: +Y up, +Z forward).
 */
export const HUMANOID: BaseRig = {
    name: "humanoid",
    bones: [
        "root", "hips", "spine", "spine.1", "chest", "neck", "head",
        ...sides(["shoulder", "upper_arm", "forearm", "hand", "thumb.1", "thumb.2", "thumb.3", "index.1", "index.2", "index.3", "fingers.1", "fingers.2", "fingers.3",
            "thigh", "shin", "foot", "toe"]),
    ],
    controls: [
        { bone: "forearm.L", chain: 2, target: "hand.ik.L", copy: "hand.L", pole: { name: "elbow.pole.L", near: "forearm.L", offset: [0, 0, -.47] } },
        { bone: "shin.L", chain: 2, target: "foot.ik.L", copy: "foot.L", pole: { name: "knee.pole.L", near: "shin.L", offset: [0, 0, .58] } },
        { bone: "thumb.3.L", chain: 3, target: "thumb.ik.L", parent: "hand.L", pole: { name: "thumb.pole.L", near: "thumb.2.L", offset: [-.015, .007, .028] } },
        { bone: "index.3.L", chain: 3, target: "index.ik.L", parent: "hand.L", pole: { name: "index.pole.L", near: "index.2.L", offset: [.029, .045, 0] } },
        { bone: "fingers.3.L", chain: 3, target: "fingers.ik.L", parent: "hand.L", pole: { name: "fingers.pole.L", near: "fingers.2.L", offset: [.026, .045, 0] } },
    ].flatMap(c => mirrored(c as Control)),
    parts: {
        head: ["head", "neck"],
        torso: ["hips", "spine", "spine.1", "chest"],
        "arm.L": ["shoulder.L", "upper_arm.L", "forearm.L", "hand.L"],
        "arm.R": ["shoulder.R", "upper_arm.R", "forearm.R", "hand.R"],
        "leg.L": ["thigh.L", "shin.L", "foot.L", "toe.L"],
        "leg.R": ["thigh.R", "shin.R", "foot.R", "toe.R"],
    },
    sockets: { "hand.R": "hand.R", "hand.L": "hand.L", head: "head" },
};

/** The farm pack rig (Cow, Horse, Pig, ...): body, neck + head, four legs with foot IK. Tails are extra. */
export const QUADRUPED: BaseRig = {
    name: "quadruped",
    bones: [
        "root", "Body", "Hips", "Torso", "Back", "Shoulders", "Neck", "Head",
        ...sides(["FrontLeg", "FrontUpLeg", "FrontLowLeg", "FrontFoot", "BackLeg", "BackUpLeg", "BackLowLeg", "BackFoot"]),
    ],
    parts: {
        head: ["Head", "Neck"],
        torso: ["Body", "Hips", "Torso", "Back", "Shoulders"],
        ...Object.fromEntries(["L", "R"].flatMap(s => [
            [`leg.front.${s}`, [`FrontLeg.${s}`, `FrontUpLeg.${s}`, `FrontLowLeg.${s}`]],
            [`leg.back.${s}`, [`BackLeg.${s}`, `BackUpLeg.${s}`, `BackLowLeg.${s}`]],
        ])),
    },
    sockets: { saddle: "Back", head: "Head" },
};

/** `tools/blender/lib/bird_rig.py`: two legged animal (chicken like), leg IK. */
export const BIPED: BaseRig = {
    name: "biped",
    bones: ["root", "body", "neck", "head", "beak", "tail", ...sides(["wing", "thigh", "shin", "foot", "toe", "foot.ik", "knee.pole"])],
    parts: {
        head: ["head", "neck", "beak"],
        torso: ["body", "tail"],
        "wing.L": ["wing.L"], "wing.R": ["wing.R"],
        "leg.L": ["thigh.L", "shin.L", "foot.L", "toe.L"],
        "leg.R": ["thigh.R", "shin.R", "foot.R", "toe.R"],
    },
    sockets: { head: "head", back: "body" },
};

/** Base rigs by name (`character.json` `base`). */
export const RIGS: Record<string, BaseRig> = { humanoid: HUMANOID, quadruped: QUADRUPED, biped: BIPED };
