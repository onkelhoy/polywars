import type { BaseRig } from "./types";

const sides = (names: string[]) => names.flatMap(n => [`${n}.L`, `${n}.R`]);

/** `tools/blender/lib/human_rig.py`: spine, arms with fingers, legs, IK controls. */
export const HUMANOID: BaseRig = {
    name: "humanoid",
    bones: [
        "root", "hips", "spine", "spine.1", "chest", "neck", "head",
        ...sides(["shoulder", "upper_arm", "forearm", "hand", "thumb.1", "thumb.2", "index.1", "index.2", "fingers.1", "fingers.2", "prop",
            "thigh", "shin", "foot", "toe", "foot.ik", "knee.pole", "hand.ik", "elbow.pole"]),
    ],
    parts: {
        head: ["head", "neck"],
        torso: ["hips", "spine", "spine.1", "chest"],
        "arm.L": ["shoulder.L", "upper_arm.L", "forearm.L", "hand.L"],
        "arm.R": ["shoulder.R", "upper_arm.R", "forearm.R", "hand.R"],
        "leg.L": ["thigh.L", "shin.L", "foot.L", "toe.L"],
        "leg.R": ["thigh.R", "shin.R", "foot.R", "toe.R"],
    },
    sockets: { "hand.R": "prop.R", "hand.L": "prop.L", head: "head" },
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

/** Base rigs by name (`character.json` `base`). */
export const RIGS: Record<string, BaseRig> = { humanoid: HUMANOID, quadruped: QUADRUPED };
