import type { AudioMixer } from "@papit/audio";

/** what the rain lands on near you, weights (any mix, normalised) */
export type Surfaces = { ground?: number; leaves?: number; roof?: number; water?: number; vehicle?: number };

export type WeatherAudioOptions = {
    mixer: AudioMixer;
    /** bus (default "ambience") */
    bus?: string;
};

export type WeatherAudioState = {
    /** 0..1 rain: mild patter .. roar */
    rain: number;
    /** 0..1 snow (hushes, only wind) */
    snow: number;
    /** 0..1 wind strength */
    wind: number;
    surfaces: Surfaces;
    /** 0..1 indoors / in a cab: muffled, drums on the roof */
    inside: number;
};
