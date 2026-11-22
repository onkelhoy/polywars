import type { AudioMixer } from "@papit/audio";

/** what the rain lands on round you, weights (any mix, normalised) */
export type Surfaces = { ground?: number; leaves?: number; water?: number };
/** what you're under (heard close, not muffled), weights 0..1 */
export type Cover = { roof?: number; tent?: number; vehicle?: number };

export type WeatherAudioOptions = {
    mixer: AudioMixer;
    /** bus (default "ambience") */
    bus?: string;
    /** the set's folder (`sounds.json`, `tools/weather-sounds.mjs`). Default `/assets/audio/weather/` */
    base?: string;
    /** m/s, thunder is heard late. Default 343 */
    sound?: number;
    /** a strike happened (from `state.storm`): `distance` m, `pan` -1..1, the flash is now, the sound after `delay` s */
    onstrike?: (strike: { distance: number; pan: number; delay: number }) => void;
};

export type WeatherAudioState = {
    /** 0..1 rain: mild patter .. downpour */
    rain: number;
    /** 0..1 snow (hushes, only wind) */
    snow: number;
    /** 0..1 wind strength */
    wind: number;
    surfaces: Surfaces;
    under: Cover;
    /** 0..1 how shut in (a tent .4, a car .8, a house 1): muffles the outside */
    inside: number;
    /** 0..1 thunderstorm: random strikes round you, nearer + more often the higher */
    storm: number;
    /** 0..1 the live synthesised close drops on top (`worklet.ts`), default 0 */
    detail: number;
};
