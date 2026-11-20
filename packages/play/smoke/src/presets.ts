import type { Colour, Preset } from "./types";

export const WHITE: Colour = [.94, .94, .95];
export const GREY: Colour = [.66, .66, .68];
export const DUST: Colour = [.74, .67, .5];

/**
 * Default presets. Sizes are radii m, at `scale` 1:
 * `blast` a ground explosion (shell / grenade, ~10 m across), `campfire`, `exhaust`, `dust` (wheels), `puff` (one small pop).
 */
export const PRESETS: Record<string, Preset> = {
    // the GIF: a flat ring rushes out along the ground and brakes hard, the core rolls up,
    // thin fast wisps streak out first; bright tops go flat, then everything shrinks and crumbles
    blast: {
        layers: [
            // ground ring
            { count: 48, shape: "ring", radius: .6, outward: [10, 17], direction: [0, 1, 0], spread: .2, speed: [0, 1.2], life: [1.6, 2.6], size: [.4, 1.3], grow: 2.5, drag: 2.4, lift: .7, swirl: .6, stretch: .07, colour: DUST, bright: 1, dim: .45 },
            // core column
            { count: 24, shape: "sphere", radius: .6, direction: [0, 1, 0], spread: .3, speed: [4, 10], life: [2, 3.2], delay: [0, .1], size: [.6, 1.7], grow: 3, drag: 2, lift: 1.4, swirl: .8, stretch: .04, colour: DUST, bright: 1, dim: .5 },
            // streak wisps
            { count: 26, shape: "ring", radius: .3, outward: [16, 24], direction: [0, 1, 0], spread: .3, speed: [0, .8], life: [.45, .9], size: [.15, .32], grow: 4, drag: 3.5, lift: 0, swirl: .2, stretch: .22, colour: DUST, bright: .7, dim: .6, shrink: .5, erode: .4 },
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
