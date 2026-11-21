import type { Colour, Preset } from "./types";

export const WHITE: Colour = [.94, .94, .95];
export const GREY: Colour = [.7, .7, .72];
export const DUST: Colour = [.74, .67, .5];

/**
 * Default presets. Sizes are radii m, at `scale` 1:
 * `campfire`, `exhaust`, `dust` (wheels), `puff` (one small pop).
 */
export const PRESETS: Record<string, Preset> = {
    campfire: {
        layers: [
            { count: 5, shape: "sphere", radius: .12, direction: [0, 1, 0], spread: .12, speed: [.7, 1.1], life: [3.5, 5], size: [.12, .7], grow: .7, drag: .3, lift: .35, swirl: .5, stretch: .03, colour: WHITE, bright: .9, dim: .45 },
        ],
    },
    exhaust: {
        layers: [
            { count: 14, direction: [0, 1, 0], spread: .7, speed: [.2, .5], life: [.8, 1.4], size: [.05, .32], grow: 2.5, drag: 1.6, lift: .3, swirl: .4, stretch: .05, colour: GREY, bright: .5, dim: .4 },
        ],
    },
    dust: {
        layers: [
            { count: 10, shape: "sphere", radius: .2, direction: [0, 1, 0], spread: .8, speed: [.3, .9], life: [1, 1.8], size: [.12, .65], grow: 2, drag: 2, lift: .15, swirl: .4, stretch: .06, colour: DUST, bright: .7, dim: .4 },
        ],
    },
    puff: {
        layers: [
            { count: 5, shape: "sphere", radius: .15, direction: [0, 1, 0], spread: .9, speed: [.4, 1], life: [.7, 1.2], size: [.1, .3], grow: 4, drag: 3, lift: .4, swirl: .3, colour: WHITE, bright: .9 },
        ],
    },
};
