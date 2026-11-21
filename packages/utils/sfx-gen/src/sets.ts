import { brass, PARTS, part, RATE, SCENES, shot, SURFACES } from "./recipes";
import type { GunVoice } from "./types";
import { BOOM_SCENES, boom, tinnitus, type BoomSize } from "./explosions";

/** sound name -> its variants (samples at `RATE`) */
export type SoundSet = Record<string, Float32Array[]>;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Every sound of one gun: `variants` shots per scene, two of each part. Same `id`, same sounds. */
export function gunSet(id: string, v: GunVoice, variants = 2): SoundSet {
    const set: SoundSet = {};
    for (const scene of SCENES) set[`shot-${scene}`] = Array.from({ length: variants }, (_, i) => shot(v, scene, hash(`${id}/${scene}/${i}`)));
    for (const cue of PARTS) set[cue] = [0, 1].map(i => part(v, cue, hash(`${id}/${cue}/${i}`)));
    return set;
}

/** The shared brass set: `variants` landings per surface (the player pitches them by case size). */
export function brassSet(variants = 3): SoundSet {
    const set: SoundSet = {};
    for (const s of SURFACES) set[s] = Array.from({ length: variants }, (_, i) => brass(s, hash(`brass/${s}/${i}`)));
    return set;
}

export { RATE };

/** Explosions: `<size>-<scene>` (small / big × near-open, near-walls, near-indoor, far, distant), and `ring` (ears). */
export function explosionSet(variants = 2): SoundSet {
    const set: SoundSet = {};
    for (const size of ["small", "big"] as BoomSize[])
        for (const scene of BOOM_SCENES) set[`${size}-${scene}`] = Array.from({ length: variants }, (_, i) => boom(size, scene, hash(`boom/${size}/${scene}/${i}`)));
    set.ring = [tinnitus(hash("ring"))];
    return set;
}
