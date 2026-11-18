import { Box, Hull, RigidBody, World, raycast } from "@papit/rigidbody";
import type { DriveInput, Solid, Vec3, VehicleSetting, VehicleSpec, WheelState } from "./types";

type M16 = { [i: number]: number };
const G = 9.81;
/** cancel rates (1/s): how fast sideways / locked wheel speed is taken out, before the grip limit */
const LATERAL = 18, LOCK = 18;

/**
 * A car on `@papit/rigidbody`: a hull chassis plus raycast wheels (spring + damper each), tyre grip with a
 * friction circle, engine / brakes / handbrake and speed scaled steering. Model space is glTF (y up, nose -z).
 * Owns its world (static `solids` as boxes in it) and steps it in fixed steps inside `update`.
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

    private s: Required<Omit<VehicleSetting, "solids" | "body">> & Pick<VehicleSetting, "solids">;
    private solids: RigidBody[] = [];
    /** centre of mass, model space */
    private com: Vec3;
    private corners: Vec3[];
    private k: number;
    private c: number;
    private sag: number;
    private lock: number;
    private left = 0;

    constructor(setting: VehicleSetting, at: Vec3 = [0, 0, 0], yaw = 0) {
        this.s = {
            travel: .3, frequency: 1.3, damping: .3, grip: 1.1, slide: .35, accel: 3.5, brake: 8, reverse: 5,
            steer: 34, steerFade: 6, centre: .15, ...setting,
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
        this.com = [(lo[0] + hi[0]) / 2, axle + this.s.centre, (lo[2] + hi[2]) / 2];
        const r = Math.max(...spec.wheels.map(w => w.radius));
        const box = spec.body ?? {
            min: [lo[0] - .1, axle - .05, lo[2] - r - .45] as Vec3,
            max: [hi[0] + .1, axle + .75, hi[2] + r + .35] as Vec3,
        };
        this.corners = [];
        for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]])
            this.corners.push([x - this.com[0], y - this.com[1], z - this.com[2]]);

        this.world = new World({ gravity: { x: 0, y: -G, z: 0 }, allowSleep: false });
        this.body = new RigidBody({
            shape: new Hull(this.corners.map(([x, y, z]) => ({ x, y, z }))), mass: spec.mass,
            friction: .6, linearDamping: .02, angularDamping: .3,
        });
        this.world.add(this.body);
        this.setSolids(setting.solids ?? []);

        this.wheels = spec.wheels.map(spec => ({
            spec, grounded: false, length: this.sag, spin: 0, omega: 0, load: 0, slipping: false,
            contact: [0, 0, 0], normal: [0, 1, 0],
        }));
        this.place(at[0], at[2], yaw);
    }

    /** the static boxes (replaces the old ones) */
    setSolids(solids: Solid[]) {
        for (const b of this.solids) this.world.remove(b);
        this.solids = solids.map(({ min, max }) => this.world.add(new RigidBody({
            shape: new Box(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
            position: { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 },
        })));
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
    }

    update(dt: number, input: DriveInput = { throttle: 0, steer: 0 }) {
        const step = this.world.timestep;
        this.left += Math.min(dt, .25);
        while (this.left >= step)
        {
            this.left -= step;
            this.forces(step, input);
            this.world.step();
        }
    }

    /** model space -> world, into out (a point; w = 0 for a direction) */
    toWorld(p: Vec3, out: Vec3 = [0, 0, 0], w = 1): Vec3 {
        const x = p[0] - this.com[0] * w, y = p[1] - this.com[1] * w, z = p[2] - this.com[2] * w;
        this.rotate(x, y, z, out);
        if (w) { out[0] += this.body.position.x; out[1] += this.body.position.y; out[2] += this.body.position.z; }
        return out;
    }

    /** model matrix (column major 4x4) */
    matrix<T extends M16>(out: T): T {
        const b = this.body;
        rotation(b.rotation, out);
        const o = this.rotate(-this.com[0], -this.com[1], -this.com[2], [0, 0, 0]);
        out[12] = b.position.x + o[0]; out[13] = b.position.y + o[1]; out[14] = b.position.z + o[2]; out[15] = 1;
        out[3] = out[7] = out[11] = 0;
        return out;
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
        return pivot(out, p, [0, this.sag - w.length, 0]);
    }

    /** steering wheel node move (model space); undefined without one in the spec */
    steeringWheel<T extends M16>(out: T): T | undefined {
        const sw = this.spec.steeringWheel;
        if (!sw) return undefined;
        const angle = -this.steering / this.lock * (sw.turns ?? 1.5) * Math.PI;
        axisAngle(sw.axis, angle, out);
        return pivot(out, sw.position, [0, 0, 0]);
    }

    // ---- physics ----

    private forces(dt: number, input: DriveInput) {
        const b = this.body, s = this.s, spec = this.spec;
        const quarter = spec.mass / this.wheels.length;
        const up = this.rotate(0, 1, 0, [0, 0, 0]);
        const nose = this.rotate(0, 0, -1, [0, 0, 0]);
        const v = b.velocity;
        this.speed = v.x * nose[0] + v.y * nose[1] + v.z * nose[2];

        // steering: lock shrinks with speed, eases to the target
        const target = clamp(input.steer, -1, 1) * this.lock / (1 + Math.abs(this.speed) / s.steerFade);
        const rate = 2.2 * dt;
        this.steering += clamp(target - this.steering, -rate, rate);

        // engine / brake per wheel
        const throttle = clamp(input.throttle, -1, 1);
        const braking = throttle * this.speed < 0 && Math.abs(this.speed) > .5;
        const top = throttle > 0 ? spec.topSpeed : s.reverse;
        const driven = this.wheels.filter(w => w.spec.drive !== false).length || 1;
        const fade = Math.max(0, 1 - (this.speed / top) ** 2);
        const drive = braking ? 0 : throttle * spec.mass * s.accel * fade / driven;
        const brake = braking ? spec.mass * s.brake / this.wheels.length : 0;
        const rearZ = Math.max(...this.wheels.map(w => w.spec.position[2]));

        const mount: Vec3 = [0, 0, 0], dir: Vec3 = [-up[0], -up[1], -up[2]];
        const r: Vec3 = [0, 0, 0], pv: Vec3 = [0, 0, 0], fwd: Vec3 = [0, 0, 0], side: Vec3 = [0, 0, 0];
        for (const w of this.wheels)
        {
            const ws = w.spec, p = ws.position;
            this.toWorld([p[0], p[1] + this.sag, p[2]], mount);
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
            for (let i = 0; i < 3; i++) w.contact[i] = mount[i] + dir[i] * hit;
            r[0] = w.contact[0] - b.position.x; r[1] = w.contact[1] - b.position.y; r[2] = w.contact[2] - b.position.z;
            pointVelocity(b, r, pv);

            // spring + damper along the body's up, a hard stop at the end of travel
            const vUp = dot(pv, up);
            let load = this.k * (2 * this.sag - w.length) - this.c * vUp;
            if (w.length < .02) load += this.k * 20 * (.02 - w.length) - this.c * 2 * Math.min(0, vUp);
            load = Math.max(0, load);
            w.load = load;

            // tyre frame on the ground
            const yaw = ws.steer ? -this.steering : 0;
            this.rotate(-Math.sin(yaw), 0, -Math.cos(yaw), fwd);
            const n = w.normal, fn = dot(fwd, n);
            for (let i = 0; i < 3; i++) fwd[i] -= n[i] * fn;
            normalize(fwd);
            cross(fwd, n, side);
            normalize(side);
            const vLong = dot(pv, fwd), vLat = dot(pv, side);

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
            const F: Vec3 = [0, 0, 0];
            for (let i = 0; i < 3; i++) F[i] = up[i] * load + fwd[i] * fLong + side[i] * fLat;
            this.push(r, F);
        }

        // chassis corners in the ground: a stiff spring + friction (the ground is a height function, no body)
        const corner: Vec3 = [0, 0, 0];
        const kc = spec.mass * 300, cc = 2 * Math.sqrt(kc * spec.mass) * .3;
        for (const c of this.corners)
        {
            this.toWorld([c[0] + this.com[0], c[1] + this.com[1], c[2] + this.com[2]], corner);
            const depth = this.s.ground(corner[0], corner[2]) - corner[1];
            if (depth <= 0) continue;
            r[0] = corner[0] - b.position.x; r[1] = corner[1] - b.position.y; r[2] = corner[2] - b.position.z;
            pointVelocity(b, r, pv);
            const fy = Math.max(0, kc * depth - cc * pv[1]);
            this.push(r, [-pv[0] * spec.mass * .5 * Math.min(1, fy / (spec.mass * G)), fy, -pv[2] * spec.mass * .5 * Math.min(1, fy / (spec.mass * G))]);
        }

        // air drag
        const sp = Math.hypot(v.x, v.y, v.z), drag = .9 * sp;
        b.applyForce({ x: -v.x * drag, y: -v.y * drag, z: -v.z * drag });
    }

    /** distance to the ground / a solid along dir (unit) within reach, or null; normal into `normal` */
    private cast(from: Vec3, dir: Vec3, reach: number, normal: Vec3): number | null {
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
            normalize(normal);
        }
        if (this.solids.length)
        {
            const hit = raycast(this.solids, { x: from[0], y: from[1], z: from[2] }, { x: dir[0], y: dir[1], z: dir[2] }, reach);
            if (hit && (best === null || hit.t < best) && hit.normal.y > .3)
            {
                best = hit.t;
                normal[0] = hit.normal.x; normal[1] = hit.normal.y; normal[2] = hit.normal.z;
            }
        }
        return best;
    }

    /** force F at offset r from the centre of mass */
    private push(r: Vec3, F: Vec3) {
        this.body.applyForce({ x: F[0], y: F[1], z: F[2] });
        this.body.applyTorque({ x: r[1] * F[2] - r[2] * F[1], y: r[2] * F[0] - r[0] * F[2], z: r[0] * F[1] - r[1] * F[0] });
    }

    /** body local direction -> world */
    private rotate(x: number, y: number, z: number, out: Vec3): Vec3 {
        const q = this.body.rotation, qx = q[0], qy = q[1], qz = q[2], qw = q[3];
        const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
        out[0] = x + qw * tx + qy * tz - qz * ty;
        out[1] = y + qw * ty + qz * tx - qx * tz;
        out[2] = z + qw * tz + qx * ty - qy * tx;
        return out;
    }
}

function clamp(x: number, lo: number, hi: number) { return x < lo ? lo : x > hi ? hi : x; }
function dot(a: ArrayLike<number>, b: ArrayLike<number>) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: Vec3, b: Vec3, out: Vec3) {
    out[0] = a[1] * b[2] - a[2] * b[1]; out[1] = a[2] * b[0] - a[0] * b[2]; out[2] = a[0] * b[1] - a[1] * b[0];
    return out;
}
function normalize(v: Vec3) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    v[0] /= l; v[1] /= l; v[2] /= l;
    return v;
}
function pointVelocity(b: RigidBody, r: Vec3, out: Vec3) {
    const v = b.velocity, w = b.angularVelocity;
    out[0] = v.x + w.y * r[2] - w.z * r[1];
    out[1] = v.y + w.z * r[0] - w.x * r[2];
    out[2] = v.z + w.x * r[1] - w.y * r[0];
    return out;
}
/** rotation part of a quaternion into a column major 4x4 */
function rotation(q: ArrayLike<number>, out: M16) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y + z * w); out[2] = 2 * (x * z - y * w);
    out[4] = 2 * (x * y - z * w); out[5] = 1 - 2 * (x * x + z * z); out[6] = 2 * (y * z + x * w);
    out[8] = 2 * (x * z + y * w); out[9] = 2 * (y * z - x * w); out[10] = 1 - 2 * (x * x + y * y);
}
function axisAngle(a: Vec3, angle: number, out: M16) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1, s = Math.sin(angle / 2) / l;
    rotation([a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)], out);
    out[3] = out[7] = out[11] = 0;
}
/** out (rotation set) becomes T(p + shift) * R * T(-p) */
function pivot<T extends M16>(out: T, p: Vec3, shift: Vec3): T {
    for (let i = 0; i < 3; i++)
        out[12 + i] = p[i] + shift[i] - (out[i] * p[0] + out[4 + i] * p[1] + out[8 + i] * p[2]);
    out[15] = 1;
    return out;
}
