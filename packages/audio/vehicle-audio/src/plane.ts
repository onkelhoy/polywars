import type { AudioMixer } from "@papit/audio";
import { EngineSound, noiseBuffer } from "./engine";

export type PlaneState = {
    /** engine rev / min */
    rpm: number;
    /** 0..1 */
    load: number;
    /** m/s through the air (wind roar) */
    airspeed: number;
    /** 3 blade prop turns at rpm x this. Default .48 */
    gearing?: number;
    position?: ArrayLike<number>;
};

/**
 * A fighter: a V12 (`EngineSound`, 12 cylinders, open exhaust), the prop's blade buzz (3 blades) beating on it, and the
 * wind roar that grows with the air speed (louder than the engine in a dive).
 */
export class PlaneSound {
    readonly engine: EngineSound;
    private ctx: BaseAudioContext;
    private nodes: AudioNode[] = [];
    private blade: OscillatorNode;
    private bladeGain: GainNode;
    private wind: BiquadFilterNode;
    private windGain: GainNode;
    private out: GainNode;

    constructor(mixer: AudioMixer, readonly volume = .8, bus = "sfx") {
        this.engine = new EngineSound({ mixer, bus, cylinders: 12, muffle: [600, 4200], revs: [700, 3000], volume: .7 * volume });
        const ctx = this.ctx = mixer.context, keep = <T extends AudioNode>(n: T) => (this.nodes.push(n), n);
        this.out = keep(new GainNode(ctx, { gain: 0 }));
        this.out.connect(this.engine.panner);
        const soft = keep(new BiquadFilterNode(ctx, { type: "lowpass", frequency: 900, Q: .7 }));
        soft.connect(this.out);
        this.blade = keep(new OscillatorNode(ctx, { type: "triangle", frequency: 40 }));
        this.bladeGain = keep(new GainNode(ctx, { gain: 0 }));
        this.blade.connect(this.bladeGain).connect(soft);
        const noise = keep(new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx), loop: true }));
        this.wind = keep(new BiquadFilterNode(ctx, { type: "bandpass", frequency: 400, Q: .5 }));
        this.windGain = keep(new GainNode(ctx, { gain: 0 }));
        noise.connect(this.wind).connect(this.windGain).connect(this.out);
        this.blade.start(); noise.start();
        this.out.gain.setTargetAtTime(volume, ctx.currentTime, .3);
    }

    update(s: PlaneState) {
        const t = this.ctx.currentTime, k = .05;
        this.engine.update({ rpm: s.rpm, load: s.load, position: s.position });
        const pass = s.rpm / 60 * (s.gearing ?? .48) * 3;
        this.blade.frequency.setTargetAtTime(Math.max(1, pass), t, k);
        this.bladeGain.gain.setTargetAtTime(s.rpm > 0 ? .12 + .2 * s.load : 0, t, k);
        const v = Math.min(1, s.airspeed / 200);
        this.wind.frequency.setTargetAtTime(250 + 1400 * v, t, k);
        this.windGain.gain.setTargetAtTime(v * v * 1.4, t, k);
    }

    stop(fade = .8) {
        this.engine.stop(fade);
        this.out.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
        setTimeout(() => { for (const n of this.nodes) { if (n instanceof AudioScheduledSourceNode) try { n.stop(); } catch { /* */ } n.disconnect(); } this.nodes = []; }, fade * 1000 + 50);
    }
}
