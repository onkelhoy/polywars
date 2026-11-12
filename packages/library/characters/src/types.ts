/** `character.json`, hand written next to a character's `model.glb` (paths relative to it). */
export type CharacterJSON = {
    name: string;
    /** glb, relative to the json */
    model: string;
    /** rig.json (bone lengths, IK), relative to the json */
    rig?: string;
    /** base rig the bones follow (`humanoid`, `quadruped`, `bird`), default `humanoid` */
    base?: string;
    /** socket name: bone that holds things there, e.g. "hand.R": "prop.R" */
    sockets?: Record<string, string>;
    /** body part name: its bones (hit zones, dismember, hide) */
    parts?: Record<string, string[]>;
    /** skin name: glb (or material) relative to the json, swapped onto the same rig */
    skins?: Record<string, string>;
};

/** Bones every character on a base rig has (names as in Blender), its parts and sockets. */
export type BaseRig = {
    name: string;
    bones: string[];
    parts: Record<string, string[]>;
    sockets: Record<string, string>;
};
