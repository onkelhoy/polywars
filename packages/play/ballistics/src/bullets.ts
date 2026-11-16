import type { Bullet, Cast, Hit, Shot, Vec3 } from "./types";

export const GRAVITY = 9.81;
/** seconds per step: the same everywhere so every client flies the same bullet */
export const STEP = 1 / 240;

/**
 * Bullets in flight: gravity, quadratic drag, a cast per step. `onhit` for each that hits (then it's gone),
 * `ongone` for each that runs out of life without hitting.
 */
export class Bullets {
    readonly list: Bullet[] = [];
    onhit?: (bullet: Bullet, hit: Hit) => void;
    ongone?: (bullet: Bullet) => void;
    gravity = GRAVITY;
    private left = 0;

    constructor(private cast: Cast) { }

    fire(shot: Shot): Bullet {
        const d = shot.direction, s = shot.speed;
        const bullet: Bullet = {
            drag: 0, life: 3, ...shot,
            position: [...shot.from], previous: [...shot.from],
            velocity: [d[0] * s, d[1] * s, d[2] * s],
            travelled: 0, age: 0, gone: false,
        };
        this.list.push(bullet);
        return bullet;
    }

    update(dt: number) {
        this.left += Math.min(dt, .25);
        while (this.left >= STEP)
        {
            this.left -= STEP;
            for (const b of this.list) if (!b.gone) this.step(b, STEP);
        }
        for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].gone) this.list.splice(i, 1);
    }

    private step(b: Bullet, dt: number) {
        const p = b.position, v = b.velocity;
        const speed = Math.hypot(v[0], v[1], v[2]);
        // dv/dt = -drag·|v|·v (per metre drag, so the slow-down is per distance), minus gravity
        const slow = Math.exp(-(b.drag ?? 0) * speed * dt);
        v[0] *= slow; v[1] = v[1] * slow - this.gravity * dt; v[2] *= slow;
        const to: Vec3 = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
        b.previous[0] = p[0]; b.previous[1] = p[1]; b.previous[2] = p[2];
        const hit = this.cast(p, to);
        if (hit)
        {
            b.travelled += Math.hypot(to[0] - p[0], to[1] - p[1], to[2] - p[2]) * hit.t;
            p[0] = hit.point[0]; p[1] = hit.point[1]; p[2] = hit.point[2];
            b.gone = true;
            this.onhit?.(b, hit);
            return;
        }
        b.travelled += Math.hypot(to[0] - p[0], to[1] - p[1], to[2] - p[2]);
        p[0] = to[0]; p[1] = to[1]; p[2] = to[2];
        b.age += dt;
        if (b.age >= (b.life ?? 3)) { b.gone = true; this.ongone?.(b); }
    }
}

/** seconds to fly `distance` metres (level) with drag: v = v0·e^(-drag·x) */
export function timeAt(speed: number, drag: number, distance: number) {
    return drag > 0 ? (Math.exp(drag * distance) - 1) / (drag * speed) : distance / speed;
}

/** metres a level shot has dropped after `distance` metres */
export function dropAt(speed: number, drag: number, distance: number, gravity = GRAVITY) {
    const t = timeAt(speed, drag, distance);
    return gravity * t * t / 2;
}

/**
 * How far up (radians) to tip the bore so the bullet crosses the sight line at `zero` metres,
 * with the sight `height` metres over the bore.
 */
export function zeroAngle(speed: number, drag: number, zero: number, height = 0) {
    return Math.atan2(dropAt(speed, drag, zero) + height, zero);
}
