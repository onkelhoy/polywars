import type { AudioMixer } from "@papit/audio";
import type { Surfaces, WeatherAudioOptions, WeatherAudioState } from "./types";

type Surface = keyof Surfaces;
/** per surface: drop band centre Hz, spread, Q, grain ms, loudness, bed tilt Hz */
const SURFACE: Record<Surface, { f: number; spread: number; q: number; ms: number; gain: number; bed: number }> = {
    ground: { f: 1400, spread: .5, q: 1.2, ms: 6, gain: .5, bed: 2200 },
    leaves: { f: 3200, spread: .6, q: 1.5, ms: 4, gain: .7, bed: 4200 },
    roof: { f: 2600, spread: .3, q: 9, ms: 25, gain: .9, bed: 3000 },
    water: { f: 1800, spread: .5, q: 14, ms: 30, gain: .5, bed: 1600 },
    vehicle: { f: 900, spread: .4, q: 6, ms: 35, gain: 1, bed: 1800 },
};

/**
 * Rain, drips and wind, all generated (no files). Rain = a hiss bed + a low roar (dense) + single drops scheduled
 * as tiny grains (mild rain is mostly drops you can count), coloured by what they hit. Wind = noise through a
 * wandering band with gusts. Call `update(dt)` every frame; `state` is live.
 */
export class WeatherAudio {
    readonly state: WeatherAudioState = { rain: 0, snow: 0, wind: .2, surfaces: { ground: 1 }, inside: 0 };
    private ctx: AudioContext;
    private out: GainNode;
    private muffle: BiquadFilterNode;
    private hiss: { gain: GainNode; band: BiquadFilterNode };
    private roar: GainNode;
    private wind: { gain: GainNode; band: BiquadFilterNode };
    private noise: AudioBuffer;
    private carry = 0;
    private drip = 0;
    private time = 0;

    constructor(readonly options: WeatherAudioOptions) {
        const m: AudioMixer = options.mixer, ctx = this.ctx = m.context as AudioContext;
        const bus = m.bus(options.bus ?? "ambience").gain;
        this.muffle = ctx.createBiquadFilter();
        this.muffle.type = "lowpass";
        this.muffle.frequency.value = 20000;
        this.out = ctx.createGain();
        this.out.connect(this.muffle).connect(bus);
        const n = ctx.sampleRate * 3;
        this.noise = ctx.createBuffer(2, n, ctx.sampleRate);
        for (let c = 0; c < 2; c++)
        {
            // pinkish: a running sum leak tilts it warmer
            const x = this.noise.getChannelData(c);
            let b = 0;
            for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = b * .7 + w * .3; x[i] = w * .5 + b * .8; }
        }
        const loop = (...chain: AudioNode[]) => {
            const s = ctx.createBufferSource();
            s.buffer = this.noise; s.loop = true; s.loopStart = Math.random();
            let at: AudioNode = s;
            for (const c of chain) at = at.connect(c);
            at.connect(this.out);
            s.start(0, Math.random() * 2);
        };
        const band = (type: BiquadFilterType, f: number, q = .7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
        const gain = () => { const g = ctx.createGain(); g.gain.value = 0; return g; };
        this.hiss = { band: band("bandpass", 3000, .6), gain: gain() };
        loop(band("highpass", 700), this.hiss.band, this.hiss.gain);
        this.roar = gain();
        loop(band("lowpass", 700), band("highpass", 120), this.roar);
        this.wind = { band: band("bandpass", 400, 1.4), gain: gain() };
        loop(band("lowpass", 1800), this.wind.band, this.wind.gain);
    }

    update(dt: number) {
        const s = this.state, t = this.ctx.currentTime, k = Math.min(1, Math.max(0, s.rain));
        this.time += dt;
        const w = weights(s.surfaces);
        const bed = w.reduce((a, [name, v]) => a + SURFACE[name].bed * v, 0);
        // bed: barely there in a drizzle, a wall of hiss in a downpour
        this.hiss.gain.gain.setTargetAtTime(Math.pow(k, 1.6) * .35, t, .3);
        this.hiss.band.frequency.setTargetAtTime(bed, t, .5);
        this.roar.gain.setTargetAtTime(Math.pow(k, 2.5) * .45 + s.inside * k * .2, t, .4);
        // wind: wandering band + gusts, hushed under snow
        const gust = .6 + .4 * Math.sin(this.time * .23) * Math.sin(this.time * .61 + 1);
        const wind = s.wind * gust * (1 - s.snow * .3);
        this.wind.gain.gain.setTargetAtTime(wind * .5, t, .6);
        this.wind.band.frequency.setTargetAtTime(250 + wind * 700 + Math.sin(this.time * .37) * 120, t, .8);
        this.muffle.frequency.setTargetAtTime(20000 - s.inside * 18500, t, .2);
        // drops: mild = a few countable taps, dense = hundreds (the bed covers them)
        if (k > .005)
        {
            this.carry += dt * (6 + 260 * k * k);
            let n = Math.min(40, Math.floor(this.carry));
            this.carry -= n;
            for (; n > 0; n--) this.grain(pick(w), t + Math.random() * dt, .15 + Math.random() * .85, (1 - Math.pow(k, 1.5) * .5));
        }
        // close drips off eaves / leaves after a while of rain, they go on a bit after it stops
        this.drip += dt * (k > .1 ? .6 + k : 0);
        if (this.drip > 1 && Math.random() < dt * 2) { this.drip = 0; this.plip(t, .35 + Math.random() * .3); }
    }

    /** one drop: a noise grain through the surface's band, panned at random */
    private grain(surface: Surface, at: number, level: number, loud: number) {
        const ctx = this.ctx, d = SURFACE[surface], ms = d.ms * (.6 + Math.random() * .8) / 1000;
        if (surface === "water" && Math.random() < .5) return this.plip(at, level * .25);
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = d.f * (1 + (Math.random() * 2 - 1) * d.spread);
        band.Q.value = d.q;
        const g = ctx.createGain(), pan = ctx.createStereoPanner();
        pan.pan.value = Math.random() * 2 - 1;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(level * d.gain * loud * .5, at + .001);
        g.gain.exponentialRampToValueAtTime(.0001, at + ms);
        src.connect(band).connect(g).connect(pan).connect(this.out);
        src.start(at, Math.random() * 2.5, ms + .01);
    }

    /** a drop into water / a close drip: a short sine that bends up */
    private plip(at: number, level: number) {
        const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), pan = ctx.createStereoPanner();
        const f = 900 + Math.random() * 1600;
        o.frequency.setValueAtTime(f, at);
        o.frequency.exponentialRampToValueAtTime(f * 1.8, at + .04);
        pan.pan.value = Math.random() * 1.6 - .8;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(level * .2, at + .002);
        g.gain.exponentialRampToValueAtTime(.0001, at + .06);
        o.connect(g).connect(pan).connect(this.out);
        o.start(at); o.stop(at + .08);
    }

    destroy() { this.out.disconnect(); }
}

function weights(s: Surfaces): [Surface, number][] {
    const e = (Object.entries(s) as [Surface, number][]).filter(([, v]) => v > 0);
    const sum = e.reduce((a, [, v]) => a + v, 0) || 1;
    return e.length ? e.map(([k, v]) => [k, v / sum]) : [["ground", 1]];
}
function pick(w: [Surface, number][]): Surface {
    let r = Math.random();
    for (const [k, v] of w) if ((r -= v) <= 0) return k;
    return w[0][0];
}
