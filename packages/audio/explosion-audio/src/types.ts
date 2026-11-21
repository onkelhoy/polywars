import type { AudioMixer } from "@papit/audio";

export type Vec3 = [number, number, number];

/** the host's ray: what's hit between `from` and `to`, nothing if clear */
export type Cast = (from: Vec3, to: Vec3) => { point: Vec3 } | null | undefined;

export type ExplosionAudioOptions = {
    mixer: AudioMixer;
    /** the set's folder (`sounds.json`, `@polywar/sfx-gen`). Default `/assets/audio/effects/explosions/` */
    base?: string;
    /** rays for near blasts: open, walls or indoor (default open) */
    cast?: Cast;
    /** bus. Default `"sfx"` */
    bus?: string;
    /** metres per second: far blasts are heard late. Default 343 */
    sound?: number;
    /** 0..1 the ear is ringing (a player's `deaf`): muffles everything */
    deaf?: () => number;
};
