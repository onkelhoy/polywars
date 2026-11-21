import type { AudioMixer } from "@papit/audio";



export type EngineSoundSetting = {
    mixer: AudioMixer;
    /** bus to play on. Default "sfx" */
    bus?: string;
    /** cylinders (4-stroke: firing rate = rpm / 60 x cylinders / 2). Default 4 */
    cylinders?: number;
    /** overall volume. Default .6 */
    volume?: number;
    /** low pass cut-off at idle / redline, Hz: the muffler. Defaults 500 / 2600 */
    muffle?: [number, number];
    /** track clatter loudness (tank: steel links on the wheels), 0 off. Default 0 */
    clatter?: number;
    /** rpm span for the brightness: [idle, top]. Default [700, 4000] */
    revs?: [number, number];
};

export type EngineState = {
    /** rev / min */
    rpm: number;
    /** throttle the engine gets, 0..1 (0 in a shift cut: the engine note drops) */
    load: number;
    /** tyre slip 0..1 (skid hiss) */
    slip?: number;
    /** where the car is (3D) */
    position?: ArrayLike<number>;
    /** tracks' speed, m/s (clatter rate) and turn 0..1 (the squeal of skidding links) */
    tracks?: number;
    turn?: number;
};

/**
 * A live engine: a lumpy firing tone (saw + half rate square, amplitude pulsed at the firing rate), exhaust rasp
 * (noise round the firing harmonics) and a tyre skid hiss. Pitch follows `rpm`, loudness / brightness `load`,
 * so a shift (rpm falls, load cut then eased back) is heard by itself. No samples: tune by the settings.
 */
export class EngineSound {
    private ctx: BaseAudioContext;
    private nodes: AudioNode[] = [];
    private saw: OscillatorNode;
    private sub: OscillatorNode;
    private pulse: OscillatorNode;
    private pulseDepth: GainNode;
    private body: GainNode;
    private rasp: BiquadFilterNode;
    private raspGain: GainNode;
    private filter: BiquadFilterNode;
    private skid: GainNode;
    private master: GainNode;
    readonly panner: PannerNode;
    private links?: OscillatorNode;
    private teeth?: OscillatorNode;
    private clank?: GainNode;
    private squeal?: GainNode;
    private s: Required<Omit<EngineSoundSetting, "mixer">>;

    constructor(readonly setting: EngineSoundSetting) {
        this.s = { bus: "sfx", cylinders: 4, volume: .6, muffle: [500, 2600], clatter: 0, revs: [700, 4000], ...setting };
        const ctx = this.ctx = setting.mixer.context;
        const keep = <T extends AudioNode>(n: T) => (this.nodes.push(n), n);

        this.panner = keep(new PannerNode(ctx, { panningModel: "equalpower", distanceModel: "inverse", refDistance: 4, maxDistance: 400, rolloffFactor: 1 }));
        this.panner.connect(setting.mixer.bus(this.s.bus).gain);
        this.master = keep(new GainNode(ctx, { gain: 0 }));
        this.master.connect(this.panner);
        this.filter = keep(new BiquadFilterNode(ctx, { type: "lowpass", frequency: this.s.muffle[0], Q: 1.2 }));
        this.filter.connect(this.master);

        // tone: saw + a half rate square (the uneven firing), pulsed at the firing rate
        this.body = keep(new GainNode(ctx, { gain: .5 }));
        this.body.connect(this.filter);
        this.saw = keep(new OscillatorNode(ctx, { type: "sawtooth", frequency: 30 }));
        this.sub = keep(new OscillatorNode(ctx, { type: "square", frequency: 15 }));
        const sawGain = keep(new GainNode(ctx, { gain: .35 })), subGain = keep(new GainNode(ctx, { gain: .25 }));
        this.saw.connect(sawGain).connect(this.body);
        this.sub.connect(subGain).connect(this.body);
        this.pulse = keep(new OscillatorNode(ctx, { type: "sine", frequency: 30 }));
        this.pulseDepth = keep(new GainNode(ctx, { gain: .35 }));
        this.pulse.connect(this.pulseDepth).connect(this.body.gain);

        // exhaust rasp: noise through a band pass that follows the firing harmonics
        const noise = keep(new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx), loop: true }));
        this.rasp = keep(new BiquadFilterNode(ctx, { type: "bandpass", frequency: 120, Q: 2 }));
        this.raspGain = keep(new GainNode(ctx, { gain: 0 }));
        noise.connect(this.rasp).connect(this.raspGain).connect(this.filter);

        // tyre skid: brighter noise, straight to the master (not muffled)
        const hiss = keep(new BiquadFilterNode(ctx, { type: "bandpass", frequency: 1100, Q: .8 }));
        this.skid = keep(new GainNode(ctx, { gain: 0 }));
        noise.connect(hiss).connect(this.skid).connect(this.master);

        const sources: AudioScheduledSourceNode[] = [this.saw, this.sub, this.pulse, noise];
        // tracks: each link hitting a wheel is a click (a narrow pulse wave gating metallic noise: three hard
        // ringing bands), the sprocket teeth a slower heavy clunk, and a steel squeal (bending, wobbling) while
        // the tracks skid round a turn
        if (this.s.clatter > 0)
        {
            const n = 24, re = new Float32Array(n + 1), im = new Float32Array(n + 1);
            for (let i = 1; i <= n; i++) re[i] = 1 - i / (n + 2);
            const click = ctx.createPeriodicWave(re, im, { disableNormalization: false });
            this.clank = keep(new GainNode(ctx, { gain: 0 }));
            const gate = keep(new GainNode(ctx, { gain: 0 }));
            this.links = keep(new OscillatorNode(ctx, { frequency: 1 }));
            this.links.setPeriodicWave(click);
            const depth = keep(new GainNode(ctx, { gain: 1 }));
            this.links.connect(depth).connect(gate.gain);
            for (const [f, q, g] of [[880, 14, 1], [2350, 18, .8], [4100, 20, .5], [140, 1, .9]])
            {
                const band = keep(new BiquadFilterNode(ctx, { type: f < 200 ? "lowpass" : "bandpass", frequency: f, Q: q }));
                const level = keep(new GainNode(ctx, { gain: g * (f < 200 ? 1 : 3) }));
                noise.connect(band).connect(level).connect(gate);
            }
            gate.connect(this.clank).connect(this.master);
            // sprocket: a low clunk at a fifth of the link rate
            this.teeth = keep(new OscillatorNode(ctx, { frequency: .2 }));
            this.teeth.setPeriodicWave(click);
            const clunkGate = keep(new GainNode(ctx, { gain: 0 })), clunkBand = keep(new BiquadFilterNode(ctx, { type: "bandpass", frequency: 320, Q: 6 }));
            this.teeth.connect(clunkGate.gain);
            noise.connect(clunkBand).connect(clunkGate).connect(this.clank);
            // squeal: two saws through a narrow band, the pitch wobbling and bending
            this.squeal = keep(new GainNode(ctx, { gain: 0 }));
            const squealBand = keep(new BiquadFilterNode(ctx, { type: "bandpass", frequency: 2600, Q: 6 }));
            const wobble = keep(new OscillatorNode(ctx, { type: "sine", frequency: 5.5 })), wobbleDepth = keep(new GainNode(ctx, { gain: 70 }));
            wobble.connect(wobbleDepth);
            for (const f of [1380, 1415])
            {
                const o = keep(new OscillatorNode(ctx, { type: "sawtooth", frequency: f }));
                wobbleDepth.connect(o.frequency);
                o.connect(squealBand);
                sources.push(o);
            }
            squealBand.connect(this.squeal).connect(this.master);
            sources.push(this.links, this.teeth, wobble);
        }
        for (const o of sources) o.start();
        this.master.gain.setTargetAtTime(this.s.volume, ctx.currentTime, .3);
    }

    update(state: EngineState) {
        const t = this.ctx.currentTime, k = .04;
        const firing = state.rpm / 60 * this.s.cylinders / 2;
        const load = Math.max(0, Math.min(1, state.load));
        const [r0, r1] = this.s.revs, rev = Math.max(0, Math.min(1, (state.rpm - r0) / (r1 - r0)));
        this.saw.frequency.setTargetAtTime(firing, t, k);
        this.sub.frequency.setTargetAtTime(firing / 2, t, k);
        this.pulse.frequency.setTargetAtTime(firing, t, k);
        this.pulseDepth.gain.setTargetAtTime(.25 + .2 * (1 - rev), t, k);
        this.rasp.frequency.setTargetAtTime(firing * 3, t, k);
        this.raspGain.gain.setTargetAtTime(.05 + .45 * load * (.4 + rev), t, k);
        this.body.gain.setTargetAtTime(.35 + .35 * load + .15 * rev, t, k);
        const [lo, hi] = this.s.muffle;
        this.filter.frequency.setTargetAtTime(lo + (hi - lo) * (.25 * rev + .75 * rev * load + .1 * load), t, k);
        this.skid.gain.setTargetAtTime(Math.min(1, state.slip ?? 0) * .5, t, .05);
        if (this.links && this.clank && this.squeal)
        {
            const v = Math.abs(state.tracks ?? 0);
            // ~6 links per metre
            this.links.frequency.setTargetAtTime(Math.max(.5, v * 6), t, k);
            this.teeth?.frequency.setTargetAtTime(Math.max(.1, v * 1.2), t, k);
            this.clank.gain.setTargetAtTime(this.s.clatter * Math.min(1, .15 + v / 2.5), t, .08);
            this.squeal.gain.setTargetAtTime(.14 * Math.min(1, state.turn ?? 0) * Math.min(1, v / 1.5 + .4), t, .2);
        }
        if (state.position)
        {
            const p = this.panner, x = state.position[0], y = state.position[1], z = state.position[2];
            if (p.positionX) { p.positionX.setTargetAtTime(x, t, .02); p.positionY.setTargetAtTime(y, t, .02); p.positionZ.setTargetAtTime(z, t, .02); }
            else p.setPosition(x, y, z);
        }
    }

    /** fade out and free the nodes */
    stop(fade = .3) {
        const t = this.ctx.currentTime;
        this.master.gain.setTargetAtTime(0, t, fade / 3);
        setTimeout(() => {
            for (const n of this.nodes)
            {
                if (n instanceof AudioScheduledSourceNode) try { n.stop(); } catch { /* not started */ }
                n.disconnect();
            }
            this.nodes = [];
        }, fade * 1000 + 50);
    }
}

let shared: AudioBuffer | undefined;
function noiseBuffer(ctx: BaseAudioContext) {
    if (shared && shared.sampleRate === ctx.sampleRate) return shared;
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    // slightly pink: smoother than white
    for (let i = 0; i < d.length; i++) { last = last * .6 + (Math.random() * 2 - 1) * .4; d[i] = last * 1.6; }
    return shared = b;
}

/** presets (spread into the setting): a WW2 V-twin bike (2 cylinders, thin muffler, brighter) */
export const ENGINES = {
    jeep: {},
    bike: { cylinders: 2, muffle: [750, 3800] as [number, number], volume: .5 },
    /** WW2 tank: a big slow V12 (low, heavy muffled), steel tracks clattering */
    tank: { cylinders: 12, muffle: [170, 950] as [number, number], volume: 1.15, clatter: .7, revs: [500, 2600] as [number, number] },
} satisfies Record<string, Partial<EngineSoundSetting>>;
