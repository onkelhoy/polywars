import { Hull, RigidBody, World, raycast } from "@papit/rigidbody";
import { NearSolids } from "./solids";
import { Vector3 } from "@papit/vector";
import { Quaternion } from "@papit/quaternion";
import type { DriveInput, Point, VehicleSetting, VehicleSpec, WheelState } from "./types";

import type { Matrix4 } from "@papit/matrix";

/** wheel / steering node moves are written by hand: no allocation per frame (Matrix4 ops make new matrices) */
type M16 = Matrix4 | Float32Array | Float64Array;
const G = 9.81;
/** cancel rates (1/s): how fast sideways / locked wheel speed is taken out, before the grip limit */
const LATERAL = 18, LOCK = 18;

/**
 * A car on `@papit/rigidbody`: a hull chassis plus raycast wheels (spring + damper each), tyre grip with a
 * friction circle, engine / brakes / handbrake and speed scaled steering. Model space is glTF (y up, nose -z).
 * Alone it owns a world (the `solids` near the car as static boxes in it) and steps it inside `update`; in a
 * shared world (`Vehicles`, cars hit each other) the group steps it and calls `drive` before each step.
 * Draw with `matrix` (model) and the `wheel` / `steeringWheel` node matrices.
 */
export class Vehicle {
    readonly world: World;
    readonly body: RigidBody;
    readonly spec: VehicleSpec;
    readonly wheels: WheelState[];
    /** front wheel angle, rad (right +) */
    steering = 0;
    /** along the nose, m/s (negative backwards) */
    speed = 0;
    /** 1.. forward gears, -1 reverse, 0 neutral (stopped, no throttle) */
    gear = 1;
    /** engine speed, rev / min */
    rpm = 800;
    /** throttle the engine gets after the shift cut, 0..1 */
    power = 0;
    /** seconds left of the current shift (power cut, then eased back in) */
    shifting = 0;
    /** how much the tyres slide, 0..1 (skid sound, dust): sliding wheels on the ground x speed */
    get slip() {
        const n = this.wheels.filter(w => w.grounded && w.slipping).length;
        const v = this.body.velocity;
        return n / this.wheels.length * Math.min(1, Math.hypot(v.x, v.z) / 6);
    }
    /** bike: lean, rad (+ right side down) */
    lean = 0;
    /** bike: on its side (balance off until `raise`) */
    fallen = false;
    /** hit hard (bike: also tipped over); `speed` m/s just before, `impact` the speed lost in one step, m/s.
     * `crashVelocity` is the velocity just before (throw the rider with it) */
    oncrash?: (speed: number, impact: number) => void;
    readonly crashVelocity = new Vector3(0, 0, 0);
    /** car: speed lost in one step (m/s) that counts as a crash. Default 7 */
    crashAt = 7;
    private impact = 0;
    private calm = 0;
    /** called on every gear change (sound, a camera nudge) */
    onshift?: (gear: number, up: boolean) => void;

    private s: Required<Omit<VehicleSetting, "solids" | "world">> & Pick<VehicleSetting, "solids">;
    /** solids near the car as static bodies (alone: its own; shared: the group's) */
    solids: NearSolids;
    private owned: boolean;
    /** centre of mass, model space */
    private com: Vector3;
    private corners: Vector3[];
    // scratch (the step loop allocates nothing)
    private up = new Vector3(0, 0, 0);
    private nose = new Vector3(0, 0, 0);
    private mount = new Vector3(0, 0, 0);
    private dir = new Vector3(0, 0, 0);
    private r = new Vector3(0, 0, 0);
    private rt = new Vector3(0, 0, 0);
    private pv = new Vector3(0, 0, 0);
    private fwd = new Vector3(0, 0, 0);
    private side = new Vector3(0, 0, 0);
    private force = new Vector3(0, 0, 0);
    private corner = new Vector3(0, 0, 0);
    private local = new Vector3(0, 0, 0);
    private turn = new Quaternion([0, 0, 0, 1]);
    private k: number;
    private c: number;
    private sag: number;
    private lock: number;
    private left = 0;
    private bike: boolean;
    private last = new Vector3(0, 0, 0);
    private right = new Vector3(0, 0, 0);
    private tank: boolean;
    /** a short push being applied (`kick`): model space point, world N per step, seconds left */
    private kicks: { at: Vector3; force: Vector3; left: number }[] = [];

    constructor(setting: VehicleSetting, at: Point = [0, 0, 0], yaw = 0) {
        this.s = {
            travel: .3, frequency: 1.3, damping: .3, grip: 1.1, slide: .35, accel: 3.5, brake: 8, reverse: 5,
            steer: 34, steerFade: 6, centre: 0, antiRoll: 1.5, roll: setting.spec.kind === "bike" ? 1 : .3, balance: 30, balanceDamping: 8, maxLean: 45, pivotTurn: .6, rolling: .25, boost: 1, gears: [.3, .58, 1], pull: [1.7, 1.05, .7], shiftTime: .55, idle: 800, redline: 3800, ...setting,
        };
        const spec = this.spec = setting.spec;
        this.bike = spec.kind === "bike";
        this.tank = spec.kind === "tank";
        const n = spec.wheels.length, quarter = spec.mass / n;
        const w = 2 * Math.PI * this.s.frequency;
        this.k = quarter * w * w;
        this.c = 2 * this.s.damping * Math.sqrt(this.k * quarter);
        this.sag = Math.min(G / (w * w), this.s.travel * .6);
        this.lock = this.s.steer * Math.PI / 180;

        const ws = spec.wheels.map(w => w.position);
        const lo = [0, 1, 2].map(i => Math.min(...ws.map(p => p[i])));
        const hi = [0, 1, 2].map(i => Math.max(...ws.map(p => p[i])));
        const axle = lo[1];
        this.com = new Vector3((lo[0] + hi[0]) / 2, axle + this.s.centre, (lo[2] + hi[2]) / 2);
        const r = Math.max(...spec.wheels.map(w => w.radius));
        const box = spec.body ?? {
            min: [lo[0] - .1, axle - .05, lo[2] - r - .45],
            max: [hi[0] + .1, axle + .75, hi[2] + r + .35],
        };
        this.corners = [];
        for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]])
            this.corners.push(new Vector3(x, y, z).subtract(this.com));

        this.owned = !setting.world;
        this.world = setting.world ?? new World({ gravity: { x: 0, y: -G, z: 0 }, allowSleep: false });
        this.solids = new NearSolids(this.world, this.owned ? setting.solids : undefined);
        this.body = new RigidBody({
            shape: new Hull(this.corners.map(c => ({ x: c.x, y: c.y, z: c.z }))), mass: spec.mass,
            friction: .6, linearDamping: .02, angularDamping: .3,
        });
        this.world.add(this.body);

        this.wheels = spec.wheels.map(spec => ({
            spec, grounded: false, length: this.sag, spin: 0, omega: 0, load: 0, slipping: false,
            contact: new Vector3(0, 0, 0), normal: new Vector3(0, 1, 0),
        }));
        this.place(at[0], at[2], yaw);
    }

    /** stand it on its wheels at x / z, nose turned `yaw` (rad, 0 = -z, + turns left) */
    place(x: number, z: number, yaw = 0, y?: number) {
        const b = this.body;
        const h = y ?? Math.max(...this.spec.wheels.map(w => {
            const c = Math.cos(yaw), s = Math.sin(yaw), px = w.position[0], pz = w.position[2];
            return this.s.ground(x + px * c + pz * s, z - px * s + pz * c);
        }));
        b.rotation[0] = 0; b.rotation[1] = Math.sin(yaw / 2); b.rotation[2] = 0; b.rotation[3] = Math.cos(yaw / 2);
        b.position.x = x; b.position.y = h + this.com[1] + .02; b.position.z = z;
        b.velocity.x = b.velocity.y = b.velocity.z = 0;
        b.angularVelocity.x = b.angularVelocity.y = b.angularVelocity.z = 0;
        b.updateInertia();
        b.wake();
        this.fallen = false;
        this.last.set(b.velocity);
        if (this.owned) this.solids.gather([b.position]);
    }

    /** bike: stand it back up where it lies, nose kept */
    raise() {
        const q = this.body.rotation, n = q.rotate(set(this.nose, 0, 0, -1));
        this.place(this.body.position.x, this.body.position.z, Math.atan2(-n[0], -n[2]));
    }

    /** alone: steps its own world. Shared: use `Vehicles.update` */
    update(dt: number, input: DriveInput = { throttle: 0, steer: 0 }) {
        const step = this.world.timestep;
        this.left += Math.min(dt, .25);
        this.solids.gather([this.body.position]);
        while (this.left >= step)
        {
            this.left -= step;
            this.drive(step, input);
            this.world.step();
        }
    }

    /** model space -> world, into out (a point; w = 0 for a direction) */
    toWorld(p: Point, out = new Vector3(0, 0, 0), w = 1): Vector3 {
        out[0] = p[0] - this.com[0] * w; out[1] = p[1] - this.com[1] * w; out[2] = p[2] - this.com[2] * w;
        this.body.rotation.rotate(out);
        if (w) out.add(this.body.position);
        return out;
    }

    /** model matrix (column major 4x4) */
    matrix<T extends M16>(out: T): T {
        return this.body.rotation.writeMatrix(out, this.toWorld([0, 0, 0], this.local));
    }

    /** wheel `i` node move (model space, for `Model.move`): suspension travel, steer, spin round its rest centre */
    wheel<T extends M16>(i: number, out: T): T {
        const w = this.wheels[i], p = w.spec.position;
        const yaw = w.spec.steer ? -this.steering : 0;
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(w.spin), sx = Math.sin(w.spin);
        // Ry(yaw) * Rx(spin)
        out[0] = cy; out[1] = 0; out[2] = -sy; out[3] = 0;
        out[4] = sy * sx; out[5] = cx; out[6] = cy * sx; out[7] = 0;
        out[8] = sy * cx; out[9] = -sx; out[10] = cy * cx; out[11] = 0;
        pivot(out, p, this.sag - w.length);
        if (!(w.spec.steer && this.spec.fork)) return out;
        // bike: the wheel only spins + travels in the fork; the fork turns it
        const r = Math.cos(w.spin), t = Math.sin(w.spin);
        out[0] = 1; out[1] = 0; out[2] = 0; out[4] = 0; out[5] = r; out[6] = t; out[8] = 0; out[9] = -t; out[10] = r;
        pivot(out, p, this.sag - w.length);
        const f = this.fork(FORK)!;
        return multiply(f, out, out);
    }

    /** bike fork node move (model space): turn round the raked axis; undefined without a fork */
    fork<T extends M16>(out: T): T | undefined {
        const f = this.spec.fork;
        if (!f) return undefined;
        this.turn.setAxisAngle(f.axis[0], f.axis[1], f.axis[2], -this.steering).writeMatrix(out);
        return pivot(out, f.position, 0);
    }

    /** the steering wheel's turn round its axis, rad */
    get wheelTurn() {
        return -this.steering / this.lock * (this.spec.steeringWheel?.turns ?? 1.5) * Math.PI;
    }

    /** steering wheel node move (model space); undefined without one in the spec */
    steeringWheel<T extends M16>(out: T): T | undefined {
        const sw = this.spec.steeringWheel;
        if (!sw) return undefined;
        const angle = this.wheelTurn;
        this.turn.setAxisAngle(sw.axis[0], sw.axis[1], sw.axis[2], angle).writeMatrix(out);
        return pivot(out, sw.position, 0);
    }

    /** a sudden push: `impulse` N·s (world) at model space point `at`, spread over `time` s (a gun's recoil, a hit) */
    kick(at: Point, impulse: Point, time = .06) {
        const k = 1 / time;
        this.kicks.push({ at: new Vector3(at[0], at[1], at[2]), force: new Vector3(impulse[0] * k, impulse[1] * k, impulse[2] * k), left: time });
    }

    // ---- physics ----

    /** this step's wheel, engine and drag forces (call before each world step) */
    drive(dt: number, input: DriveInput) {
        const b = this.body, s = this.s, spec = this.spec;
        const quarter = spec.mass / this.wheels.length;
        const q = b.rotation, up = q.rotate(set(this.up, 0, 1, 0)), nose = q.rotate(set(this.nose, 0, 0, -1));
        const v = b.velocity;
        this.speed = nose.dot(v);

        // steering: lock shrinks with speed, eases to the target
        const target = clamp(input.steer, -1, 1) * this.lock / (1 + Math.abs(this.speed) / s.steerFade);
        const rate = 2.2 * dt;
        this.steering += clamp(target - this.steering, -rate, rate);

        // engine / gearbox / brake. Automatic: each shift cuts the power (the nose settles), then eases it back in
        const throttle = clamp(input.throttle, -1, 1);
        const braking = throttle * this.speed < 0 && Math.abs(this.speed) > .5;
        const top = spec.topSpeed * s.boost;
        const tops = s.gears.map(g => g * top);
        const n = s.gears.length;
        if (throttle < 0 && this.speed < .5) this.gear = -1;
        else if (this.gear < 1 && (throttle > 0 || this.speed > .5)) this.gear = 1;
        if (this.gear >= 1 && this.shifting <= 0)
        {
            const v = Math.max(0, this.speed);
            if (this.gear < n && v > tops[this.gear - 1] * .95 && throttle > 0) this.shift(this.gear + 1);
            else if (this.gear > 1 && v < tops[this.gear - 2] * .6) this.shift(this.gear - 1);
        }
        this.shifting = Math.max(0, this.shifting - dt);
        const cut = this.shifting > s.shiftTime * .45 ? 0 : 1 - this.shifting / (s.shiftTime * .45);
        const want = braking ? 0 : Math.abs(throttle) * cut;
        this.power += clamp(want - this.power, -dt * 8, dt * 4);
        const gearTop = this.gear < 0 ? s.reverse : tops[Math.max(0, this.gear - 1)];
        const ratio = clamp(Math.abs(this.speed) / gearTop, 0, 1.05);
        const targetRpm = s.idle + (s.redline - s.idle) * ratio + (this.power * (1 - ratio) * 1200 * (this.gear === 1 || this.gear < 0 ? 1 : .3));
        this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 10);
        const driven = this.wheels.filter(w => w.spec.drive !== false).length || 1;
        const pull = this.gear < 0 ? 1.4 : s.pull[Math.max(0, this.gear - 1)] ?? 1;
        // full pull until near the gear's top, then the governor / rev limit eases it off
        const fade = clamp((1 - Math.abs(this.speed) / gearTop) / .12, 0, 1);
        const drive = braking || this.fallen ? 0 : Math.sign(throttle) * this.power * spec.mass * s.accel * pull * fade / driven;
        const brake = braking ? spec.mass * s.brake / this.wheels.length : 0;
        const rearZ = Math.max(...this.wheels.map(w => w.spec.position[2]));
        // tank: each track gets throttle -+ steer (steer right: the left track pulls harder); turned by a yaw torque to
        // the wanted rate (the tracks skid sideways while turning, so they don't fight it)
        const steerIn = clamp(input.steer, -1, 1);
        const track = (side: number) => {
            const t = throttle - side * steerIn * (throttle ? .5 : 1);
            return clamp(t, -1, 1);
        };
        const tankDrive = (side: number) => braking && !steerIn ? 0 : track(side) * Math.max(this.power, steerIn ? 1 : 0) * spec.mass * s.accel * pull * fade / driven;

        const { mount, r, rt, pv, fwd, side, force } = this, dir = set(this.dir, -up[0], -up[1], -up[2]);
        for (const w of this.wheels)
        {
            const ws = w.spec, p = ws.position;
            this.toWorld(set(this.local, p[0], p[1] + this.sag, p[2]), mount);
            const reach = s.travel + ws.radius;
            const hit = this.cast(mount, dir, reach, w.normal);
            const locked = !!input.parked || (!!input.handbrake && p[2] >= rearZ - .01);
            if (hit === null)
            {
                w.grounded = false; w.load = 0; w.slipping = false;
                w.length = Math.min(s.travel, w.length + dt * 2);
                w.omega = locked ? 0 : w.omega * .995 + (ws.drive !== false ? drive / quarter * dt / ws.radius * .2 : 0);
                w.spin -= w.omega * dt;
                continue;
            }
            w.grounded = true;
            w.length = Math.max(0, hit - ws.radius);
            w.contact.set(mount); w.contact.add(set(r, dir[0] * hit, dir[1] * hit, dir[2] * hit));
            r.set(w.contact); r.subtract(b.position);
            pointVelocity(b, r, pv);

            // spring + damper along the body's up, a hard stop at the end of travel
            const vUp = pv.dot(up);
            let load = this.k * (2 * this.sag - w.length) - this.c * vUp;
            // anti-roll bar: the axle's other wheel more compressed pushes this one down less / more
            const other = this.wheels.find(o => o !== w && Math.abs(o.spec.position[2] - p[2]) < .05);
            if (other?.grounded) load += this.k * s.antiRoll * (other.length - w.length);
            if (w.length < .02) load += this.k * 20 * (.02 - w.length) - this.c * 2 * Math.min(0, vUp);
            load = Math.max(0, load);
            w.load = load;

            // tyre frame on the ground
            const yaw = ws.steer ? -this.steering : 0;
            q.rotate(set(fwd, -Math.sin(yaw), 0, -Math.cos(yaw)));
            const n = w.normal, fn = fwd.dot(n);
            fwd.subtract(n[0] * fn, n[1] * fn, n[2] * fn).normalize();
            side.set(fwd); side.cross(n).normalize();
            const vLong = pv.dot(fwd);
            // tank: sideways from the hull's own velocity, not the turn (skid steer)
            const vLat = this.tank ? set(this.r, v.x, v.y, v.z).dot(side) : pv.dot(side);
            r.set(w.contact); r.subtract(b.position);

            const limit = s.grip * load;
            let fLat = -vLat * quarter * LATERAL;
            let fLong: number;
            if (locked) fLong = -vLong * quarter * LOCK;
            else if (brake) fLong = -Math.sign(vLong) * Math.min(brake, Math.abs(vLong) * quarter * LOCK);
            else if (this.tank) fLong = tankDrive(ws.side ?? Math.sign(p[0])) - Math.sign(vLong) * Math.min(Math.abs(vLong) * quarter * LOCK, load * s.rolling * (throttle || steerIn ? .15 : 1));
            else fLong = (ws.drive !== false ? drive : 0) - vLong * quarter * (throttle ? .02 : .08);
            if (locked && !input.parked) fLat = clamp(fLat, -limit * s.slide, limit * s.slide);
            // down: the tyres skid (a lying bike slides on, spinning)
            if (this.fallen) { fLat = clamp(fLat, -limit * .25, limit * .25); fLong = clamp(fLong, -limit * .25, limit * .25); }
            const total = Math.hypot(fLong, fLat);
            w.slipping = total > limit;
            if (w.slipping) { fLong *= limit / total; fLat *= limit / total; }

            w.omega = locked ? 0 : vLong / (ws.spin ?? ws.radius);
            w.spin -= w.omega * dt;
            // bike: the tyre's load stands straight up off the ground (a leaned bike tips by it), car: along the body
            const ld = this.bike ? w.normal : up;
            this.push(r, set(force, ld[0] * load, ld[1] * load, ld[2] * load));
            // tyre forces act part way up to the centre of mass height: less roll / trip (arcade, `roll`)
            const lift = -r.dot(up) * (1 - (this.fallen ? 1 : s.roll));
            set(rt, r[0] + up[0] * lift, r[1] + up[1] * lift, r[2] + up[2] * lift);
            this.push(rt, set(force, fwd[0] * fLong + side[0] * fLat, fwd[1] * fLong + side[1] * fLat, fwd[2] * fLong + side[2] * fLat));
        }

        // tank: yaw torque towards the wanted turn rate (on the spot: full, moving: a bit less), only with tracks down
        if (this.tank && !input.parked)
        {
            const grounded = this.wheels.filter(w => w.grounded).length / this.wheels.length;
            const want = -steerIn * s.pivotTurn * (1 - .35 * Math.min(1, Math.abs(this.speed) / spec.topSpeed)) * Math.sign(this.speed < -.5 ? -1 : 1);
            const w = b.angularVelocity, now = w.x * up[0] + w.y * up[1] + w.z * up[2];
            const I = spec.mass * 3.5, t = clamp((want - now) * I * 4, -spec.mass * 6, spec.mass * 6) * grounded;
            b.applyTorque({ x: up[0] * t, y: up[1] * t, z: up[2] * t });
        }
        for (let i = this.kicks.length - 1; i >= 0; i--)
        {
            const k = this.kicks[i];
            this.toWorld(set(this.local, k.at[0], k.at[1], k.at[2]), r);
            r.subtract(b.position);
            this.push(r, k.force);
            if ((k.left -= dt) <= 0) this.kicks.splice(i, 1);
        }

        // chassis corners in the ground: a stiff spring + friction (the ground is a height function, no body)
        const corner = this.corner;
        const kc = spec.mass * 300, cc = 2 * Math.sqrt(kc * spec.mass) * .3;
        for (const c of this.corners)
        {
            this.toWorld(set(this.local, c[0] + this.com[0], c[1] + this.com[1], c[2] + this.com[2]), corner);
            const depth = this.s.ground(corner[0], corner[2]) - corner[1];
            if (depth <= 0) continue;
            r.set(corner); r.subtract(b.position);
            pointVelocity(b, r, pv);
            const fy = Math.max(0, kc * depth - cc * pv[1]), rub = spec.mass * .5 * Math.min(1, fy / (spec.mass * G));
            this.push(r, set(force, -pv[0] * rub, fy, -pv[2] * rub));
        }

        // a hard hit: speed lost in one step
        const bv = b.velocity;
        this.impact = Math.hypot(bv.x - this.last[0], bv.y - this.last[1], bv.z - this.last[2]);
        if (this.impact > 3) this.crashVelocity.set(this.last);
        this.last.set(bv);
        this.calm = Math.max(0, this.calm - dt);
        if (this.bike) this.balance(dt, input);
        else if (this.impact > this.crashAt && this.calm <= 0)
        {
            this.calm = 1;
            this.oncrash?.(Math.hypot(this.crashVelocity[0], this.crashVelocity[1], this.crashVelocity[2]), this.impact);
        }

        // air drag
        const sp = Math.hypot(v.x, v.y, v.z), drag = .5 * sp;
        b.applyForce({ x: -v.x * drag, y: -v.y * drag, z: -v.z * drag });
    }

    /** bike: rider's balance (a capped roll torque towards the lean the turn wants), the kickstand (
     * leans it left, weakly) when nobody rides it, feet down when ridden and stopped; nothing once down (it falls, slides, spins) */
    private balance(dt: number, input: DriveInput) {
        const b = this.body, s = this.s, q = b.rotation, spec = this.spec, m = spec.mass;
        const nose = q.rotate(set(this.nose, 0, 0, -1)), right = q.rotate(set(this.right, 1, 0, 0));
        this.lean = Math.asin(clamp(-right[1], -1, 1));
        const max = s.maxLean * Math.PI / 180;
        // a hard hit: speed lost in one step
        const v = b.velocity, impact = this.impact;
        // lean alone can't tell upside down (lean ~0 again): the body's up pointing down counts too
        const up = q.rotate(set(this.up, 0, 1, 0));
        if (!this.fallen && (Math.abs(this.lean) > max + .35 || up[1] < .3 || impact > this.crashAt)) this.crash(impact);
        if (this.fallen)
        {
            // landed on its back (bars + seat): tips onto a side and lies there, never back up by itself
            if (up[1] < -.2 && b.position.y - this.s.ground(b.position.x, b.position.z) < 1.2)
            {
                const side = right[1] >= 0 ? 1 : -1, t = m * G * .5 * side;
                b.applyTorque({ x: nose[0] * t, y: nose[1] * t, z: nose[2] * t });
            }
            return;
        }
        const rate = b.angularVelocity.x * nose[0] + b.angularVelocity.y * nose[1] + b.angularVelocity.z * nose[2];
        // ridden: lean into the turn; stopped, the feet hold it up; slow, nothing slides sideways (no glide)
        const ws = spec.wheels, base = Math.abs(ws[0].position[2] - ws[1].position[2]) || 1.4;
        // nobody on it + slow: on the kickstand (leans left, holds weakly: a good shove tips it over)
        const stand = !input.ridden && Math.abs(this.speed) < 1.5;
        const target = stand ? -.2 : clamp(Math.atan(this.speed * this.speed * Math.tan(this.steering) / (base * G)), -max, max);
        const cap = m * G * (stand ? .18 : Math.abs(this.speed) < 1.5 ? .6 : .4);
        const t = clamp(m * (s.balance * (target - this.lean) - s.balanceDamping * rate), -cap, cap);
        b.applyTorque({ x: nose[0] * t, y: nose[1] * t, z: nose[2] * t });
        if (Math.abs(this.speed) < 1.5)
        {
            const side = right[0] * v.x + right[2] * v.z, k = m * 8;
            b.applyForce({ x: -right[0] * side * k, y: 0, z: -right[2] * side * k });
        }
        void dt;
    }

    /** down: balance off, a roll + spin kick from the speed (it tumbles, then slides on its side) */
    private crash(impact: number) {
        const b = this.body, v = impact > 3 ? this.crashVelocity : b.velocity, speed = Math.hypot(v[0], v[1], v[2]);
        if (impact <= 3) this.crashVelocity.set(b.velocity);
        this.fallen = true;
        const side = this.lean !== 0 ? Math.sign(this.lean) : Math.random() < .5 ? -1 : 1;
        const n = this.nose, w = b.angularVelocity, kick = 1.5 + Math.min(4, (speed + impact) * .15), spin = (Math.random() - .5) * Math.min(5, speed * .25);
        w.x += n[0] * kick * side; w.y += n[1] * kick * side + spin; w.z += n[2] * kick * side;
        this.oncrash?.(speed, impact);
    }

    private shift(to: number) {
        const up = to > this.gear;
        this.gear = to;
        this.shifting = this.s.shiftTime;
        this.onshift?.(to, up);
    }

    /** distance to the ground / a solid along dir (unit) within reach, or null; normal into `normal` */
    private cast(from: Vector3, dir: Vector3, reach: number, normal: Vector3): number | null {
        let best: number | null = null;
        const ground = this.s.ground;
        const f = (t: number) => from[1] + dir[1] * t - ground(from[0] + dir[0] * t, from[2] + dir[2] * t);
        if (f(0) <= 0) best = 0;
        else
        {
            const N = 6;
            let a = 0, fa = f(0);
            for (let i = 1; i <= N; i++)
            {
                const t = reach * i / N, ft = f(t);
                if (ft <= 0)
                {
                    let lo = a, hi = t;
                    for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
                    best = (lo + hi) / 2;
                    break;
                }
                a = t; fa = ft;
            }
            void fa;
        }
        if (best !== null)
        {
            const x = from[0] + dir[0] * best, z = from[2] + dir[2] * best, e = .1;
            normal[0] = (ground(x - e, z) - ground(x + e, z)) / (2 * e); normal[1] = 1;
            normal[2] = (ground(x, z - e) - ground(x, z + e)) / (2 * e);
            normal.normalize();
        }
        const solids = this.solids.bodies;
        if (solids.length)
        {
            const hit = raycast(solids, from, dir, reach);
            if (hit && (best === null || hit.t < best) && hit.normal.y > .3)
            {
                best = hit.t;
                normal.set(hit.normal);
            }
        }
        return best;
    }

    /** force F at offset r from the centre of mass */
    private push(r: Vector3, F: Vector3) {
        this.body.applyForce(F);
        this.body.applyTorque({ x: r[1] * F[2] - r[2] * F[1], y: r[2] * F[0] - r[0] * F[2], z: r[0] * F[1] - r[1] * F[0] });
    }
}

const FORK = new Float32Array(16);
/** a * b (column major 4x4) into out (out may be b) */
function multiply<T extends M16>(a: M16, b: M16, out: T): T {
    const t = TMP;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        t[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    for (let i = 0; i < 16; i++) out[i] = t[i];
    return out;
}
const TMP = new Float32Array(16);
function clamp(x: number, lo: number, hi: number) { return x < lo ? lo : x > hi ? hi : x; }
/** fill a scratch vector (no allocation, unlike `new Vector3`) */
function set(v: Vector3, x: number, y: number, z: number) { v[0] = x; v[1] = y; v[2] = z; return v; }
/** velocity of the body at offset r (v + w x r), into out */
function pointVelocity(b: RigidBody, r: Vector3, out: Vector3) {
    out.set(b.angularVelocity); out.cross(r);
    return out.add(b.velocity);
}
/** out (rotation set, a node move) becomes T(p + up * lift) * R * T(-p) */
function pivot<T extends M16>(out: T, p: Point, lift: number): T {
    for (let i = 0; i < 3; i++)
        out[12 + i] = p[i] + (i === 1 ? lift : 0) - (out[i] * p[0] + out[4 + i] * p[1] + out[8 + i] * p[2]);
    out[15] = 1;
    return out;
}
