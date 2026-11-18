/** what a body does, each played by a clip */
export type Move = "idle" | "walk" | "run" | "jump";

/** `character.json`, hand written next to a character's `model.glb` (paths relative to it). */
export type CharacterJSON = {
    name: string;
    /** glb, relative to the json */
    model: string;
    /** rig.json (bone lengths, IK), relative to the json */
    rig?: string;
    /** base rig the bones follow (`humanoid`, `quadruped`, `bird`), default `humanoid` */
    base?: string;
    /** socket name: bone that holds things there, e.g. "hand.R": "hand.R" */
    sockets?: Record<string, string>;
    /** body part name: its bones (hit zones, dismember, hide) */
    parts?: Record<string, string[]>;
    /** skin name: glb (or material) relative to the json, swapped onto the same rig */
    skins?: Record<string, string>;
    /** model units per metre is 1 / scale: the model times `scale` is in metres (default 1) */
    scale?: number;
    /** things worn on a bone (helmets, pads, packs), by name */
    attachments?: Record<string, AttachmentJSON>;
    /** the body's clip names (glb animations) per move, default: `Idle` / `idle`, `Walking` / `walk`, `Run` / `run`, `Jump` / `jump` */
    clips?: Partial<Record<Move, string>>;
    /** first person: the bone the eye sits on and bones shrunk away (head, hair) so they don't fill the view */
    firstPerson?: { eye: string; offset?: [number, number, number]; hide?: string[] };
};

/** A model worn on a bone, placed in the bone's space (model units of the character). */
export type AttachmentJSON = {
    /** glb, relative to the json */
    model: string;
    bone: string;
    /** offset in the bone's space */
    at?: [number, number, number];
    /** degrees: yaw (y), pitch (x), roll (z) in the bone's space */
    turn?: [number, number, number];
    scale?: number;
    /** one per slot (`head`, `shoulders`): picking one drops the other */
    slot?: string;
};

/** Bones every character on a base rig has (names as in Blender), its parts and sockets. */
export type BaseRig = {
    name: string;
    bones: string[];
    parts: Record<string, string[]>;
    sockets: Record<string, string>;
    /**
     * IK the game makes at runtime (baked rigs export no controls): same shape as `@polywar/skeleton`'s
     * `IKControl` (bone + chain, made target / pole, pole offset skin space from `near`'s rest head, `copy`).
     */
    controls?: {
        bone: string; chain: number; target: string;
        pole?: { name: string; near: string; offset: [number, number, number] };
        parent?: string; copy?: string;
    }[];
};
