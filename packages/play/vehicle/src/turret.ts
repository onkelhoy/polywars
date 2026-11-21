import { Vector3 } from "@papit/vector";
import { Matrix4 } from "@papit/matrix";
import type { Vehicle } from "./vehicle";
import type { Point } from "./types";

export type TurretSetting = {
    /** turret traverse, degrees / s. Default 18 (hand / slow hydraulic) */
    traverse?: number;
    /** gun elevation speed, degrees / s. Default 5 */
    elevate?: number;
    /** barrel recoil travel, m, and how long it takes back (s). Defaults .45 / .7 */
    recoil?: number;
    recoilTime?: number;
};

/**
 * A tank's turret + gun on a `Vehicle` (spec `turret` / `gun`): turns and raises at its own (slow) speeds towards a
 * wanted world direction; the hull turning doesn't turn it. Node moves for drawing, the muzzle + bore direction for shots.
 */
export class Turret {
    /** rad, turret round the hull's up (+ left) */
    yaw = 0;
    /** rad, gun up + */
    pitch = 0;
    /** traverse speed now, rad / s (+ left): the motor sound */
    rate = 0;
    /** 0..1 the barrel's run back (1 just fired) */
    back = 0;
    private s: Required<TurretSetting>;
    private range: [number, number];

    constructor(readonly vehicle: Vehicle, setting: TurretSetting = {}) {
        this.s = { traverse: 18, elevate: 5, recoil: .45, recoilTime: .7, ...setting };
        const e = vehicle.spec.gun?.elevation ?? [-8, 20];
        this.range = [e[0] * Math.PI / 180, e[1] * Math.PI / 180];
    }

    /** turn towards world direction `dir` (needn't be unit) */
    aim(dir: Point, dt: number) {
        // into hull space
        const q = this.vehicle.body.rotation, inv = [-q[0], -q[1], -q[2], q[3]];
        const d = rotate(inv, dir);
        const wantYaw = Math.atan2(-d[0], -d[2]);
        const wantPitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
        let dy = wantYaw - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const ty = this.s.traverse * Math.PI / 180 * dt, te = this.s.elevate * Math.PI / 180 * dt;
        const turn = Math.max(-ty, Math.min(ty, dy));
        this.yaw += turn;
        this.rate = dt > 0 ? turn / dt : 0;
        this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
        const p = Math.max(this.range[0], Math.min(this.range[1], wantPitch));
        this.pitch += Math.max(-te, Math.min(te, p - this.pitch));
    }

    /** start the barrel's run back */
    fire() { this.back = 1; }

    update(dt: number) {
        this.back = Math.max(0, this.back - dt / this.s.recoilTime);
    }

    /** turret node move (model space) */
    turretMatrix(out = Matrix4.create()) {
        const t = this.vehicle.spec.turret!;
        return about(Matrix4.rotationY(this.yaw), t.position, out);
    }

    /** gun node move (model space): turret turn x raise round the trunnion, run back along the bore */
    gunMatrix(out = Matrix4.create()) {
        const g = this.vehicle.spec.gun!;
        // fast back, slow home
        const k = this.back, run = (k > .85 ? (1 - k) / .15 : k / .85) * this.s.recoil;
        const raise = about(Matrix4.rotationX(this.pitch), g.position, Matrix4.create());
        const slide = Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, run, 1]);
        const m = this.turretMatrix().multiply(raise).multiply(slide);
        for (let i = 0; i < 16; i++) out[i] = m[i];
        return out;
    }

    /** muzzle, world */
    muzzle(out = new Vector3(0, 0, 0)) {
        const m = this.gunMatrix(), p = this.vehicle.spec.gun!.muzzle;
        return this.vehicle.toWorld(apply(m, p, 1), out);
    }

    /** bore direction, world (unit) */
    direction(out = new Vector3(0, 0, 0)) {
        const m = this.gunMatrix();
        return this.vehicle.toWorld(apply(m, [0, 0, -1], 0), out, 0).normalize();
    }
}

/** T(p) * R * T(-p) into out */
function about(R: Matrix4, p: Point, out: Matrix4) {
    for (let i = 0; i < 16; i++) out[i] = R[i];
    for (let i = 0; i < 3; i++) out[12 + i] = p[i] - (R[i] * p[0] + R[4 + i] * p[1] + R[8 + i] * p[2]);
    return out;
}
function apply(m: ArrayLike<number>, p: Point, w: number): number[] {
    return [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i] * w);
}
function rotate(q: number[], v: Point): number[] {
    const [x, y, z, w] = q, vx = v[0], vy = v[1], vz = v[2];
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
