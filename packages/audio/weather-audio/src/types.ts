import type { AudioMixer } from "@papit/audio";

/** what the rain lands on round you, weights (any mix, normalised) */
export type Surfaces = { ground?: number; leaves?: number; water?: number };
/** what you're under (heard close, not muffled), weights */
export type Cover = { roof?: number; tent?: number; vehicle?: number };

export type WeatherAudioOptions = {
    mixer: AudioMixer;
    /** bus (default "ambience") */
    bus?: string;
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
    /** 0..1 how shut in (a tent .5, a house 1): muffles the outside */
    inside: number;
};
