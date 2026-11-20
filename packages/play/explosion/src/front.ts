/** speed of sound m/s */
export const SOUND = 343;

/**
 * The shock front of `power` kg TNT. Its speed by scaled distance Z = R / ∛W: many times sound close in,
 * down to sound speed far out. Overpressure by Sadovsky (kPa). Pure math, shared by look, force and sound.
 */
export class ShockFront {
    readonly scale: number;
    /** m now */
    radius = 0;
    time = 0;

    constructor(readonly power: number) {
        this.scale = Math.cbrt(Math.max(1e-3, power));
    }

    /** m/s at `radius` */
    speed(radius = this.radius) {
        const z = Math.max(.25, radius / this.scale);
        return SOUND * Math.min(8, 1 + 2.5 / z ** 1.5);
    }

    /** kPa over the air at `radius` */
    pressure(radius = this.radius) {
        const z = Math.max(.3, radius / this.scale);
        return 84 / z + 270 / z ** 2 + 700 / z ** 3;
    }

    /** move it on `dt` s (steps small while it is fast) */
    step(dt: number) {
        this.time += dt;
        for (let left = dt; left > 0;)
        {
            const h = Math.min(left, Math.max(1e-4, this.radius * .05 / this.speed()));
            this.radius += this.speed() * h;
            left -= h;
        }
        return this.radius;
    }

    /** s until the front is `distance` m out */
    reach(distance: number) {
        const f = new ShockFront(this.power);
        let t = 0;
        while (f.radius < distance) { const h = Math.max(1e-4, (f.radius + this.scale * .05) * .05 / f.speed()); f.radius += f.speed() * h; t += h; }
        return t;
    }
}
