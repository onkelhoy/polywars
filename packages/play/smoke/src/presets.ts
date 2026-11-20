import type { Colour, Preset } from "./types";

export const WHITE: Colour = [.94, .94, .95];
export const GREY: Colour = [.7, .7, .72];
export const DUST: Colour = [.74, .67, .5];

/**
 * Default presets. Sizes are radii m, at `scale` 1:
 * `explosion` a big one (flat base, a stem, a huge cap, ~50 m up), `blast` a ground blast (~10 m across),
 * `campfire`, `exhaust`, `dust` (wheels), `puff` (one small pop).
 */
export const PRESETS: Record<string, Preset> = {
    // flat and wide on the ground, narrows to a stem, opens into a big rolling cap; spikes shoot out first
    explosion: {
        layers: [
            // flat base, rushes out along the ground
            { count: 80, shape: "ring", radius: 2, outward: [8, 24], direction: [0, 1, 0], spread: .2, speed: [0, 2], life: [4.5, 6.5], size: [2, 4.5], grow: 1.6, drag: 1.4, lift: .2, swirl: 1.5, stretch: .015, colour: WHITE, bright: 1, dim: .5 },
            // stem: a narrow column that keeps feeding up
            { count: 60, shape: "sphere", radius: 1.5, direction: [0, 1, 0], spread: .05, speed: [6, 30], life: [4.5, 6.5], delay: [0, .8], size: [2.2, 4], grow: 1.5, drag: 1, lift: 1.5, swirl: 1.2, stretch: .008, colour: WHITE, bright: .9, dim: .5 },
            // cap: the big puff on top, spreads out as it brakes
            { count: 110, shape: "sphere", radius: 3, direction: [0, 1, 0], spread: .14, speed: [27, 36], outward: [2, 12], life: [5, 7], delay: [0, .15], size: [2.5, 5.5], grow: 1.2, drag: .9, lift: 3, swirl: 3, roll: 7, stretch: .006, colour: WHITE, bright: 1, dim: .6 },
            // spikes: thin, fast, gone quickly
            { count: 16, direction: [0, 1, 0], spread: .75, speed: [45, 75], life: [.3, .55], size: [.7, 1.4], grow: 8, drag: 2.5, swirl: 0, stretch: .14, shrink: .15, colour: WHITE, bright: 1, ground: false, link: false },
        ],
    },
    // the GIF: a flat ring rushes out along the ground and brakes hard, the core rolls up, thin wisps streak out first
    blast: {
        layers: [
            { count: 40, shape: "ring", radius: .6, outward: [10, 17], direction: [0, 1, 0], spread: .2, speed: [0, 1.2], life: [1.8, 2.8], size: [.4, 1.2], grow: 2.5, drag: 2.4, lift: .7, swirl: .8, stretch: .07, colour: DUST, bright: 1, dim: .45 },
            { count: 22, shape: "sphere", radius: .6, direction: [0, 1, 0], spread: .3, speed: [4, 10], life: [2.2, 3.4], delay: [0, .1], size: [.6, 1.6], grow: 3, drag: 2, lift: 1.4, swirl: 1, stretch: .04, colour: DUST, bright: 1, dim: .5 },
            { count: 22, link: false, shape: "ring", radius: .3, outward: [16, 24], direction: [0, 1, 0], spread: .3, speed: [0, .8], life: [.45, .9], size: [.15, .32], grow: 4, drag: 3.5, swirl: .2, stretch: .22, colour: DUST, bright: .7, dim: .6, shrink: .4 },
        ],
    },
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
