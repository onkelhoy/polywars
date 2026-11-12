import type { GrassLook } from "@polywar/grass-material";
import type { GrassOptions, Quality, QualitySettings, Style, StyleSettings } from "./types";

/** Quality presets. A game picks one from its global setting (phone = low) and may override fields. */
export const QUALITY: Record<Quality, QualitySettings> = {
    low: { density: 18, maxTufts: 20_000, distance: 23, lod: .25, sizeScale: 1.9, source: "sprite", planes: 2, clouds: false, pushers: 8, softBands: 0, noiseSize: 64 },
    medium: { density: 47, maxTufts: 60_000, distance: 42, lod: .35, sizeScale: 1.55, source: "sprite", planes: 2, clouds: true, pushers: 16, softBands: .2, noiseSize: 128 },
    high: { density: 83, maxTufts: 160_000, distance: 65, lod: .45, sizeScale: 1.4, source: "sprite", planes: 3, clouds: true, pushers: 64, softBands: .25, noiseSize: 256 },
};

export const STYLE: Record<Style, StyleSettings> = {
    pixel: { pixelated: true, stepped: true, framerate: 7, bands: 3, pixels: 24 },
    smooth: { pixelated: false, stepped: false, framerate: 30, bands: 0, pixels: 64 },
};

export const DEFAULTS: GrassOptions = {
    quality: "medium",
    style: "pixel",
    settings: {},
    look: {},
    size: [.2, .3],
    sizeJitter: .3,
    color: "#5d9a3a",
    shape: "mixed",
    bladeShare: .35,
    variation: .12,
    patches: [
        { color: "#7bb045", scale: .02, threshold: .58, softness: .08 },
        { color: "#4a7d33", scale: .015, threshold: .62, softness: .08 },
    ],
    accents: [
        { chance: .004, color: "#e8d36a", height: .12, scale: 1.2 },
        { chance: .02, color: "#8fc456", height: .05, scale: 1 },
    ],
    wind: { direction: [0, 1], speed: .025, scale: .07, threshold: .365, diverge: 10, angle: 60, perspective: .3 },
    sway: { speed: .1, angle: 10 },
    push: { angle: 45, exponent: 1 },
    clouds: { scale: 40, speed: .01, direction: [1, .3], height: 30, contrast: 2, threshold: .1, min: .45, diverge: 12 },
    lighting: { wrap: 0, steepness: 1 },
    chunk: 16,
    debug: "",
};

export type Resolved = GrassOptions & { q: QualitySettings; s: StyleSettings };

export function resolve(options: Partial<GrassOptions> = {}): Resolved {
    const o = { ...DEFAULTS, ...options };
    return { ...o, q: { ...QUALITY[o.quality], ...o.settings }, s: { ...STYLE[o.style], ...o.look } };
}

/** sRGB hex to linear rgb */
export { linear } from "@polywar/grass-material";

/** the material's settings from resolved grass options */
export function look(o: Resolved): GrassLook {
    const { q, s } = o;
    return {
        size: [o.size[0] * q.sizeScale, o.size[1] * q.sizeScale],
        color: o.color, shape: o.shape, bladeShare: o.bladeShare, variation: o.variation,
        patches: o.patches, accents: o.accents, wind: o.wind, sway: o.sway, push: o.push,
        clouds: q.clouds ? o.clouds : null, lighting: o.lighting,
        bands: s.bands, softBands: q.softBands, pixelated: s.pixelated, pixels: s.pixels, stepped: s.stepped, framerate: s.framerate,
        noiseSize: q.noiseSize, pushers: q.pushers, source: q.source, distance: q.distance,
        sprites: o.sprites, debug: o.debug,
    };
}
