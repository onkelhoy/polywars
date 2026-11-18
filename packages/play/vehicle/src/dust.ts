import { Vector3 } from "@papit/vector";
import type { Vehicle } from "./vehicle";

export type Puff = { life: number; size: number; grow: number; colour: [number, number, number]; drag: number; gravity: number };

export type DustSetting = {
    /** draws a puff (e.g. `@polywar/impacts` `emit`) */
    emit: (at: Vector3, velocity: Vector3, puff: Puff) => void;
    /** dust colour at x / z, undefined for none (water, a floor). Default dry dirt */
    colour?: (x: number, z: number) => [number, number, number] | undefined;
    /** puffs per wheel per second at 10 m/s (slides add more). Default 6 */
    rate?: number;
};

/** dirt / gravel kicked up behind the wheels: more with speed and slip, coloured by the ground */
export class Dust {
    private left = new Map<object, number>();
    private at = new Vector3(0, 0, 0);
    private v = new Vector3(0, 0, 0);

    constructor(readonly setting: DustSetting) { }

    update(dt: number, car: Vehicle) {
        const rate = this.setting.rate ?? 6;
        const bv = car.body.velocity, speed = Math.hypot(bv.x, bv.z);
        if (speed < 1.5 && car.slip < .05) return;
        for (const w of car.wheels)
        {
            if (!w.grounded) continue;
            const amount = rate * dt * (speed / 10 + (w.slipping ? 2.5 : 0));
            let n = (this.left.get(w) ?? 0) + amount;
            const c = w.contact;
            const colour = this.setting.colour ? this.setting.colour(c[0], c[2]) : [.5, .42, .32] as [number, number, number];
            if (!colour) { this.left.set(w, 0); continue; }
            for (; n >= 1; n--)
            {
                const j = () => (Math.random() - .5);
                this.at.set(c); this.at.add(j() * .3, .05, j() * .3);
                // thrown back and up off the tyre, drifting with the car a little
                this.v[0] = bv.x * .25 + j() * 1.5; this.v[1] = .6 + Math.random() * (.8 + speed * .05); this.v[2] = bv.z * .25 + j() * 1.5;
                const big = Math.min(1, speed / 20) + (w.slipping ? .4 : 0);
                this.setting.emit(this.at, this.v, {
                    life: 1.2 + Math.random() * 1.3 + big, size: .25 + big * .3, grow: .7 + big * .8,
                    colour: [colour[0] * (.9 + Math.random() * .2), colour[1] * (.9 + Math.random() * .2), colour[2] * (.9 + Math.random() * .2)],
                    drag: 2.2, gravity: -.15,
                });
            }
            this.left.set(w, n);
        }
    }
}
