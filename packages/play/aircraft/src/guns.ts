import type { Vehicle } from "@polywar/vehicle";
import type { GunsSetting, Shot, Vec3 } from "./types";

/**
 * Fixed wing guns: each fires at `rate` while the trigger is held and it has rounds, aimed to meet the others
 * `convergence` ahead, a little spread. Shots go out through `onshot` (the host flies them, e.g. `@polywar/ballistics`);
 * the recoil of every round pushes back on the plane. Out of rounds: dry.
 */
export class Guns {
    trigger = false;
    readonly rounds: number[];
    /** shots fired this update, per gun (sound, flashes) */
    readonly fired: number[];
    onshot?: (shot: Shot) => void;
    private s: Required<GunsSetting>;
    private wait: number[];
    private count = 0;

    constructor(readonly vehicle: Vehicle, setting: GunsSetting) {
        const n = setting.muzzles.length;
        const rounds = setting.rounds ?? setting.muzzles.map((_, i) => {
            // inboard pairs carry more (P-51D: 400, 270 outboard)
            const x = Math.abs(setting.muzzles[i][0]), xs = setting.muzzles.map(m => Math.abs(m[0])).sort((a, b) => a - b);
            return xs.indexOf(x) >= n * 2 / 3 ? 270 : 400;
        });
        this.s = { rate: 800, speed: 870, convergence: 300, spread: .0025, bullet: .046, tracer: 4, ...setting, rounds };
        this.rounds = [...rounds];
        this.fired = setting.muzzles.map(() => 0);
        // the guns don't all fire in step
        this.wait = setting.muzzles.map(() => Math.random() * 60 / this.s.rate);
    }

    get total() { return this.rounds.reduce((a, b) => a + b, 0); }
    get capacity() { return this.s.rounds.reduce((a, b) => a + b, 0); }
    rearm() { this.rounds.splice(0, this.rounds.length, ...this.s.rounds); }

    update(dt: number) {
        const s = this.s, car = this.vehicle, gap = 60 / s.rate;
        this.fired.fill(0);
        for (let i = 0; i < s.muzzles.length; i++)
        {
            this.wait[i] = Math.max(-gap, this.wait[i] - dt);
            while (this.trigger && this.rounds[i] > 0 && this.wait[i] <= 0)
            {
                this.wait[i] += gap * (.95 + Math.random() * .1);
                this.rounds[i]--;
                this.fired[i]++;
                const m = s.muzzles[i];
                const from = car.toWorld(m), aim = car.toWorld([0, m[1], m[2] - s.convergence]);
                const d: Vec3 = [aim[0] - from[0], aim[1] - from[1], aim[2] - from[2]];
                const l = Math.hypot(d[0], d[1], d[2]);
                for (let k = 0; k < 3; k++) d[k] = d[k] / l + (Math.random() - .5) * 2 * s.spread;
                const v = car.body.velocity;
                // the round leaves at the muzzle speed plus the plane's
                const vx = d[0] * s.speed + v.x, vy = d[1] * s.speed + v.y, vz = d[2] * s.speed + v.z, sp = Math.hypot(vx, vy, vz);
                this.onshot?.({ from: [from[0], from[1], from[2]], direction: [vx / sp, vy / sp, vz / sp], speed: sp, tracer: this.count++ % s.tracer === 0, gun: i });
                const k = s.bullet * s.speed * 1.4;
                car.kick(m, [-d[0] * k, -d[1] * k, -d[2] * k], .01);
            }
        }
    }
}
