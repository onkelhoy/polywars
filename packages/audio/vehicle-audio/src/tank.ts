import type { AudioMixer } from "@papit/audio";
import { noiseBuffer } from "./engine";

/**
 * Every number of the tank sound, so it can be tuned by ear. Rebuilt from two reference recordings (a tank driving,
 * a turret turning): measured spectrum + rhythm, no samples.
 */
export type TankSoundLook = {
    volume: number;
    engine: {
        /** firing rate, Hz, at idle / full revs (recording: ~60 Hz moving) */
        firing: [number, number];
        /** harmonic levels 1.. of the firing rate (recording: strongest 2-7, i.e. 120-420 Hz) */
        harmonics: number[];
        /** uneven firing: level wobble at firing / `lumpDiv` (recording ~19 Hz), depth 0..1 */
        lumpDiv: number;
        lump: number;
        /** low pass at idle / full load, Hz (recording falls off steeply over ~1.5 kHz) */
        muffle: [number, number];
        /** exhaust rasp: noise round `raspAt` Hz, gated at the firing rate (recording: 5-12 kHz pulsing at ~62 Hz) */
        rasp: number;
        raspAt: number;
        level: number;
    };
    tracks: {
        /** link clicks per metre of track (recording: 15.5 Hz) */
        links: number;
        /** clicks: noise band (centre Hz, Q) and level (recording: 1.5-5 kHz, broad) */
        click: [number, number];
        clickLevel: number;
        /** link slap: lower band, slower (share of the click rate) + random (recording: 400-1500 Hz at 4-12 Hz) */
        slap: [number, number];
        slapRate: number;
        slapLevel: number;
        /** track + road rumble under it, low pass Hz */
        rumble: number;
        rumbleLevel: number;
        /** m/s where the tracks are at full loudness */
        full: number;
    };
    /** hull turning (skid steer): tracks scrubbing sideways, a grinding band */
    turn: { band: [number, number]; level: number };
    /** turret traverse motor (recording: 800 + 1600 Hz whine, ~50 Hz roughness, gear hiss ~2.4 kHz) */
    turret: {
        tones: [number, number][];
        rough: number;
        roughDepth: number;
        hiss: [number, number];
        hissLevel: number;
        level: number;
        /** rad / s of traverse at full loudness / pitch */
        full: number;
    };
};

export const TANK_SOUND: TankSoundLook = {
    volume: 1,
    engine: {
        firing: [42, 70], harmonics: [.5, 1, .9, 1, .7, .6, .5, .3, .22, .16, .12, .08, .05],
        lumpDiv: 3.2, lump: .35, muffle: [550, 1300], rasp: .08, raspAt: 6500, level: .55,
    },
    tracks: {
        links: 3.7, click: [2600, .8], clickLevel: .9, slap: [800, 1.1], slapRate: .3, slapLevel: .7,
        rumble: 140, rumbleLevel: .6, full: 4,
    },
    turn: { band: [420, 1.1], level: .12 },
    turret: {
        tones: [[400, .6], [800, .45], [575, .2]], rough: 50, roughDepth: .6,
        hiss: [1300, 1], hissLevel: .2, level: .1, full: .35,
    },
};

export type TankSoundState = {
    /** 0..1 idle .. full revs */
    rev: number;
    /** 0..1 throttle */
    load: number;
    /** track speed, m/s (either sign) */
    tracks: number;
    /** 0..1 how hard the hull turns */
    turn: number;
    /** turret traverse, rad / s (either sign) */
    turret: number;
    position?: ArrayLike<number>;
};

/**
 * A tank: diesel engine (additive harmonics of the firing rate, uneven, muffled), steel tracks (link clicks + slap +
 * rumble, rate from the track speed), the scrub of a skid turn, and the turret motor whine. One panner for the lot.
 */
export class TankSound {
    readonly panner: PannerNode;
    private ctx: BaseAudioContext;
    private nodes: AudioNode[] = [];
    private master: GainNode;
    private engine: OscillatorNode;
    private lumpOsc: OscillatorNode;
    private engineFilter: BiquadFilterNode;
    private engineGain: GainNode;
    private raspGate: OscillatorNode;
    private clickOsc: OscillatorNode;
    private slapOsc: OscillatorNode;
    private trackGain: GainNode;
    private turnGain: GainNode;
    private turretGain: GainNode;
    private turretTones: OscillatorNode[] = [];
    private wobble = 0;

    constructor(readonly mixer: AudioMixer, readonly look: TankSoundLook = TANK_SOUND, bus = "sfx") {
        const ctx = this.ctx = mixer.context, L = look;
        const keep = <T extends AudioNode>(n: T) => (this.nodes.push(n), n);
        const gain = (g: number) => keep(new GainNode(ctx, { gain: g }));
        const band = (f: number, q: number, type: BiquadFilterType = "bandpass") => keep(new BiquadFilterNode(ctx, { type, frequency: f, Q: q }));
        // a narrow pulse (one click per cycle), for gating noise
        const n = 24, re = new Float32Array(n + 1), im = new Float32Array(n + 1);
        for (let i = 1; i <= n; i++) re[i] = 1 - i / (n + 2);
        const pulse = ctx.createPeriodicWave(re, im);
        const sources: AudioScheduledSourceNode[] = [];
        const osc = (f: number, wave?: PeriodicWave, type: OscillatorType = "sine") => {
            const o = keep(new OscillatorNode(ctx, { frequency: f, type: wave ? undefined : type }));
            if (wave) o.setPeriodicWave(wave);
            sources.push(o);
            return o;
        };
        const noise = keep(new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx), loop: true }));
        sources.push(noise);

        this.panner = keep(new PannerNode(ctx, { panningModel: "equalpower", distanceModel: "inverse", refDistance: 6, maxDistance: 1500, rolloffFactor: .8 }));
        this.panner.connect(mixer.bus(bus).gain);
        this.master = gain(0);
        this.master.connect(this.panner);

        // ---- engine ----
        const h = L.engine.harmonics, hr = new Float32Array(h.length + 1), hi = new Float32Array(h.length + 1);
        h.forEach((v, i) => hr[i + 1] = v);
        this.engine = osc(L.engine.firing[0], ctx.createPeriodicWave(hr, hi));
        this.engineGain = gain(L.engine.level);
        const lumpy = gain(1);
        this.lumpOsc = osc(L.engine.firing[0] / L.engine.lumpDiv);
        const lumpDepth = gain(L.engine.lump);
        this.lumpOsc.connect(lumpDepth).connect(lumpy.gain);
        this.engineFilter = band(L.engine.muffle[0], .7, "lowpass");
        this.engine.connect(lumpy).connect(this.engineFilter).connect(this.engineGain).connect(this.master);
        const rasp = gain(0);
        this.raspGate = osc(L.engine.firing[0], pulse);
        this.raspGate.connect(rasp.gain);
        noise.connect(band(L.engine.raspAt, .7)).connect(rasp).connect(gain(L.engine.rasp)).connect(this.master);

        // ---- tracks ----
        this.trackGain = gain(0);
        this.trackGain.connect(this.master);
        const T = L.tracks;
        const clicks = gain(0);
        this.clickOsc = osc(1, pulse);
        this.clickOsc.connect(clicks.gain);
        noise.connect(band(T.click[0], T.click[1])).connect(clicks).connect(gain(T.clickLevel * 2)).connect(this.trackGain);
        const slaps = gain(0);
        this.slapOsc = osc(.3, pulse);
        this.slapOsc.connect(slaps.gain);
        noise.connect(band(T.slap[0], T.slap[1])).connect(slaps).connect(gain(T.slapLevel * 2)).connect(this.trackGain);
        noise.connect(band(T.rumble, .7, "lowpass")).connect(gain(T.rumbleLevel * 3)).connect(this.trackGain);

        // ---- hull turn scrub ----
        this.turnGain = gain(0);
        noise.connect(band(L.turn.band[0], L.turn.band[1])).connect(this.turnGain).connect(gain(L.turn.level * 2)).connect(this.master);

        // ---- turret motor ----
        this.turretGain = gain(0);
        this.turretGain.connect(this.master);
        const rough = gain(1), roughOsc = osc(L.turret.rough), roughDepth = gain(L.turret.roughDepth);
        roughOsc.connect(roughDepth).connect(rough.gain);
        rough.connect(gain(L.turret.level)).connect(this.turretGain);
        for (const [f, g] of L.turret.tones)
        {
            const o = osc(f, undefined, "triangle");
            this.turretTones.push(o);
            o.connect(gain(g)).connect(rough);
        }
        noise.connect(band(L.turret.hiss[0], L.turret.hiss[1])).connect(gain(L.turret.hissLevel * 2)).connect(rough);

        for (const s of sources) s.start();
        this.master.gain.setTargetAtTime(L.volume, ctx.currentTime, .4);
    }

    update(state: TankSoundState) {
        const t = this.ctx.currentTime, k = .05, L = this.look;
        const rev = clamp(state.rev), load = clamp(state.load);
        const f = L.engine.firing[0] + (L.engine.firing[1] - L.engine.firing[0]) * rev;
        // a slow random drift: no two seconds sound the same
        this.wobble += (Math.random() - .5) * .02; this.wobble *= .98;
        const fw = f * (1 + this.wobble * .05);
        this.engine.frequency.setTargetAtTime(fw, t, k);
        this.raspGate.frequency.setTargetAtTime(fw, t, k);
        this.lumpOsc.frequency.setTargetAtTime(fw / L.engine.lumpDiv, t, k);
        const [lo, hi] = L.engine.muffle;
        this.engineFilter.frequency.setTargetAtTime(lo + (hi - lo) * (.3 * rev + .7 * load), t, .08);
        this.engineGain.gain.setTargetAtTime(L.engine.level * (.6 + .25 * load + .15 * rev), t, .08);

        const v = Math.abs(state.tracks), T = L.tracks, rate = Math.max(.2, v * T.links);
        this.clickOsc.frequency.setTargetAtTime(rate * (1 + (Math.random() - .5) * .04), t, k);
        this.slapOsc.frequency.setTargetAtTime(rate * T.slapRate * (1 + (Math.random() - .5) * .3), t, .1);
        this.trackGain.gain.setTargetAtTime(Math.min(1, v / T.full) ** .7, t, .1);
        this.turnGain.gain.setTargetAtTime(clamp(state.turn) * Math.min(1, .3 + v / 2), t, .15);

        const tr = Math.min(1, Math.abs(state.turret) / L.turret.full);
        this.turretGain.gain.setTargetAtTime(tr > .02 ? .4 + .6 * tr : 0, t, tr > .02 ? .04 : .08);
        L.turret.tones.forEach(([fr], i) => this.turretTones[i].frequency.setTargetAtTime(fr * (.85 + .15 * tr), t, .06));

        if (state.position)
        {
            const p = this.panner, x = state.position[0], y = state.position[1], z = state.position[2];
            if (p.positionX) { p.positionX.setTargetAtTime(x, t, .02); p.positionY.setTargetAtTime(y, t, .02); p.positionZ.setTargetAtTime(z, t, .02); }
            else p.setPosition(x, y, z);
        }
    }

    stop(fade = .6) {
        this.master.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
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

function clamp(x: number) { return x < 0 ? 0 : x > 1 ? 1 : x; }
