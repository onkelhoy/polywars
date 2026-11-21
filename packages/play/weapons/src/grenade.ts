type Vec3 = [number, number, number];
type Box = { min: ArrayLike<number>; max: ArrayLike<number> };

/** A hand grenade: how long the fuse burns, how hard it goes off, how it flies. */
export type GrenadeSpec = {
    name: string;
    /** seconds from the lever flying off to the blast */
    fuse: number;
    /** kg TNT (the explosion's `power`) */
    power: number;
    /** kg */
    mass: number;
    /** m, ball radius for bounces */
    radius: number;
    /** throw speed m/s: a flick (no hold) up to a full throw (held `wind` s) */
    speed: [min: number, max: number];
    /** seconds of holding to a full throw */
    wind: number;
    /** bounce (0..1) and ground roll slowdown per second */
    bounce: number;
    roll: number;
    /** low poly look: body / band colour */
    colour: string;
    band?: string;
};

export const GRENADES: Record<string, GrenadeSpec> = {
    frag: { name: "Frag", fuse: 4, power: .18, mass: .6, radius: .045, speed: [6, 19], wind: .8, bounce: .3, roll: 2.5, colour: "#4f5a3a", band: "#c9b04a" },
    stick: { name: "Stick", fuse: 4.5, power: .17, mass: .6, radius: .05, speed: [7, 22], wind: .9, bounce: .2, roll: 4, colour: "#5c6b45", band: "#7a5a36" },
};

export type GrenadeWorld = {
    /** ground height at x, z */
    ground: (x: number, z: number) => number;
    /** boxes near x, z (axis aligned) */
    colliders?: (x: number, z: number) => Box[];
    /** a blast: where, kg TNT */
    onexplode?: (at: Vec3, power: number, grenade: Grenade) => void;
    /** a hit on something (sound), speed m/s */
    onbounce?: (at: Vec3, speed: number) => void;
};

const G = 9.81;

/**
 * One grenade: pull (`pull`, fuse starts: cooking in the hand), `throw` it (from, direction, held seconds), `update` flies
 * it (gravity, light drag, bounces off ground + boxes, rolls to a stop), `onexplode` when the fuse runs out (hand or air).
 */
export class Grenade {
    position: Vec3 = [0, 0, 0];
    velocity: Vec3 = [0, 0, 0];
    /** tumble: axis angle, rad */
    spin = 0;
    spinAxis: Vec3 = [1, 0, 0];
    /** seconds of fuse left (Infinity until pulled) */
    left = Infinity;
    state: "held" | "cooking" | "flying" | "resting" | "gone" = "held";

    constructor(readonly spec: GrenadeSpec, readonly world: GrenadeWorld) { }

    get pulled() { return this.left !== Infinity; }

    /** the pin out and the lever off: the fuse burns */
    pull() {
        if (this.state !== "held") return;
        this.left = this.spec.fuse;
        this.state = "cooking";
    }

    /** throw speed for a hold of `held` s */
    speedOf(held: number) {
        const [a, b] = this.spec.speed;
        return a + (b - a) * Math.min(1, Math.max(0, held / this.spec.wind));
    }

    /** let go: from the hand, along `direction`, with `carry` (the thrower's own velocity) */
    throw(from: ArrayLike<number>, direction: ArrayLike<number>, held: number, carry: ArrayLike<number> = [0, 0, 0]) {
        if (this.state === "held") this.pull();
        if (this.state !== "cooking") return;
        const l = Math.hypot(direction[0], direction[1], direction[2]) || 1, s = this.speedOf(held);
        this.position = [from[0], from[1], from[2]];
        this.velocity = [direction[0] / l * s + carry[0], direction[1] / l * s + carry[1], direction[2] / l * s + carry[2]];
        this.spinAxis = norm([-direction[2], Math.random() - .5, direction[0]]);
        this.state = "flying";
    }

    /** where a throw lands: points every `step` s (for an arc preview), until the ground or `max` points */
    static arc(spec: GrenadeSpec, world: GrenadeWorld, from: ArrayLike<number>, direction: ArrayLike<number>, held: number, step = .05, max = 80) {
        const g = new Grenade(spec, { ground: world.ground, colliders: world.colliders });
        g.left = 1e9; g.state = "cooking" as Grenade["state"];
        g.throw(from, direction, held);
        const out: Vec3[] = [[...g.position]];
        for (let i = 0; i < max && (g.state as string) === "flying"; i++) { g.fly(step, true); out.push([...g.position]); }
        return out;
    }

    update(dt: number) {
        if (this.state === "gone" || this.state === "held") return;
        this.left -= dt;
        if (this.left <= 0)
        {
            this.state = "gone";
            this.world.onexplode?.([this.position[0], this.position[1] + this.spec.radius, this.position[2]], this.spec.power, this);
            return;
        }
        if (this.state === "flying") for (let i = 0, n = Math.max(1, Math.ceil(dt / .01)); i < n; i++) this.fly(dt / n, false);
    }

    /** one step: true `once` = stop at the first hit (arc preview) */
    private fly(dt: number, once: boolean) {
        const p = this.position, v = this.velocity, r = this.spec.radius;
        v[1] -= G * dt;
        const drag = Math.max(0, 1 - .02 * dt);
        v[0] *= drag; v[1] *= drag; v[2] *= drag;
        const was: Vec3 = [p[0], p[1], p[2]];
        p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
        const speed = Math.hypot(v[0], v[1], v[2]);
        this.spin += speed / r * dt * .25;
        let hit = false, hitSpeed = 0;
        // boxes: push out along the least deep face, flip that velocity part
        for (const b of this.world.colliders?.(p[0], p[2]) ?? [])
        {
            if (p[0] < b.min[0] - r || p[0] > b.max[0] + r || p[1] < b.min[1] - r || p[1] > b.max[1] + r || p[2] < b.min[2] - r || p[2] > b.max[2] + r) continue;
            let axis = 0, best = Infinity, side = 1;
            for (let k = 0; k < 3; k++)
            {
                const lo = p[k] - (b.min[k] - r), hi = (b.max[k] + r) - p[k];
                // came from outside on this axis?
                const outside = was[k] < b.min[k] - r ? -1 : was[k] > b.max[k] + r ? 1 : 0;
                const d = outside ? (outside < 0 ? lo : hi) * .5 : Math.min(lo, hi);
                if (d < best) { best = d; axis = k; side = outside || (lo < hi ? -1 : 1); }
            }
            p[axis] = side < 0 ? b.min[axis] - r : b.max[axis] + r;
            hitSpeed = Math.max(hitSpeed, Math.abs(v[axis]));
            v[axis] = Math.abs(v[axis]) * side * this.spec.bounce;
            for (let k = 0; k < 3; k++) if (k !== axis) v[k] *= .7;
            hit = true;
        }
        // ground: the slope's normal from a little cross of heights
        const gy = this.world.ground(p[0], p[2]) + r;
        if (p[1] < gy)
        {
            const e = .2, n = norm([this.world.ground(p[0] - e, p[2]) - this.world.ground(p[0] + e, p[2]), 2 * e, this.world.ground(p[0], p[2] - e) - this.world.ground(p[0], p[2] + e)]);
            p[1] = gy;
            const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
            if (vn < 0)
            {
                hitSpeed = Math.max(hitSpeed, -vn);
                // reflect the normal part (bounce), keep the slide part, then rolling slowdown
                const k = (1 + this.spec.bounce) * vn;
                v[0] -= k * n[0]; v[1] -= k * n[1]; v[2] -= k * n[2];
                if (-vn > 1.5) { v[0] *= .75; v[2] *= .75; }
            }
            const slow = Math.max(0, 1 - this.spec.roll * dt);
            v[0] *= slow; v[2] *= slow;
            if (Math.abs(v[1]) < .4) v[1] = 0;
            // downhill pull
            v[0] += n[0] * G * dt * .5; v[2] += n[2] * G * dt * .5;
            hit = true;
            if (Math.hypot(v[0], v[1], v[2]) < .08) { v[0] = v[1] = v[2] = 0; if (!once) this.state = "resting"; }
        }
        if (hit && hitSpeed > .6 && !once) this.world.onbounce?.([p[0], p[1], p[2]], hitSpeed);
        if (hit && once) this.state = "resting";
    }

    /** a model matrix (column major, 16) for drawing: tumbled round its spin axis */
    matrix(out: Float32Array = new Float32Array(16)) {
        const [x, y, z] = this.spinAxis, c = Math.cos(this.spin), s = Math.sin(this.spin), t = 1 - c, p = this.position;
        out.set([
            t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
            t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
            t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
            p[0], p[1], p[2], 1,
        ]);
        return out;
    }
}

function norm(v: number[]): Vec3 {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}
