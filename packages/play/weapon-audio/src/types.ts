import type { AudioMixer } from "@papit/audio";

export type Vec3 = [number, number, number];

/** where a shot is heard (the shot files: `shot-<scene>`) */
export type Scene = "open" | "walls" | "indoor";

/** the host's ray: what's hit between `from` and `to`, nothing if clear */
export type Cast = (from: Vec3, to: Vec3) => { point: Vec3 } | null | undefined;

export type WeaponAudioOptions = {
    mixer: AudioMixer;
    /** folder of the sound sets, each `<set>/sounds.json` (`@polywar/sfx-gen`). Default `/assets/audio/effects/weapons/` */
    base?: string;
    /** rays for the scene guess; without it every shot is `open` */
    cast?: Cast;
    /** bus. Default `"sfx"` */
    bus?: string;
    /** random pitch either way, a fraction. Default `.04` */
    pitch?: number;
    /** metres per second: far sounds come late. Default 343, 0 for none */
    sound?: number;
};

/** `sounds.json` of a set */
export type SoundsFile = { rate: number; sounds: Record<string, string[]> };

export type PlayOptions = { volume?: number; rate?: number };
