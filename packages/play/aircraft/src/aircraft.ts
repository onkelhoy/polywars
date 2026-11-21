import { Vector3 } from "@papit/vector";
import type { DriveInput, Vehicle } from "@polywar/vehicle";
import type { AircraftSetting, Controls, Vec3 } from "./types";

const G = 9.81;
/** dynamic pressure at 100 m/s, sea level: the control authorities are given there */
const Q_REF = .5 * 1.225 * 100 * 100;

/**
 * A fixed wing flight model on a `@polywar/vehicle` Vehicle (its wheels roll it on the ground, its body is the
 * `@papit/rigidbody` one). Each physics step (`vehicle.onstep`): thrust from the engine (power / speed, capped
 * standing), lift and drag from the air speed and angle of attack (thin air up high, a stall past `stall`: the lift
 * falls away and a wing drops), sideslip, and pitch / roll / yaw from the controls, weighted by dynamic pressure (slow:
 * mushy, fast: stiff), with the plane's own stability (weathervane, pitch back to its trim) and rate damping.
 * The air moves: `wind` plus gusts that knock a light plane about. Read `airspeed`, `alpha`, `g`, `vapour` (wing
 * tip condensation, hard pulls at speed), `rpm`, `propeller` (blade angle) for drawing / sound.
 */
export class Aircraft {
    readonly controls: Controls = { throttle: 0, pitch: 0, roll: 0, yaw: 0, flaps: 1 };
    /** flaps out, 0..1 (follows `controls.flaps` slowly) */
    flaps = 1;
    /** engine output, 0..1 (lags the throttle) */
    power = 0;
    rpm: number;
    /** propeller blade angle, rad */
    propeller = 0;
    /** m/s through the air */
    airspeed = 0;
    /** angle of attack / sideslip, rad */
    alpha = 0;
    beta = 0;
    /** load factor (lift / weight) */
    g = 1;
    stalled = false;
    /** 0..1 wing tip vapour */
    vapour = 0;
    /** steady wind (world, m/s); gusts come on top */
    wind: Vector3;
    /** the gust right now (world, m/s) */
    readonly gustNow = new Vector3(0, 0, 0);
    private s: Required<Omit<AircraftSetting, "wind">>;
    private time = Math.random() * 100;
    private phase = Array.from({ length: 16 }, () => Math.random() * Math.PI * 2);
    private drop = 0;
    private fwd = new Vector3(0, 0, 0);
    private up = new Vector3(0, 0, 0);
    private right = new Vector3(0, 0, 0);
    private air = new Vector3(0, 0, 0);
    private ld = new Vector3(0, 0, 0);

    constructor(readonly vehicle: Vehicle, setting: AircraftSetting) {
        this.s = {
            power: 1.1e6, staticThrust: 20000, drag: .019, liftSlope: 5.2, stall: 15, incidence: 1.5,
            flapLift: .9, elevator: 3, aileron: 5, rudder: 1.6, gust: 2, assist: 0, rates: [1.4, 3, .5], grip: 2.5, idle: 700, redline: 3000, ...setting,
        };
        this.wind = new Vector3(...(setting.wind ?? [0, 0, 0]));
        this.rpm = 0;
        // the flight model drags it (the body's own damping would cap it near 90 m/s)
        vehicle.body.linearDamping = 0;
        vehicle.onstep = dt => this.step(dt);
    }

    /** the Vehicle's input this step: brakes and the tail wheel (rudder), nothing drives the wheels */
    drive(occupied = true): DriveInput {
        const c = this.controls, v = this.vehicle;
        if (!occupied || (c.brake && Math.abs(v.speed) < .5 && c.throttle < .3)) return { throttle: 0, steer: 0, parked: true };
        // the tail wheel steers from behind: turned the other way to turn the nose the rudder's way
        return { throttle: c.brake && v.speed > .5 ? -1 : 0, steer: -c.yaw };
    }

    /** the engine runs (rpm > 0) */
    get running() { return this.rpm > 0; }
    /** start / stop the engine */
    engine(on: boolean) { if (on && !this.rpm) this.rpm = this.s.idle * .6; if (!on) this.rpm = 0; }

    private step(dt: number) {
        const s = this.s, b = this.vehicle.body, q = b.rotation, c = this.controls, m = this.vehicle.spec.mass;
        const fwd = q.rotate(set(this.fwd, 0, 0, -1)), up = q.rotate(set(this.up, 0, 1, 0)), right = q.rotate(set(this.right, 1, 0, 0));
        this.time += dt;

        // engine: spools to the throttle; the prop windmills with the speed when idle
        const running = this.rpm > 0;
        const want = running ? clamp(c.throttle, 0, 1) : 0;
        this.power += clamp(want - this.power, -dt * .8, dt * .6);
        if (running)
        {
            const target = s.idle + (s.redline - s.idle) * Math.min(1, this.power * .85 + this.airspeed / 400);
            this.rpm += (target - this.rpm) * Math.min(1, dt * 2);
        }
        this.propeller = (this.propeller + this.rpm / 60 * Math.PI * 2 * .48 * dt) % (Math.PI * 2);

        // the air: wind + gusts (a few slow sines per axis; stronger off the ground, weaker vertically)
        const t = this.time, ph = this.phase, k = s.gust;
        const height = b.position.y, grow = Math.min(1, .3 + height / 60);
        const noise = (i: number) => Math.sin(t * .31 + ph[i]) * .5 + Math.sin(t * .83 + ph[i + 1]) * .35 + Math.sin(t * 2.1 + ph[i + 2]) * .2 + Math.sin(t * 4.7 + ph[i + 3]) * .1;
        set(this.gustNow, noise(0) * k * grow, noise(4) * k * .5 * grow, noise(8) * k * grow);
        const v = b.velocity, air = set(this.air, v.x - this.wind.x - this.gustNow.x, v.y - this.wind.y - this.gustNow.y, v.z - this.wind.z - this.gustNow.z);
        const V = air.magnitude;
        this.airspeed = V;
        const rho = 1.225 * Math.exp(-Math.max(0, height) / 8500), qd = .5 * rho * V * V, S = s.wing.area;
        const u = air.dot(fwd), w = air.dot(up), sv = air.dot(right);
        this.alpha = V > 2 ? Math.atan2(-w, Math.max(u, .1)) : 0;
        this.beta = V > 2 ? Math.atan2(sv, Math.max(Math.abs(u), 1)) : 0;

        // lift: straight line to the stall, then it falls away (and a wing drops)
        const a = this.alpha + s.incidence * Math.PI / 180, stall = s.stall * Math.PI / 180, max = s.liftSlope * stall;
        this.flaps += Math.max(-dt * .4, Math.min(dt * .4, (c.flaps ?? 0) - this.flaps));
        let cl: number;
        this.stalled = Math.abs(a) > stall && V > 15;
        if (Math.abs(a) <= stall) cl = s.liftSlope * a;
        else cl = Math.sign(a) * Math.max(.45, max - (Math.abs(a) - stall) * 2.5);
        // flaps: more lift (and drag) at the same angle, the stall a little earlier
        cl += this.flaps * s.flapLift * (this.stalled ? .4 : 1);
        const ar = s.wing.span * s.wing.span / S;
        const cd = s.drag + cl * cl / (Math.PI * .8 * ar) + (this.stalled ? .25 : 0) + this.flaps * .05;
        if (V > 1)
        {
            // lift at right angles to the air flow, in the plane's symmetry plane
            const ld = set(this.ld, right[1] * air[2] - right[2] * air[1], right[2] * air[0] - right[0] * air[2], right[0] * air[1] - right[1] * air[0]);
            ld.divide(V);
            const L = qd * S * cl, D = qd * S * cd, Y = -qd * 4.5 * this.beta;
            b.applyForce({
                x: ld[0] * L - air[0] / V * D + right[0] * Y,
                y: ld[1] * L - air[1] / V * D + right[1] * Y,
                z: ld[2] * L - air[2] / V * D + right[2] * Y,
            });
            this.g = L / (m * G);
            // arcade: lift enough to hold it up above the stall speed (the flight path follows the nose, so alpha stays small)
            if (s.assist)
            {
                const hold = m * G * Math.min(1.15, (V / 50) ** 2) * s.assist, extra = Math.max(0, hold - L) * Math.max(0, Math.cos(this.alpha));
                b.applyForce({ x: up[0] * extra, y: up[1] * extra, z: up[2] * extra });
                this.g = Math.max(this.g, (L + extra) / (m * G));
            }
        }
        else this.g = 1;
        // thrust: the prop's power over the speed, capped standing still
        const T = this.power * Math.min(s.staticThrust, s.power * .8 / Math.max(V, 1));
        b.applyForce({ x: fwd[0] * T, y: fwd[1] * T, z: fwd[2] * T });

        // moments as rate changes (body axes: roll round the nose, pitch round the right wing, yaw round up)
        const f = qd / Q_REF, fc = Math.min(f, 1.5), fs = Math.sqrt(Math.min(f, 4));
        const om = b.angularVelocity, p = om.x * fwd[0] + om.y * fwd[1] + om.z * fwd[2];
        const pr = om.x * right[0] + om.y * right[1] + om.z * right[2], r = om.x * up[0] + om.y * up[1] + om.z * up[2];
        // stall: a wing drops (one side, picked each stall)
        if (this.stalled && !this.drop) this.drop = Math.random() < .5 ? -1 : 1;
        if (!this.stalled) this.drop = 0;
        const bump = (i: number) => noise(i + 1) * k * .04 * grow;
        const pitch = fc * c.pitch * s.elevator - f * 10 * (this.alpha - .03) - 3 * fs * pr + f * bump(2);
        const roll = fc * c.roll * s.aileron - 3 * fs * p - f * 1.5 * this.beta + f * this.drop * 2.5 + f * bump(6) * 4;
        const yaw = -fc * c.yaw * s.rudder - f * 4 * this.beta - 1.5 * fs * r + f * bump(9);
        const help = s.assist * clamp((V - 22) / 30, 0, 1);
        // arcade: the controls ask for turn rates (pitch / roll / yaw rad/s), reached fast; the real moments fade out
        const tp = c.pitch * s.rates[0], tr = c.roll * s.rates[1], ty = -c.yaw * s.rates[2], snap = Math.min(1, dt * 9);
        const dp = (1 - help) * pitch * dt + help * (tp - pr) * snap, dr = (1 - help) * roll * dt + help * (tr - p) * snap, dy = (1 - help) * yaw * dt + help * (ty - r) * snap;
        om.x += fwd[0] * dr + right[0] * dp + up[0] * dy;
        om.y += fwd[1] * dr + right[1] * dp + up[1] * dy;
        om.z += fwd[2] * dr + right[2] * dp + up[2] * dy;
        // arcade: the flight path swings onto the nose (no mushing, no skids); a bit of the turn is lost as speed
        if (help > 0 && V > 5)
        {
            const t = Math.min(1, dt * s.grip * help), sp = Math.hypot(v.x, v.y, v.z);
            const nx = v.x + (fwd[0] * sp - v.x) * t, ny = v.y + (fwd[1] * sp - v.y) * t, nz = v.z + (fwd[2] * sp - v.z) * t;
            // speed lost only for the part of the path turned (a hard turn bleeds, straight flight none)
            const off = 1 - (v.x * fwd[0] + v.y * fwd[1] + v.z * fwd[2]) / sp;
            const nl = Math.hypot(nx, ny, nz) || 1, keep = sp * (1 - off * t * .5) / nl;
            v.x = nx * keep; v.y = ny * keep; v.z = nz * keep;
        }

        // wing tip vapour: a hard pull at speed
        this.vapour = clamp((this.g - 2.8) / 2, 0, 1) * clamp((V - 70) / 40, 0, 1);
    }
}

function clamp(x: number, lo: number, hi: number) { return x < lo ? lo : x > hi ? hi : x; }
function set(v: Vector3, x: number, y: number, z: number) { v[0] = x; v[1] = y; v[2] = z; return v; }
