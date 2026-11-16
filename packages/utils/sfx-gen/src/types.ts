/** how a round gets chambered (same as weapon.json `action`) */
export type Action = "bolt" | "straight-pull" | "semi" | "auto" | "lever" | "pump" | "break" | "pistol";

/** where a shot is heard: in the open, near walls (street, trench), in a room */
export type Scene = "open" | "walls" | "indoor";

/** what a spent case lands on */
export type Surface = "dirt" | "stone" | "wood" | "metal";

/** What a gun sounds like, from its spec: `energy` 0..1 (a .22 to a nitro express), `supersonic` gives a crack. */
export type GunVoice = {
    kind: "pistol" | "smg" | "rifle";
    action: Action;
    energy: number;
    supersonic: boolean;
};

/**
 * `sounds.json` in a set's folder: sound name -> its variant files (relative to the folder).
 * Gun sets: `shot-open`, `shot-walls`, `shot-indoor` and the parts (`dry`, `bolt-open`, ...). The brass set: one per surface.
 * Hand edits win: add, drop or replace files and list them here.
 */
export type SoundsFile = {
    rate: number;
    sounds: Record<string, string[]>;
};
