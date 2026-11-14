import { CALIBERS, GUNS } from "./specs";
import type { GunEvent, GunSpec } from "./types";

/**
 * One gun in hand: rounds, the trigger (semi / auto), reloads, how far it's up at the eye and how wide a shot goes.
 * No drawing, no input: the host calls `trigger(held)`, `aim(held)`, `reload()` and `update(dt)`.
 */
export class Gun {
    readonly spec: GunSpec;
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
    private wait = 0;
    private wasHeld = false;
    private aiming = false;

    constructor(spec: GunSpec | string, spare = Infinity) {
        this.spec = typeof spec === "string" ? GUNS[spec] : spec;
        if (!this.spec) throw new Error(`no gun ${spec}`);
        this.rounds = this.spec.magazine;
        this.spare = spare;
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
        if (!pulled || this.reloading > 0 || this.wait > 0) return null;
        if (this.rounds <= 0)
        {
            this.wait = .3;
            return this.reload() ? "reload" : "empty";
        }
        this.rounds--;
        this.wait = this.spec.interval;
        this.sinceShot = 0;
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
        return { kick: s.kick * k, climb: s.climb * k, side: side * k };
    }

    /** Starts a reload unless full or one's under way. Returns whether it started. */
    reload() {
        if (this.reloading > 0 || this.rounds >= this.spec.magazine || this.spare <= 0) return false;
        this.emptyReload = this.rounds === 0;
        this.reloading = this.emptyReload ? this.spec.reloadEmpty : this.spec.reload;
        return true;
    }

    /** stop a reload (switching guns, dying): the rounds stay as they were */
    cancel() { this.reloading = 0; }

    update(dt: number): GunEvent {
        this.wait = Math.max(0, this.wait - dt);
        this.sinceShot += dt;
        this.bloom = Math.max(0, this.bloom - this.spec.settle * dt);
        const up = this.aiming && this.reloading <= 0 ? 1 : 0;
        this.aimed += Math.sign(up - this.aimed) * Math.min(Math.abs(up - this.aimed), dt / this.spec.raise);
        if (this.reloading <= 0) return null;
        this.reloading -= dt;
        if (this.reloading > 0) return null;
        this.reloading = 0;
        const take = Math.min(this.spec.magazine - this.rounds, this.spare);
        this.rounds += take;
        this.spare -= take;
        return "reloaded";
    }
}
