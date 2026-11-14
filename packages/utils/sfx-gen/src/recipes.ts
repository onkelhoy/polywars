import { ad, band, biquad, finish, mix, noise, random, reverb, ring, saturate } from "./dsp";
import type { Action, GunVoice, Scene, Surface } from "./types";

/** one rate for every file: plenty for a shot, half the bytes of 64k */
export const RATE = 32000;

const seconds = (s: number) => new Float32Array(Math.ceil(s * RATE));

/** The shot at the gun, no room: crack (supersonic), blast, body, boom, and the action's clack for self loaders. */
function dry(v: GunVoice, rnd: () => number) {
    const e = v.energy, out = seconds(.45), r = RATE;
    if (v.supersonic)
    {
        const crack = noise(seconds(.01), r, rnd, 0, .01, ad(.0001, .0007), 1.1);
        mix(out, biquad(crack, r, "highpass", 2500), 0, r);
    }
    const blast = noise(seconds(.08), r, rnd, 0, .08, ad(.0004, .004 + .012 * e), 1);
    mix(out, biquad(biquad(blast, r, "lowpass", 6500 - 3500 * e), r, "highpass", 90), .0005, r);
    const body = noise(seconds(.4), r, rnd, 0, .4, ad(.002, .035 + .09 * e), .9);
    mix(out, biquad(biquad(body, r, "lowpass", 700 + 500 * (1 - e)), r, "lowpass", 900), .001, r);
    ring(out, r, .001, 190 + 60 * (1 - e), .045 + .1 * e, .7 + .5 * e, 42 + 40 * (1 - e), .012 + .01 * e);
    if (v.action === "semi" || v.action === "auto" || v.action === "pistol") clack(out, .012 + rnd() * .004, 2600 * pitch(v), .12, rnd);
    return saturate(out, 1.6 + e);
}

/** a copy of `x`, lowpassed */
const dull = (x: Float32Array, f: number) => biquad(biquad(x.slice(), RATE, "lowpass", f), RATE, "lowpass", f);

/** A shot in a scene. Open: far echoes and a low roll. Walls: slaps back off near walls. Indoor: a dense short room. */
export function shot(v: GunVoice, scene: Scene, seed: number) {
    const rnd = random(seed), d = dry(v, rnd), e = v.energy, r = RATE;
    let out: Float32Array;
    if (scene === "open")
    {
        out = seconds(1.5);
        mix(out, d, 0, r);
        const far = dull(d, 650);
        for (let k = 0, t = .28 + rnd() * .2; k < 3; k++, t += .2 + rnd() * .35) mix(out, far, t, r, (.22 - k * .05) * (.6 + e * .6));
        const roll = noise(seconds(1.4), r, rnd, 0, 1.4, ad(.06, .25 + .35 * e), .5 * (.3 + e));
        mix(out, dull(roll, 220), .01, r);
        mix(out, reverb(dull(d, 2500), r, .95, 1.4, .75), 0, r, .1);
    }
    else if (scene === "walls")
    {
        out = seconds(1.1);
        mix(out, d, 0, r);
        const slap = dull(d, 3200);
        for (let k = 0; k < 4; k++) mix(out, slap, .035 + rnd() * .13, r, .38 - k * .05);
        mix(out, reverb(d, r, .6, .7, .5), 0, r, .3);
    }
    else
    {
        out = seconds(1);
        mix(out, dull(d, 7000), 0, r);
        const near = dull(d, 4500);
        for (let k = 0; k < 6; k++) mix(out, near, .004 + rnd() * .025, r, .45 - k * .04);
        ring(out, r, .002, 120, .12 + .1 * e, .4 * (.4 + e), 55, .02);
        mix(out, reverb(d, r, .3, .55, .3), 0, r, .7);
        saturate(out, 1.3);
    }
    // the files keep the guns' loudness against each other
    return finish(out, r, .55 + .4 * e);
}

/** lighter guns' parts ring higher */
const pitch = (v: GunVoice) => (v.kind === "pistol" ? 1.35 : v.kind === "smg" ? 1.15 : 1) * (v.action === "break" ? .75 : 1);

/** a metal on metal hit: a knock band and two ringing partials */
function clack(out: Float32Array, t: number, f: number, gain: number, rnd: () => number) {
    band(out, RATE, rnd, t, .05, f, 3, ad(.0003, .007), gain);
    ring(out, RATE, t, f * 1.73, .011, gain * .28, f * 1.73, .01, rnd() * 6);
    ring(out, RATE, t, f * 2.91, .006, gain * .15, f * 2.91, .01, rnd() * 6);
}

/** metal sliding on metal */
function scrape(out: Float32Array, t: number, length: number, f: number, gain: number, rnd: () => number) {
    band(out, RATE, rnd, t, length, f, 1.4, s => Math.sin(Math.PI * Math.min(1, s / length)) ** .7, gain);
}

/** The action's parts (bolt, magazine, slide, rounds): `cue` name -> one variant. */
export function part(v: GunVoice, cue: string, seed: number) {
    const rnd = random(seed), f = pitch(v) * (.94 + rnd() * .12), lever = v.action === "lever";
    const c = (t: number, hz: number, g: number) => clack(out, t, hz * f, g, rnd);
    const s = (t: number, l: number, hz: number, g: number) => scrape(out, t, l, hz * f, g, rnd);
    let out: Float32Array;
    switch (cue)
    {
        case "dry": out = seconds(.2); c(.004, 1800, .7); ring(out, RATE, .004, 4600 * f, .004, .2); break;
        case "bolt-open": out = seconds(.36); c(.01, 1100, 1); s(.05, lever ? .08 : .11, 2600, .35); c(lever ? .14 : .18, 900, .8); break;
        case "bolt-close": out = seconds(.36); s(0, lever ? .07 : .1, 2400, .35); c(.1, 1000, 1); c(.165, 1400, .7); break;
        case "mag-out": out = seconds(.26); c(0, 1600, .6); s(.02, .12, 1800, .25); break;
        case "mag-in": out = seconds(.3); s(0, .06, 1800, .25); c(.06, 900, 1); c(.076, 1500, .5); break;
        case "round-in": out = seconds(.2); c(0, 2400, .5); ring(out, RATE, 0, 5200 * f, .02, .15); break;
        case "clip-in": out = seconds(.42); s(0, .22, 3000, .3); for (const t of [.03, .09, .15, .2]) c(t, 2600, .3); c(.25, 900, .6); break;
        case "slide": out = seconds(.3); c(0, 1300, .8); c(.035, 1000, 1); ring(out, RATE, .035, 260 * f, .05, .15); break;
        default: throw new Error(`no part ${cue}`);
    }
    return finish(out, RATE, .5);
}

/** what every set has: the shot per scene and the parts */
export const PARTS = ["dry", "bolt-open", "bolt-close", "mag-out", "mag-in", "round-in", "clip-in", "slide"];
export const SCENES: Scene[] = ["open", "walls", "indoor"];
export const SURFACES: Surface[] = ["dirt", "stone", "wood", "metal"];

/** A spent case landing: the case's own ring over the surface's knock, a few bounces. */
export function brass(surface: Surface, seed: number) {
    const rnd = random(seed), out = seconds(.5), r = RATE, f = 3800 + rnd() * 1400;
    const look = {
        stone: { ring: .045, rg: 1, knock: 5000, kq: 2, kg: .3, bounces: 4 },
        metal: { ring: .08, rg: 1, knock: 900, kq: 6, kg: .5, bounces: 4 },
        wood: { ring: .014, rg: .4, knock: 700, kq: 3, kg: .9, bounces: 3 },
        dirt: { ring: .005, rg: .08, knock: 300, kq: 1, kg: 1, bounces: 2 },
    }[surface];
    let t = .005, gap = .07 + rnd() * .05, g = 1;
    for (let k = 0; k < look.bounces; k++)
    {
        for (const [m, d] of [[1, 1], [2.76, .6], [5.4, .35]]) ring(out, r, t, f * m, look.ring * d, look.rg * g / m, f * m, .01, rnd() * 6);
        band(out, r, rnd, t, .05, look.knock, look.kq, ad(.0004, surface === "dirt" ? .02 : .008), look.kg * g);
        t += gap; gap *= .55 + rnd() * .15; g *= .5;
    }
    if (surface === "dirt") biquad(out, r, "lowpass", 2200);
    return finish(out, r, .45);
}

/** the voice of a gun from its spec numbers: louder, lower, longer with more muzzle energy */
export function voice(kind: GunVoice["kind"], action: Action, caliber: string, speed: number): GunVoice {
    const special: Record<string, number> = { "22-lr": .04, "450-nitro": 1 };
    const energy = special[caliber] ?? Math.max(0, Math.min(1, (speed - 230) / 650 + (kind === "rifle" ? .1 : 0)));
    return { kind, action, energy, supersonic: speed > 360 };
}
