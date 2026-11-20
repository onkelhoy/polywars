import { Vector3 } from "@papit/vector";
import type { BlastForceSetting, Front, Target, Vec3 } from "./types";

const SOUND = 343;

/** sound speed front with Sadovsky overpressure (kPa) */
class PlainFront implements Front {
    radius = 0;
    private scale: number;
    constructor(power: number) { this.scale = Math.cbrt(power); }
    step(dt: number) { return this.radius += SOUND * dt; }
    pressure(radius = this.radius) { const z = Math.max(.3, radius / this.scale); return 84 / z + 270 / z ** 2 + 700 / z ** 3; }
}

type Live = { at: Vec3; power: number; scale: number; front: Front; left: { target: Target; distance: number }[]; age: number };

/**
 * A blast's push. The front goes out; when it reaches a target, the target gets an impulse from the
 * overpressure's specific impulse (≈ 200 W^⅔ / R Pa·s) on its face (π size²) times what gets past cover,
 * away from a point a bit under the blast (so things lift), and a tumble. Mass does the rest.
 * Far out it is only a gust: `wind(at)` for grass, smoke, cloth.
 */
export class BlastForce {
    readonly blasts: Live[] = [];
    private setting: BlastForceSetting;

    constructor(setting: BlastForceSetting) {
        this.setting = setting;
    }

    /** `power` kg TNT at `at` */
    blast(at: ArrayLike<number>, power: number) {
        const p: Vec3 = [at[0], at[1], at[2]], front = this.setting.front?.(power) ?? new PlainFront(power), scale = Math.cbrt(power);
        const left: Live["left"] = [];
        // only what it can still move: past ~40 scaled metres it is a breeze
        const reach = 40 * scale;
        for (const target of this.setting.targets())
        {
            const q = target.position, distance = Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2]);
            if (distance < reach) left.push({ target, distance });
        }
        left.sort((a, b) => a.distance - b.distance);
        this.blasts.push({ at: p, power, scale, front, left, age: 0 });
    }

    update(dt: number) {
        for (let i = this.blasts.length - 1; i >= 0; i--)
        {
            const b = this.blasts[i];
            b.age += dt;
            const r = b.front.step(dt);
            while (b.left.length && b.left[0].distance <= r) this.hit(b, b.left.shift()!.target);
            if (r > 60 * b.scale) this.blasts.splice(i, 1);
        }
    }

    private hit(b: Live, target: Target) {
        const q = target.position, size = Math.max(.05, target.size), strength = this.setting.strength ?? 2;
        const to: Vec3 = [q.x, q.y, q.z];
        const distance = Math.max(size, Math.hypot(q.x - b.at[0], q.y - b.at[1], q.z - b.at[2]));
        const cover = Math.max(0, Math.min(1, this.setting.cover?.(b.at, to, target) ?? 1));
        if (cover <= 0) return;
        // from a point under the blast: the ground bounce lifts things
        const d = new Vector3(q.x - b.at[0], q.y - (b.at[1] - size * .5 - b.scale * .3), q.z - b.at[2]).normalize();
        const specific = 200 * b.power ** (2 / 3) / distance;
        const impulse = specific * Math.PI * size * size * cover * strength;
        const dv = impulse / Math.max(.01, target.mass);
        // tumble: top goes with the push
        const up = new Vector3(0, 1, 0), axis = Vector3.cross(up, d);
        const turn = axis.magnitude > 1e-4 ? axis.normalize().multiply(dv / size * .4) : axis;
        target.push([d.x * dv, d.y * dv, d.z * dv], [turn.x, turn.y, turn.z],
            { pressure: b.front.pressure(distance) * cover, impulse, distance, cover, direction: [d.x, d.y, d.z] });
        this.setting.onhit?.(target, { pressure: b.front.pressure(distance) * cover, impulse, distance, cover, direction: [d.x, d.y, d.z] });
    }

    /**
     * Gust at `at` now, m/s: a hard push out as the front passes, then a weaker pull back (the vacuum).
     * Feed grass, smoke wind, loose cloth.
     */
    wind(at: ArrayLike<number>): Vec3 {
        const out: Vec3 = [0, 0, 0];
        for (const b of this.blasts)
        {
            const dx = at[0] - b.at[0], dz = at[2] - b.at[2], h = Math.hypot(dx, dz);
            if (h < 1e-3) continue;
            const r = b.front.radius, width = b.scale * 2 + r * .08, k = (h - r) / width;
            // kPa to gust: ~ 15 m/s per kPa at first, capped
            const peak = Math.min(80, b.front.pressure(h) * 15);
            const v = peak * (Math.exp(-k * k) - .25 * Math.exp(-((k + 2.5) ** 2) / 2));
            out[0] += dx / h * v; out[2] += dz / h * v;
        }
        return out;
    }

    clear() { this.blasts.length = 0; }
}
