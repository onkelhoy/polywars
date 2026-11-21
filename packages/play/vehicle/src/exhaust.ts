import { Vector3 } from "@papit/vector";
import type { Puff } from "./dust";
import type { Vehicle } from "./vehicle";

export type ExhaustSetting = {
    /** draws a puff (e.g. `@polywar/smoke` burst) */
    emit: (at: Vector3, velocity: Vector3, puff: Puff) => void;
    /** puffs per second at idle and at full power. Default 3, 14 */
    rate?: [number, number];
    /** grey of the smoke, linear. Default .32 */
    grey?: number;
};

/** small exhaust puffs from the pipe: a few at idle, more and darker on the throttle, gone in a second */
export class Exhaust {
    private left = new Map<Vehicle, number>();
    private at = new Vector3(0, 0, 0);
    private dir = new Vector3(0, 0, 0);
    private v = new Vector3(0, 0, 0);

    constructor(readonly setting: ExhaustSetting) { }

    /** call for running engines only */
    update(dt: number, car: Vehicle) {
        const [idle, full] = this.setting.rate ?? [3, 14], power = Math.max(0, Math.min(1, car.power));
        let n = (this.left.get(car) ?? 0) + dt * (idle + (full - idle) * power);
        if (n < 1) { this.left.set(car, n); return; }
        const s = car.spec, back = Math.max(...s.wheels.map(w => w.position[2]));
        const p = s.exhaust ?? [.45, .3, back + .55];
        car.toWorld(p, this.at);
        // the pipe points back (+z in model space)
        car.toWorld([p[0], p[1], p[2] + 1], this.dir).subtract(this.at);
        const bv = car.body.velocity, grey = this.setting.grey ?? .32;
        for (; n >= 1; n--)
        {
            const j = () => Math.random() - .5, out = .6 + power * 1.4;
            this.v[0] = this.dir[0] * out + bv.x * .3 + j() * .2; this.v[1] = .15 + Math.random() * .2; this.v[2] = this.dir[2] * out + bv.z * .3 + j() * .2;
            const g = grey * (1 - power * .35) * (.9 + Math.random() * .2);
            this.emit(g, power);
        }
        this.left.set(car, n);
    }

    private emit(g: number, power: number) {
        this.setting.emit(this.at, this.v, { life: .6 + Math.random() * .5 + power * .3, size: .07 + power * .05, grow: .5 + power * .4, colour: [g, g, g * 1.03], drag: 2.5, gravity: -.08 });
    }
}
