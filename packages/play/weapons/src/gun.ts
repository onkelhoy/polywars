import { actionOf, cycleCues, reloadCues } from "./actions";
import { CALIBERS, GUNS } from "./specs";
import type { Action, Barrel, Cue, GunEvent, GunSpec, Pull } from "./types";

/**
 * One gun in hand: rounds, the trigger (semi / auto), reloads, how far it's up at the eye and how wide a shot goes.
 * No drawing, no input: the host calls `trigger(held)`, `aim(held)`, `reload()` and `update(dt)`.
 * `oncue` gets the moments of its work (shot, eject, bolt, magazine, ...) on time, by its `action`: sounds and shells hang on it.
 */
export class Gun {
    readonly spec: GunSpec;
    readonly action: Action;
    /** called as each cue comes due (in `trigger` and `update`) */
    oncue?: (cue: Cue, gun: Gun) => void;
    /** due cues, seconds from now, sorted */
    private pending: { at: number; cue: Cue; reload: boolean }[] = [];
    rounds: number;
    /** spare rounds, `Infinity` for unlimited */
    spare: number;
    /** seconds left of a reload, 0 when not reloading */
    reloading = 0;
    /** the reload under way started on an empty gun (the `reload-empty` clip) */
    emptyReload = false;
    /** 0..1 how far up at the eye */
    aimed = 0;
    /** radians the next shot can go off for the shots just before it */
    bloom = 0;
    /** seconds since the last shot (for the fire clip) */
    sinceShot = Infinity;
    /**
     * Break actions: one per barrel (0 left, 1 right). Fired left first, then right; a barrel only fires loaded,
     * cocked, closed and off safe (else the trigger moves and nothing happens). A reload swaps only the fired / empty ones.
     */
    readonly barrels?: Barrel[];
    /** break action: the barrels the reload under way swaps */
    swapping: number[] = [];
    /** break action: the last trigger pull */
    pull?: Pull;
    /** safety on: the trigger is blocked */
    safe = false;
    private wait = 0;
    private wasHeld = false;
    private aiming = false;

    /** `action` from weapon.json wins over the spec's */
    constructor(spec: GunSpec | string, spare = Infinity, action?: Action) {
        this.spec = typeof spec === "string" ? GUNS[spec] : spec;
        if (!this.spec) throw new Error(`no gun ${spec}`);
        this.action = action ?? actionOf(this.spec);
        this.rounds = this.spec.magazine;
        this.spare = spare;
        if (this.action === "break") this.barrels = Array.from({ length: this.spec.magazine }, () => ({ loaded: true, spent: false, cocked: true, cocking: Infinity }));
    }

    /** break action: open while reloading */
    get open() { return !!this.barrels && this.reloading > 0; }

    /** pull both hammers back (closed only). Returns whether one moved. */
    cock() {
        if (!this.barrels || this.open) return false;
        return this.pullHammers();
    }

    private pullHammers() {
        let moved = false;
        for (const b of this.barrels!) if (!b.cocked) { moved = b.cocked = true; b.cocking = 0; }
        if (moved) this.oncue?.("cock", this);
        return moved;
    }

    /** flip the safety */
    toggleSafety() { this.safe = !this.safe; this.oncue?.("safety", this); }

    /** break action trigger: the first barrel with a live round (else the left), fires if it can */
    private breakTrigger(): GunEvent {
        const barrels = this.barrels!;
        const i = Math.max(0, barrels.findIndex(b => b.loaded && !b.spent)), b = barrels[i];
        const fires = !this.open && !this.safe && b.cocked && b.loaded && !b.spent;
        this.pull = { barrel: i, fired: fires, since: 0 };
        if (this.safe || this.open) return null;
        if (!b.cocked) return null;
        b.cocked = false;
        if (!fires) { this.oncue?.("dry", this); return "empty"; }
        b.spent = true;
        this.rounds--;
        this.wait = this.spec.interval;
        this.sinceShot = 0;
        this.oncue?.("shot", this);
        return "shot";
    }

    get caliber() { return CALIBERS[this.spec.caliber]; }

    /** 0..1 through a reload, -1 when not reloading */
    get progress() {
        const length = this.emptyReload ? this.spec.reloadEmpty : this.spec.reload;
        return this.reloading > 0 ? 1 - this.reloading / length : -1;
    }

    /** hold to aim down the sights (a reload takes it down) */
    aim(held: boolean) { this.aiming = held; }

    /** The trigger this frame. Semi: one shot per pull; auto: shots while held. */
    trigger(held: boolean): GunEvent {
        const pulled = held && (this.spec.auto || !this.wasHeld);
        this.wasHeld = held;
        if (this.barrels) return pulled && this.wait <= 0 ? this.breakTrigger() : null;
        if (!pulled || this.reloading > 0 || this.wait > 0) return null;
        if (this.rounds <= 0)
        {
            this.wait = .3;
            if (this.reload()) return "reload";
            this.oncue?.("dry", this);
            return "empty";
        }
        this.rounds--;
        this.wait = this.spec.interval;
        this.sinceShot = 0;
        this.oncue?.("shot", this);
        this.schedule(cycleCues(this.spec, this.action), this.spec.interval, false);
        return "shot";
    }

    /**
     * How far off (radians, a cone) a shot goes now. `moving` 0..1 of a full walk, `steady` 1 normally
     * (more with a hurt arm, less lying down). Call before `fired`.
     */
    spread(moving: number, steady = 1) {
        const s = this.spec, a = this.aimed;
        const still = s.hip + (s.aimed - s.hip) * a;
        return (still + s.moving * Math.min(1, moving) * (1 - a * .75) + this.bloom) * steady;
    }

    /** A random direction in the spread cone around (0, 0, -1): [yaw, pitch] offsets, radians. */
    scatter(moving: number, steady = 1, random = Math.random): [number, number] {
        const cone = this.spread(moving, steady), r = cone * Math.sqrt(random()), t = random() * Math.PI * 2;
        this.bloom = Math.min(this.spec.bloom * 3, this.bloom + this.spec.bloom);
        return [Math.cos(t) * r, Math.sin(t) * r];
    }

    /** The view's jump for a shot: `kick` springs back, `climb` stays, [pitch up, yaw] radians. */
    recoil(random = Math.random) {
        const s = this.spec, side = (random() * 2 - 1) * s.side;
        // aimed: the shoulder takes more of it
        const k = 1 - this.aimed * .35;
        // the push back, kg·m/s (bullet momentum, the gases roughly add half)
        const c = this.caliber, impulse = (c?.grams ?? 8) / 1000 * (c?.speed ?? 400) * 1.5;
        return { kick: s.kick * k, climb: s.climb * k, side: side * k, impulse: impulse * (s.shove ?? 1) };
    }

    /** Starts a reload unless full or one's under way. Returns whether it started. */
    reload() {
        if (this.reloading > 0 || this.rounds >= this.spec.magazine || this.spare <= 0) return false;
        if (this.barrels) this.swapping = this.barrels.map((b, i) => b.loaded && !b.spent ? -1 : i).filter(i => i >= 0).slice(0, this.spare);
        this.emptyReload = this.rounds === 0;
        this.reloading = this.emptyReload ? this.spec.reloadEmpty : this.spec.reload;
        const missing = Math.min(this.spec.magazine - this.rounds, this.spare);
        this.schedule(reloadCues(this.spec, this.action, this.emptyReload, missing), this.reloading, true);
        return true;
    }

    /** stop a reload (switching guns, dying): the rounds stay as they were, its cues are dropped */
    cancel() {
        this.reloading = 0;
        this.swapping = [];
        this.pending = this.pending.filter(p => !p.reload);
    }

    private schedule(timeline: [number, Cue][], length: number, reload: boolean) {
        for (const [f, cue] of timeline)
        {
            if (f <= 0) this.oncue?.(cue, this);
            else this.pending.push({ at: f * length, cue, reload });
        }
        this.pending.sort((a, b) => a.at - b.at);
    }

    update(dt: number): GunEvent {
        for (const p of this.pending) p.at -= dt;
        while (this.pending.length && this.pending[0].at <= 0) this.oncue?.(this.pending.shift()!.cue, this);
        this.wait = Math.max(0, this.wait - dt);
        this.sinceShot += dt;
        if (this.pull) this.pull.since += dt;
        if (this.barrels) for (const b of this.barrels) b.cocking += dt;
        // a break gun cocks itself as it opens
        if (this.barrels && this.reloading > 0 && this.progress >= .1) this.pullHammers();
        this.bloom = Math.max(0, this.bloom - this.spec.settle * dt);
        const up = this.aiming && this.reloading <= 0 ? 1 : 0;
        this.aimed += Math.sign(up - this.aimed) * Math.min(Math.abs(up - this.aimed), dt / this.spec.raise);
        if (this.reloading <= 0) return null;
        this.reloading -= dt;
        if (this.reloading > 0) return null;
        this.reloading = 0;
        if (this.barrels)
        {
            for (const i of this.swapping) { this.barrels[i].loaded = true; this.barrels[i].spent = false; }
            this.rounds += this.swapping.length;
            this.spare -= this.swapping.length;
            this.swapping = [];
            return "reloaded";
        }
        const take = Math.min(this.spec.magazine - this.rounds, this.spare);
        this.rounds += take;
        this.spare -= take;
        return "reloaded";
    }
}
