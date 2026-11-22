import type { AudioMixer } from "@papit/audio";
import type { WeatherAudioOptions, WeatherAudioState } from "./types";
import { RAIN_WORKLET } from "./worklet";

type Bed = { gain: GainNode };
const OUTSIDE = ["ground-light", "ground-heavy", "water", "leaves", "wind-light", "wind-strong"];
const UNDER = ["tent", "roof", "vehicle-light", "vehicle-heavy", "wind-inside"];
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * Weather sound from CC0 recordings (`assets/audio/weather`): looping beds crossfaded by rain intensity, ground,
 * what you're under (tent / tin roof / car, heard close) and wind; the outside is muffled by `inside`.
 * Thunder: `thunder(distance, pan)` (near = a crack, far = a roll, late by the speed of sound, duller with distance),
 * or random strikes from `state.storm`. `state` is live; call `update(dt)` each frame.
 */
export class WeatherAudio {
    readonly state: WeatherAudioState = { rain: 0, snow: 0, wind: .2, surfaces: { ground: 1 }, under: {}, inside: 0, storm: 0, detail: 0 };
    readonly ready: Promise<void>;
    private ctx: AudioContext;
    private out: GainNode;
    private outside: GainNode;
    private muffle: BiquadFilterNode;
    private beds: Record<string, Bed> = {};
    private buffers: Record<string, AudioBuffer> = {};
    private near: string[] = [];
    private far: string[] = [];
    private strikes: string[] = [];
    private node?: AudioWorkletNode;
    private detail: GainNode;
    private nextStrike = 5;
    private sent = "";

    constructor(readonly options: WeatherAudioOptions) {
        const m: AudioMixer = options.mixer, ctx = this.ctx = m.context as AudioContext;
        this.out = ctx.createGain();
        this.out.connect(m.bus(options.bus ?? "ambience").gain);
        this.muffle = ctx.createBiquadFilter();
        this.muffle.type = "lowpass";
        this.muffle.frequency.value = 20000;
        this.outside = ctx.createGain();
        this.outside.connect(this.muffle).connect(this.out);
        this.detail = ctx.createGain();
        this.detail.gain.value = 0;
        this.detail.connect(this.out);
        const base = options.base ?? "/assets/audio/weather/";
        this.ready = fetch(`${base}sounds.json`).then(r => r.json()).then(async (set: { sounds: Record<string, { kind: string }> }) => {
            await Promise.all(Object.entries(set.sounds).map(async ([name, s]) => {
                const data = await fetch(`${base}${name}.m4a`).then(r => r.arrayBuffer());
                this.buffers[name] = await ctx.decodeAudioData(data);
                if (s.kind === "near") this.near.push(name);
                if (s.kind === "far") this.far.push(name);
                if (s.kind === "strike") this.strikes.push(name);
            }));
            for (const name of [...OUTSIDE, ...UNDER])
            {
                const b = this.buffers[name];
                if (!b) continue;
                const src = ctx.createBufferSource(), gain = ctx.createGain();
                src.buffer = b; src.loop = true;
                gain.gain.value = 0;
                src.connect(gain).connect(OUTSIDE.includes(name) ? this.outside : this.out);
                src.start(0, Math.random() * b.duration);
                this.beds[name] = { gain };
            }
        });
    }

    /**
     * Thunder `distance` m away, `pan` -1 left .. 1 right; returns the delay s until it's heard. Under ~800 m: a
     * recorded close strike (the crack + bang, the air round the channel bursting); to 1.5 km a near clap;
     * further a low roll. Late by the speed of sound, duller and quieter with distance; the rain ducks under it.
     */
    thunder(distance: number, pan = 0) {
        const ctx = this.ctx, d = Math.max(0, distance), delay = d / (this.options.sound ?? 343);
        const list = d < 800 && this.strikes.length ? this.strikes : d < 1500 && this.near.length ? this.near : this.far.length ? this.far : this.near;
        if (!list.length) return delay;
        const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
        src.buffer = this.buffers[list[Math.floor(Math.random() * list.length)]];
        // air eats the highs: a crack overhead, a low roll from kilometres away
        lp.type = "lowpass";
        lp.frequency.value = Math.max(220, 18000 * Math.exp(-d / 1800));
        src.playbackRate.value = d > 6000 ? .85 + Math.random() * .1 : .95 + Math.random() * .1;
        g.gain.value = list === this.strikes ? 2.6 / (1 + d / 400) + .6 : Math.min(2.5, 2.5 / (1 + d / 1200));
        p.pan.value = Math.max(-1, Math.min(1, pan)) * (d < 3000 ? .7 : .4);
        src.connect(lp).connect(g).connect(p).connect(this.outside);
        src.start(ctx.currentTime + delay);
        // close: the rain ducks under it
        if (d < 3000) { const r = this.outside.gain, k = .35 + .65 * d / 3000, t = ctx.currentTime + delay; r.cancelScheduledValues(t); r.setTargetAtTime(r.value * k, t, .02); r.setTargetAtTime(1 - this.state.inside * .45, t + .6, 1.2); }
        return delay;
    }

    update(dt: number) {
        const s = this.state, t = this.ctx.currentTime, k = Math.max(0, Math.min(1, s.rain * (1 - s.snow)));
        const set = (name: string, v: number) => this.beds[name]?.gain.gain.setTargetAtTime(Math.max(0, v), t, .4);
        const sum = Object.values(s.surfaces).reduce((a, b) => a + (b ?? 0), 0) || 1;
        const w = (n: "ground" | "leaves" | "water") => (s.surfaces[n] ?? 0) / sum;
        // light bed in a drizzle, the heavy one takes over in a downpour
        const light = Math.sqrt(k) * (1 - k * .6), heavy = Math.pow(k, 1.4);
        set("ground-light", light * 1.1 * (w("ground") + w("leaves") * .4));
        set("ground-heavy", heavy * 1.2 * (w("ground") + w("water") * .3 + w("leaves") * .5));
        set("water", (light * .8 + heavy) * w("water"));
        set("leaves", (light + heavy) * 1.2 * w("leaves"));
        const u = s.under;
        set("tent", (light * 1.4 + heavy * 1.2) * (u.tent ?? 0));
        set("roof", (light * 1.2 + heavy) * (u.roof ?? 0));
        set("vehicle-light", light * 1.3 * (u.vehicle ?? 0));
        set("vehicle-heavy", heavy * 1.2 * (u.vehicle ?? 0));
        const wind = s.wind * (1 - s.snow * .3);
        set("wind-light", Math.min(1, wind * 2) * (1 - wind) * (1 - s.inside) * .9);
        set("wind-strong", Math.pow(wind, 1.5) * (1 - s.inside * .7));
        set("wind-inside", wind * s.inside * .8);
        // shut in: the outside goes dull and quieter
        this.muffle.frequency.setTargetAtTime(20000 * Math.pow(.03, s.inside), t, .2);
        this.outside.gain.setTargetAtTime(1 - s.inside * .45, t, .2);
        // storm: strikes now and then, nearer and more often the stronger
        if (s.storm > .01)
        {
            this.nextStrike -= dt * (.3 + s.storm * 1.7);
            if (this.nextStrike <= 0)
            {
                this.nextStrike = 4 + Math.random() * 16;
                const distance = 300 + Math.pow(Math.random(), 1 + s.storm * 2) * 14000 * (1.2 - s.storm * .6), pan = Math.random() * 2 - 1;
                const delay = this.thunder(distance, pan);
                this.options.onstrike?.({ distance, pan, delay });
            }
        }
        this.live(k);
    }

    /** the synthesised close drops, made only when `detail` > 0 */
    private live(k: number) {
        const s = this.state, ctx = this.ctx;
        this.detail.gain.setTargetAtTime(s.detail, ctx.currentTime, .3);
        if (s.detail <= 0 && !this.node) return;
        if (!this.node && !loaded.has(ctx))
        {
            const url = URL.createObjectURL(new Blob([RAIN_WORKLET], { type: "text/javascript" }));
            loaded.set(ctx, ctx.audioWorklet.addModule(url).then(() => {
                this.node = new AudioWorkletNode(ctx, "pw-rain", { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2] });
                this.node.connect(this.detail, 0);
                this.node.connect(this.detail, 1);
            }));
        }
        const msg = JSON.stringify({ rain: s.detail > 0 ? k : 0, surfaces: s.surfaces, over: s.under });
        if (this.node && msg !== this.sent) { this.sent = msg; this.node.port.postMessage(JSON.parse(msg)); }
    }

    destroy() { this.node?.disconnect(); this.out.disconnect(); }
}
