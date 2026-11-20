import type { AudioMixer, Voice } from "@papit/audio";
import type { ExplosionAudioOptions, Vec3 } from "./types";

const AROUND: Vec3[] = [...Array.from({ length: 8 }, (_, i): Vec3 => [Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)]), [0, 1, 0]];

/**
 * Explosion sounds in 3D through `@papit/audio`, from the `@polywar/sfx-gen` explosion set. The file is picked by
 * size (`small` under 100 kg, `big`) and where the ear is: near (`near-open` / `near-walls` / `near-indoor`, by rays
 * round the blast), `far`, `distant`. Late by the speed of sound: far away you see it, feel the gust, then hear it.
 */
export class ExplosionAudio {
    readonly mixer: AudioMixer;
    private files?: Record<string, string[]>;
    private loading?: Promise<void>;
    private listener: Vec3 = [0, 0, 0];
    private last = new Map<string, number>();
    private ringing?: Voice;
    private stunned?: { filter: BiquadFilterNode; gain: GainNode; ring: GainNode };

    constructor(readonly options: ExplosionAudioOptions) {
        this.mixer = options.mixer;
    }

    private get base() { return this.options.base ?? "/assets/audio/effects/explosions/"; }

    /** loads the set once */
    load() {
        return this.loading ??= fetch(`${this.base}sounds.json`).then(r => r.ok ? r.json() : null).then(async json => {
            if (!json) return;
            const sounds = json.sounds as Record<string, string[]>;
            await Promise.all(Object.values(sounds).flat().map(f => this.mixer.has(`explosions/${f}`) ? undefined : this.mixer.load(`explosions/${f}`, this.base + f)));
            this.files = sounds;
        }).catch(() => undefined);
    }

    /** where the ear is: every frame */
    setListener(position: Vec3, forward: Vec3) {
        this.listener = position;
        this.mixer.setListener({ x: position[0], y: position[1], z: position[2] }, { x: forward[0], y: forward[1], z: forward[2] });
    }

    /** which file a blast of `power` kg at `distance` m plays */
    pick(power: number, distance: number, at?: Vec3) {
        const s = Math.cbrt(power), size = power >= 100 ? "big" : "small";
        const near = Math.max(150, 60 * s), far = Math.max(1500, 400 * s);
        const scene = distance < near ? `near-${at ? this.scene(at) : "open"}` : distance < far ? "far" : "distant";
        return `${size}-${scene}`;
    }

    /** a blast of `power` kg TNT at `at` */
    play(at: ArrayLike<number>, power: number) {
        if (!this.files) return void this.load();
        const p: Vec3 = [at[0], at[1], at[2]], l = this.listener;
        const distance = Math.hypot(p[0] - l[0], p[1] - l[1], p[2] - l[2]), s = Math.cbrt(power);
        const name = this.pick(power, distance, p), variants = this.files[name];
        if (!variants?.length) return;
        let pick = Math.floor(Math.random() * variants.length);
        if (pick === this.last.get(name) && variants.length > 1) pick = (pick + 1) % variants.length;
        this.last.set(name, pick);
        const deaf = this.options.deaf?.() ?? 0, speed = this.options.sound ?? 343;
        // louder and lower the bigger it is; heard over kilometres
        const volume = Math.min(1.6, .5 + .22 * Math.log10(power + 1)) * (1 - .6 * deaf);
        return this.mixer.play(`explosions/${variants[pick]}`, {
            bus: this.options.bus ?? "sfx", volume,
            rate: (1.12 - Math.min(.35, .06 * Math.log10(power + 1))) * (1 + (Math.random() - .5) * .06),
            when: speed > 0 ? this.mixer.context.currentTime + distance / speed : undefined,
            spatial: { position: { x: p[0], y: p[1], z: p[2] }, refDistance: 8 * s, rolloff: .6, maxDistance: 40000 },
        });
    }

    /**
     * Shell shock on the ears, `amount` 0..1 (a close blast): near silence first, then everything muffled,
     * opening back up to normal over seconds; a ring comes in towards the end. A lowpass + gain after the mixer's master.
     */
    stun(amount: number) {
        amount = Math.min(1, Math.max(0, amount));
        if (amount < .05) return;
        const context = this.mixer.context as AudioContext;
        if (!this.stunned)
        {
            // papit audio has no master effects: put ours between the master and the speakers
            const filter = context.createBiquadFilter(), gain = context.createGain();
            filter.type = "lowpass";
            filter.frequency.value = 20000;
            this.mixer.master.gain.disconnect();
            this.mixer.master.gain.connect(filter);
            filter.connect(gain);
            gain.connect(context.destination);
            this.stunned = { filter, gain, ring: this.ringNode(context) };
        }
        const { filter, gain, ring } = this.stunned, now = context.currentTime;
        // explosion -> silence -> the ring fades in -> the world fades back in (muffled, opening up) as the ring fades out
        const silent = .5 + 1.5 * amount, ringUp = 1 + 1.5 * amount, back = 3 + 6 * amount, start = now + silent;
        const hold = (p: AudioParam) => { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); };
        hold(gain.gain); hold(filter.frequency); hold(ring.gain);
        // the bang itself still gets through, then the ears shut
        gain.gain.setTargetAtTime(Math.max(0, 1 - amount * 1.4) * .02, now + .12, .03);
        filter.frequency.setTargetAtTime(200, now + .12, .03);
        ring.gain.setTargetAtTime(.09 * amount, now + silent * .4, ringUp / 3);
        // the world comes back: slow at first (an exponential approach)
        gain.gain.setTargetAtTime(1, start + ringUp * .5, back / 3);
        filter.frequency.setTargetAtTime(20000, start + ringUp * .5, back / 2);
        ring.gain.setTargetAtTime(0, start + ringUp * .6, back / 6);
    }

    /** a ring in the ear: a few detuned high tones that wobble + a thin hiss, past the muffle, silent till `stun` */
    private ringNode(context: AudioContext) {
        const out = context.createGain();
        out.gain.value = 0;
        out.connect(context.destination);
        for (const [f, g] of [[3520, .5], [3610, .35], [4980, .12]])
        {
            const o = context.createOscillator(), og = context.createGain(), wobble = context.createOscillator(), depth = context.createGain();
            o.frequency.value = f;
            wobble.frequency.value = .3 + Math.random() * .6;
            depth.gain.value = f * .006;
            wobble.connect(depth).connect(o.frequency);
            og.gain.value = g;
            o.connect(og).connect(out);
            o.start(); wobble.start();
        }
        const n = context.sampleRate * 2, buffer = context.createBuffer(1, n, context.sampleRate), x = buffer.getChannelData(0);
        for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1;
        const hiss = context.createBufferSource(), band = context.createBiquadFilter(), hg = context.createGain();
        hiss.buffer = buffer; hiss.loop = true;
        band.type = "bandpass"; band.frequency.value = 4200; band.Q.value = 3;
        hg.gain.value = .25;
        hiss.connect(band).connect(hg).connect(out);
        hiss.start();
        return out;
    }

    /** ears ring: `amount` 0..1 (from a close blast), plays once till it fades */
    ring(amount: number) {
        const file = this.files?.ring?.[0];
        if (!file || amount <= .05) return;
        this.ringing?.stop();
        this.ringing = this.mixer.play(`explosions/${file}`, { bus: this.options.bus ?? "sfx", volume: Math.min(1, amount) * .5 });
    }

    /** open, walls or indoor round the blast (rays 8 round to 30 m, one up 20 m) */
    private scene(at: Vec3) {
        const cast = this.options.cast;
        if (!cast) return "open";
        const reach = (d: Vec3, max: number) => {
            const hit = cast(at, [at[0] + d[0] * max, at[1] + d[1] * max, at[2] + d[2] * max]);
            return hit ? Math.hypot(hit.point[0] - at[0], hit.point[1] - at[1], hit.point[2] - at[2]) : Infinity;
        };
        const round = AROUND.slice(0, 8).map(d => reach(d, 30)), up = reach(AROUND[8], 20);
        const close = round.filter(d => d < 12).length, near = round.filter(d => d < 25).length;
        return up < 8 && close >= 6 ? "indoor" : near >= 2 ? "walls" : "open";
    }
}
