import { ad, biquad, finish, mix, noise, random, reverb, ring, saturate } from "./dsp";
import { RATE } from "./recipes";

/** how far / where an explosion is heard */
export type BoomScene = "near-open" | "near-walls" | "near-indoor" | "far" | "distant";
export const BOOM_SCENES: BoomScene[] = ["near-open", "near-walls", "near-indoor", "far", "distant"];
/** small: grenade, shell; big: bombs and up */
export type BoomSize = "small" | "big";

const seconds = (s: number) => new Float32Array(Math.ceil(s * RATE));
const low = (x: Float32Array, f: number) => biquad(biquad(x.slice(), RATE, "lowpass", f), RATE, "lowpass", f);

/** At the blast, no room: a hard crack, a roaring body, a sub thump that drops in pitch. */
function dry(big: boolean, rnd: () => number) {
    const r = RATE, out = seconds(big ? 2.4 : 1.4);
    const crack = noise(seconds(.05), r, rnd, 0, .05, ad(.0002, big ? .012 : .006), 1.2);
    mix(out, biquad(crack, r, "highpass", 1200), 0, r);
    const blast = noise(seconds(.3), r, rnd, 0, .3, ad(.0005, big ? .06 : .03), 1.1);
    mix(out, low(blast, big ? 2200 : 3500), .0005, r);
    const body = noise(seconds(big ? 2.2 : 1.2), r, rnd, 0, big ? 2.2 : 1.2, ad(.004, big ? .55 : .22), 1);
    mix(out, low(body, big ? 300 : 500), .002, r);
    ring(out, r, .001, big ? 70 : 110, big ? .7 : .3, 1.3, big ? 26 : 40, big ? .25 : .12);
    return saturate(out, big ? 3 : 2.4);
}

/** debris raining down after a near blast in the open: dirt patter */
function patter(out: Float32Array, start: number, length: number, rnd: () => number, gain: number) {
    for (let i = 0; i < 40; i++)
    {
        const t = start + rnd() ** .7 * length, tick = noise(seconds(.03), RATE, rnd, 0, .03, ad(.0005, .006), 1);
        mix(out, low(biquad(tick, RATE, "highpass", 600), 3000 + rnd() * 2000), t, RATE, gain * (.3 + rnd() * .7) * (1 - (t - start) / length));
    }
}

/**
 * One explosion as heard in `scene`. Near: the full blast with the space round it (echoes and a long roll in the open,
 * slaps off walls, a crushing dense room inside). Far: no crack, a low boom and rolling thunder. Distant: a deep thud and rumble.
 */
export function boom(size: BoomSize, scene: BoomScene, seed: number) {
    const rnd = random(seed), big = size === "big", r = RATE, d = dry(big, rnd);
    let out: Float32Array;
    if (scene === "near-open")
    {
        out = seconds(big ? 6 : 4);
        mix(out, d, 0, r);
        const far = low(d, 500);
        for (let k = 0, t = .35 + rnd() * .3; k < 4; k++, t += .3 + rnd() * .6) mix(out, far, t, r, .3 - k * .06);
        const roll = noise(seconds(big ? 5 : 3.5), r, rnd, 0, big ? 5 : 3.5, ad(.08, big ? 1.4 : .8), .7);
        mix(out, low(roll, 160), .02, r);
        patter(out, .5, big ? 3 : 2, rnd, big ? .25 : .18);
    }
    else if (scene === "near-walls")
    {
        out = seconds(big ? 5 : 3.5);
        mix(out, d, 0, r);
        const slap = low(d, 2800);
        for (let k = 0; k < 5; k++) mix(out, slap, .03 + rnd() * .16, r, .45 - k * .06);
        mix(out, reverb(d, r, .7, 1.4, .55), 0, r, .35);
        const roll = noise(seconds(3), r, rnd, 0, 3, ad(.05, .8), .5);
        mix(out, low(roll, 180), .02, r);
    }
    else if (scene === "near-indoor")
    {
        out = seconds(big ? 4 : 3);
        mix(out, low(d, 5000), 0, r);
        const near = low(d, 3500);
        for (let k = 0; k < 8; k++) mix(out, near, .003 + rnd() * .02, r, .5 - k * .04);
        ring(out, r, .002, 90, .4, .8, 45, .05);
        mix(out, reverb(d, r, .35, .9, .35), 0, r, .8);
        saturate(out, 2);
    }
    else if (scene === "far")
    {
        out = seconds(big ? 7 : 5);
        const thud = low(d, 380);
        mix(out, thud, 0, r, 1.2);
        // rolling thunder: the boom coming back off hills, later and duller
        for (let k = 0, t = .4 + rnd() * .4; k < 6; k++, t += .35 + rnd() * .8) mix(out, low(thud, 220 - k * 20), t, r, .5 - k * .07);
        const roll = noise(seconds(big ? 6 : 4.5), r, rnd, 0, big ? 6 : 4.5, ad(.25, big ? 2 : 1.3), .6);
        mix(out, low(roll, 120), .05, r);
    }
    else
    {
        out = seconds(big ? 8 : 6);
        const thud = low(low(d, 140), 140);
        mix(out, thud, 0, r, 1.6);
        for (let k = 0, t = .6 + rnd() * .5; k < 5; k++, t += .5 + rnd() * 1) mix(out, thud, t, r, .45 - k * .07);
        const roll = noise(seconds(big ? 7 : 5.5), r, rnd, 0, big ? 7 : 5.5, ad(.6, big ? 2.6 : 1.8), .5);
        mix(out, low(roll, 70), .1, r);
    }
    // the files keep near loud and far quiet against each other (the game scales by power and distance on top)
    return finish(out, r, scene.startsWith("near") ? .95 : scene === "far" ? .7 : .5, .2);
}

/** ears ringing after a close blast: a high whine that fades */
export function tinnitus(seed: number) {
    const rnd = random(seed), out = seconds(5), f = 3600 + rnd() * 900;
    ring(out, RATE, 0, f, 2.2, .3, f * .98, 3);
    ring(out, RATE, 0, f * 1.5, 1.2, .08, f * 1.49, 3);
    return finish(out, RATE, .4, .5);
}
