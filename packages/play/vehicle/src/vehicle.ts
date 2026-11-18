import { Box, Hull, RigidBody, World, raycast } from "@papit/rigidbody";
import { Vector3 } from "@papit/vector";
import { Quaternion } from "@papit/quaternion";
import type { DriveInput, Point, Solid, VehicleSetting, VehicleSpec, WheelState } from "./types";

import type { Matrix4 } from "@papit/matrix";

/** wheel / steering node moves are written by hand: no allocation per frame (Matrix4 ops make new matrices) */
type M16 = Matrix4 | Float32Array | Float64Array;
const G = 9.81;
/** cancel rates (1/s): how fast sideways / locked wheel speed is taken out, before the grip limit */
const LATERAL = 18, LOCK = 18;

/**
 * A car on `@papit/rigidbody`: a hull chassis plus raycast wheels (spring + damper each), tyre grip with a
 * friction circle, engine / brakes / handbrake and speed scaled steering. Model space is glTF (y up, nose -z).
 * Owns its world (the `solids` near the car as static boxes in it) and steps it in fixed steps inside `update`.
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
    /** called on every gear change (sound, a camera nudge) */
    onshift?: (gear: number, up: boolean) => void;

    private s: Required<Omit<VehicleSetting, "solids" | "body">> & Pick<VehicleSetting, "solids">;
    /** solids near the car, as static bodies in the world */
    private near = new Map<Solid, RigidBody>();
    private solids: RigidBody[] = [];
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

    constructor(setting: VehicleSetting, at: Point = [0, 0, 0], yaw = 0) {
        this.s = {
            travel: .3, frequency: 1.3, damping: .3, grip: 1.1, slide: .35, accel: 3.5, brake: 8, reverse: 5,
            steer: 34, steerFade: 6, centre: 0, antiRoll: 1.5, roll: .3, boost: 1, gears: [.3, .58, 1], pull: [1.7, 1.05, .7], shiftTime: .55, idle: 800, redline: 3800, ...setting,
        };
        const spec = this.spec = setting.spec;
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

        this.world = new World({ gravity: { x: 0, y: -G, z: 0 }, allowSleep: false });
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

    /** the solids within reach become static bodies in the world, the ones left behind leave it */
    private gather() {
        const src = this.s.solids;
        if (!src) return;
        const { x, z } = this.body.position, R = 4;
        const found = new Set<Solid>();
        if (typeof src === "function") { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of src(x + i * R, z + j * R)) found.add(s); }
        else for (const s of src) if (s.max[0] > x - 2 * R && s.min[0] < x + 2 * R && s.max[2] > z - 2 * R && s.min[2] < z + 2 * R) found.add(s);
        for (const [s, b] of this.near) if (!found.has(s)) { this.world.remove(b); this.near.delete(s); }
        for (const s of found) if (!this.near.has(s))
        {
            const { min, max } = s;
            this.near.set(s, this.world.add(new RigidBody({
                shape: new Box(Math.max(.02, max[0] - min[0]), Math.max(.02, max[1] - min[1]), Math.max(.02, max[2] - min[2])),
                position: { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 },
            })));
        }
        this.solids = [...this.near.values()];
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
        this.gather();
    }

    update(dt: number, input: DriveInput = { throttle: 0, steer: 0 }) {
        const step = this.world.timestep;
        this.left += Math.min(dt, .25);
        this.gather();
        while (this.left >= step)
        {
            this.left -= step;
            this.forces(step, input);
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
        return pivot(out, p, this.sag - w.length);
    }

    /** steering wheel node move (model space); undefined without one in the spec */
    steeringWheel<T extends M16>(out: T): T | undefined {
        const sw = this.spec.steeringWheel;
        if (!sw) return undefined;
        const angle = -this.steering / this.lock * (sw.turns ?? 1.5) * Math.PI;
        this.turn.setAxisAngle(sw.axis[0], sw.axis[1], sw.axis[2], angle).writeMatrix(out);
        return pivot(out, sw.position, 0);
    }

    // ---- physics ----

    private forces(dt: number, input: DriveInput) {
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
        const drive = braking ? 0 : Math.sign(throttle) * this.power * spec.mass * s.accel * pull * fade / driven;
        const brake = braking ? spec.mass * s.brake / this.wheels.length : 0;
        const rearZ = Math.max(...this.wheels.map(w => w.spec.position[2]));

        const { mount, r, rt, pv, fwd, side, force } = this, dir = set(this.dir, -up[0], -up[1], -up[2]);
        for (const w of this.wheels)
        {
            const ws = w.spec, p = ws.position;
            this.toWorld(set(this.local, p[0], p[1] + this.sag, p[2]), mount);
            const reach = s.travel + ws.radius;
            const hit = this.cast(mount, dir, reach, w.normal);
            const locked = !!input.handbrake && p[2] >= rearZ - .01;
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
            const vLong = pv.dot(fwd), vLat = pv.dot(side);

            const limit = s.grip * load;
            let fLat = -vLat * quarter * LATERAL;
            let fLong: number;
            if (locked) fLong = -vLong * quarter * LOCK;
            else if (brake) fLong = -Math.sign(vLong) * Math.min(brake, Math.abs(vLong) * quarter * LOCK);
            else fLong = (ws.drive !== false ? drive : 0) - vLong * quarter * (throttle ? .02 : .08);
            if (locked) fLat = clamp(fLat, -limit * s.slide, limit * s.slide);
            const total = Math.hypot(fLong, fLat);
            w.slipping = total > limit;
            if (w.slipping) { fLong *= limit / total; fLat *= limit / total; }

            w.omega = locked ? 0 : vLong / ws.radius;
            w.spin -= w.omega * dt;
            this.push(r, set(force, up[0] * load, up[1] * load, up[2] * load));
            // tyre forces act part way up to the centre of mass height: less roll / trip (arcade, `roll`)
            const lift = -r.dot(up) * (1 - s.roll);
            set(rt, r[0] + up[0] * lift, r[1] + up[1] * lift, r[2] + up[2] * lift);
            this.push(rt, set(force, fwd[0] * fLong + side[0] * fLat, fwd[1] * fLong + side[1] * fLat, fwd[2] * fLong + side[2] * fLat));
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

        // air drag
        const sp = Math.hypot(v.x, v.y, v.z), drag = .5 * sp;
        b.applyForce({ x: -v.x * drag, y: -v.y * drag, z: -v.z * drag });
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
        if (this.solids.length)
        {
            const hit = raycast(this.solids, from, dir, reach);
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
