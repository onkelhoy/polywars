import type { AudioMixer } from "@papit/audio";
import type { WeatherAudioOptions, WeatherAudioState } from "./types";
import { RAIN_WORKLET } from "./worklet";

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * Live rain (an AudioWorklet, see `worklet.ts`: every drop synthesised by surface) + wind. Outside rain is
 * muffled by `inside`; the cover you're under (roof / tent / vehicle) drums close. `state` is live, call
 * `update(dt)` each frame. Cost: one worklet, ~40-300 tiny voices at a time.
 */
export class WeatherAudio {
    readonly state: WeatherAudioState = { rain: 0, snow: 0, wind: .2, surfaces: { ground: 1 }, under: {}, inside: 0 };
    readonly ready: Promise<void>;
    private ctx: AudioContext;
    private out: GainNode;
    private muffle: BiquadFilterNode;
    private node?: AudioWorkletNode;
    private wind: { gain: GainNode; band: BiquadFilterNode };
    private time = 0;
    private sent = "";

    constructor(readonly options: WeatherAudioOptions) {
        const m: AudioMixer = options.mixer, ctx = this.ctx = m.context as AudioContext;
        this.out = ctx.createGain();
        this.out.connect(m.bus(options.bus ?? "ambience").gain);
        this.muffle = ctx.createBiquadFilter();
        this.muffle.type = "lowpass";
        this.muffle.frequency.value = 20000;
        this.muffle.connect(this.out);
        // wind: pinkish noise through a wandering band
        const n = ctx.sampleRate * 3, noise = ctx.createBuffer(2, n, ctx.sampleRate);
        for (let c = 0; c < 2; c++) { const x = noise.getChannelData(c); let b = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = b * .97 + w * .03; x[i] = b * 3; } }
        const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
        src.buffer = noise; src.loop = true;
        band.type = "bandpass"; band.frequency.value = 400; band.Q.value = 1.2;
        gain.gain.value = 0;
        src.connect(band).connect(gain).connect(this.muffle);
        src.start();
        this.wind = { gain, band };
        let ready = loaded.get(ctx);
        if (!ready)
        {
            const url = URL.createObjectURL(new Blob([RAIN_WORKLET], { type: "text/javascript" }));
            ready = ctx.audioWorklet.addModule(url);
            loaded.set(ctx, ready);
        }
        this.ready = ready.then(() => {
            const node = this.node = new AudioWorkletNode(ctx, "pw-rain", { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2] });
            node.connect(this.muffle, 0);
            node.connect(this.out, 1);
        });
    }

    update(dt: number) {
        const s = this.state, t = this.ctx.currentTime;
        this.time += dt;
        const gust = .6 + .4 * Math.sin(this.time * .23) * Math.sin(this.time * .61 + 1);
        const wind = s.wind * gust * (1 - s.snow * .3);
        this.wind.gain.gain.setTargetAtTime(wind * .5, t, .6);
        this.wind.band.frequency.setTargetAtTime(250 + wind * 700 + Math.sin(this.time * .37) * 120, t, .8);
        this.muffle.frequency.setTargetAtTime(20000 * Math.pow(.04, s.inside), t, .2);
        // only post when something changed
        const msg = { rain: s.snow > 0 ? s.rain * (1 - s.snow) : s.rain, surfaces: s.surfaces, over: s.under };
        const key = JSON.stringify(msg);
        if (this.node && key !== this.sent) { this.sent = key; this.node.port.postMessage(msg); }
    }

    destroy() { this.node?.disconnect(); this.out.disconnect(); }
}
