import type { Vec3 } from "./types";

export type KnockdownSetting = {
    /** shell shock 0..1 (`shellShock(kPa)`) from which you go down (default .2) */
    threshold?: number;
    /** standing eye height over the feet, m (default 1.7) */
    eye?: number;
    /** eye height lying, m (default .25) */
    lying?: number;
};

export type KnockdownPhase = "up" | "fall" | "down" | "rise" | "groggy";

const ease = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** look while pushing up: down at the hands */
const HANDS = -.85;

/**
 * Knocked over by a blast. No hands out: you drop limp the way the push goes, land (eyes shut on the thud), lie a
 * moment (eyes open slowly, a quick blink or two; you can look round, heavy), then come to: on the back you roll
 * over first, the look goes down to the hands, they find the ground, push up, you stand and stay groggy a while.
 * Pure state: each frame `update(dt, pitch)` (your own look's pitch), then read `drop` / `pitch` / `yaw` / `roll`
 * (added to the look), `blink` (lids), `look` / `control` (0..1 of look / walk), `hands` (0..1 on the ground).
 * `ondown` fires on the hit (knock the gun away).
 */
export class Knockdown {
    phase: KnockdownPhase = "up";
    /** m the eye is lowered */
    drop = 0;
    /** rad added to the look */
    pitch = 0;
    yaw = 0;
    roll = 0;
    /** 0..1 eyes shut */
    blink = 0;
    /** 0..1 of the mouse look you have */
    look = 1;
    /** 0..1 of the walk you have */
    control = 1;
    /** 0..1 the hands on the ground (pushing up) */
    hands = 0;
    /** 0..1 after getting up: still dazed (hunched, swaying, slow), fades */
    groggy = 0;
    /** unit, level: the way you fell */
    direction: Vec3 = [0, 0, 1];
    /** on the back (rolls over to get up) */
    back = false;
    ondown?: (direction: Vec3, shock: number) => void;
    /** the eyes opened after a blink (from landing on): clear some of the daze here (`Daze.clear`) */
    onblink?: () => void;
    /** s since landing */
    private since = 0;
    private shut = false;
    private time = 0;
    private fallTime = .45;
    /** s out cold (eyes shut) after landing */
    private out = 0;
    private downTime = 2;
    private rollTime = 0;
    private groggyTime = 4;
    private to = { pitch: 0, yaw: 0, roll: 0 };
    private from = { pitch: 0, yaw: 0, roll: 0 };
    private side = 1;
    private keys: [number, number][] = [];
    private shock = 0;
    private start = { drop: 0, pitch: 0, yaw: 0, roll: 0 };
    private seed = Math.random() * 100;

    constructor(readonly setting: KnockdownSetting = {}) { }

    get active() { return this.phase !== "up"; }
    /** lying or getting up (not on the feet) */
    get floored() { return this.phase === "fall" || this.phase === "down" || this.phase === "rise"; }

    /**
     * A blast reached you: `shock` 0..1, `direction` the push (world), `yaw` / `pitch` your look now.
     * Goes down if over the threshold (lying already: a bit longer); `out` s out cold (eyes shut) first. Returns if it did.
     */
    hit(shock: number, direction: ArrayLike<number>, yaw: number, pitch: number, out = 0) {
        this.out = out;
        if (shock < (this.setting.threshold ?? .2)) return false;
        const l = Math.hypot(direction[0], direction[2]) || 1, dx = direction[0] / l, dz = direction[2] / l;
        this.direction = [dx, 0, dz];
        if (this.phase === "down") { this.downTime += .8; this.ondown?.(this.direction, shock); return true; }
        // pushed back: on the back, sky; pushed forward: face to the ground; sideways rolls
        const ahead = dx * -Math.sin(yaw) + dz * -Math.cos(yaw), side = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
        const r = Math.random() - .5;
        this.back = ahead < .2;
        this.side = side >= 0 ? 1 : -1;
        this.to = {
            pitch: (this.back ? 1.15 + r * .3 : -1 + r * .3) - pitch,
            yaw: r * .8,
            roll: -side * .9,
        };
        // from wherever you are now (standing, getting up, still blinking): a new blast always counts
        this.start = { drop: this.drop, pitch: this.pitch, yaw: this.yaw, roll: this.roll };
        this.phase = "fall";
        this.time = 0;
        this.since = 0;
        this.shock = shock;
        this.plan(shock);
        this.ondown?.(this.direction, shock);
        return true;
    }

    /**
     * The lids as keys (time since landing, 0..1 shut): shut a moment, open slowly (half, a hold, full), a quick
     * blink or two (snap shut, snap open). Lying lasts till they are done.
     */
    private plan(shock: number) {
        // out cold: the eyes stay shut `out` s longer before they first open
        let t = .5 + .6 * shock + Math.random() * .3 + this.out;
        const keys: [number, number][] = [[0, 1], [t, 1]];
        const at = (dt: number, v: number) => { t += dt; keys.push([t, v]); };
        at(.6, .5); at(.25 + Math.random() * .3, .45); at(.45, 0);
        const quick = () => { at(.06, 1); at(.04, 1); at(.1, 0); };
        t += .3 + Math.random() * .4; keys.push([t, 0]); quick();
        if (Math.random() < .6) { t += .2 + Math.random() * .3; keys.push([t, 0]); quick(); }
        this.keys = keys;
        this.downTime = t + .3 + .5 * shock;
        // coming to: more blinks while getting up and on the feet, further apart
        const rise = (this.back ? .8 : 0) + 1.75, end = this.downTime + rise + 4 + 6 * shock;
        t = this.downTime + .2;
        while (t < end) { keys.push([t, 0]); quick(); t += .7 + Math.random() * .6 + (t - this.downTime) * .25; }
    }

    /** `pitch`: your own look's pitch (without this), so the rise can point the eyes at the hands */
    update(dt: number, pitch = 0) {
        if (this.phase === "up") return;
        this.time += dt;
        if (this.phase !== "fall") this.since += dt; else this.since = 0;
        this.tick(pitch);
        const shut = this.blink > .9;
        if (this.shut && this.blink < .5) this.onblink?.();
        if (shut) this.shut = true; else if (this.blink < .5) this.shut = false;
    }

    private tick(pitch: number) {
        const s = this.setting, eye = s.eye ?? 1.7, low = eye - (s.lying ?? .25), w = this.time + this.seed;
        if (this.phase === "fall")
        {
            // limp: speeds up like a fall, the eyes go on the thud
            const t = Math.min(1, this.time / this.fallTime), f = t * t;
            const st = this.start, e = ease(Math.min(1, t * 1.2));
            this.drop = mix(st.drop, low, f);
            this.pitch = mix(st.pitch, this.to.pitch, e); this.yaw = mix(st.yaw, this.to.yaw, t); this.roll = mix(st.roll, this.to.roll, f);
            this.blink = t > .85 ? (t - .85) / .15 : 0;
            this.look = this.control = this.hands = 0;
            if (t >= 1) { this.phase = "down"; this.time = 0; }
            return;
        }
        if (this.phase === "down")
        {
            this.drop = low;
            // the head too heavy to hold: wanders a little; you can look, slowly
            this.pitch = this.to.pitch + Math.sin(w * .7) * .05; this.yaw = this.to.yaw + Math.sin(w * .4) * .1; this.roll = this.to.roll + Math.sin(w * .5) * .05;
            this.blink = this.lid(this.since);
            this.look = .5 * ease(this.time / 1.5); this.control = 0;
            if (this.time >= this.downTime)
            {
                this.phase = "rise"; this.time = 0;
                this.from = { pitch: this.pitch, yaw: this.yaw, roll: this.roll };
                this.rollTime = this.back ? .8 : 0;
            }
            return;
        }
        if (this.phase === "rise")
        {
            // (on the back: roll over) -> eyes to the hands -> hands on the ground -> push up -> stand, look up
            const t = this.time, R = this.rollTime, H = R + .35, P = H + .9, S = P + .5;
            const abs0 = pitch + this.from.pitch, hands = HANDS - pitch;
            this.look = 0; this.control = t > P ? .35 * ease((t - P) / (S - P)) : 0;
            this.blink = this.lid(this.since);
            if (t < R)
            {
                // over onto the side, then the front: the view swings sky -> along the ground -> the ground
                const u = ease(t / R);
                this.pitch = mix(abs0, HANDS, u) - pitch;
                this.roll = mix(this.from.roll, 0, u) + this.side * 1.3 * Math.sin(Math.PI * u);
                this.yaw = this.from.yaw; this.drop = low; this.hands = 0;
            }
            else if (t < H)
            {
                const u = ease((t - R) / (H - R));
                this.pitch = R > 0 ? hands : mix(this.from.pitch, hands, u);
                this.roll = mix(R > 0 ? 0 : this.from.roll, 0, u); this.yaw = mix(this.from.yaw, 0, u);
                this.drop = low; this.hands = u;
            }
            else if (t < P)
            {
                // push: the eye rises over the hands, they leave the ground at the end
                const u = ease((t - H) / (P - H));
                this.pitch = hands + .25 * u; this.roll = Math.sin(w * 1.1) * .04 * u; this.yaw = 0;
                this.drop = mix(low, .12, u); this.hands = 1 - ease((t - H) / (P - H) * 4 - 3);
            }
            else
            {
                const u = ease((t - P) / (S - P));
                this.pitch = mix(hands + .25, -.08, u); this.roll = Math.sin(w * 1.1) * .05; this.yaw = 0;
                this.drop = .12; this.hands = 0;
            }
            this.groggy = 1;
            if (t >= S) { this.phase = "groggy"; this.time = 0; this.groggyTime = 4 + 6 * this.shock; }
            return;
        }
        // groggy: on the feet but not right: hunched, swaying, slow to answer; fades
        const g = this.groggy = 1 - ease(this.time / this.groggyTime);
        this.drop = .12 * g;
        this.pitch = (-.08 + Math.sin(w * .8) * .04) * g;
        this.yaw = Math.sin(w * .5) * .05 * g;
        this.roll = (Math.sin(w * 1.1) * .05 + Math.sin(w * .37) * .04) * g;
        this.blink = this.lid(this.since);
        this.look = 1 - .6 * g; this.control = 1 - .65 * g;
        if (g <= 0) this.reset();
    }

    /** 0..1 shut at `t` (since landing) */
    private lid(t: number) {
        const k = this.keys;
        for (let i = 1; i < k.length; i++)
            if (t < k[i][0]) { const [t0, a] = k[i - 1], [t1, b] = k[i]; return a + (b - a) * ease((t - t0) / Math.max(1e-3, t1 - t0)); }
        return 0;
    }

    /** back up now */
    reset() {
        this.phase = "up"; this.time = 0;
        this.drop = this.pitch = this.yaw = this.roll = this.blink = this.hands = this.groggy = 0;
        this.look = this.control = 1;
    }
}
