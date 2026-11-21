export type Vec = [number, number, number];

/** A verlet point: where it is, where it was a step ago, its size against the ground. */
export type RagdollPoint = { x: number; y: number; z: number; ox: number; oy: number; oz: number; radius: number };
type Stick = { a: RagdollPoint; b: RagdollPoint; length: number };

export type RagdollOptions = {
    /** m/s². Default 9.81 */
    gravity?: number;
    /** how far a point may sink into the ground, m. Default .03 */
    sink?: number;
    /** points' radius by name, m. Others .05 */
    radius?: Record<string, number>;
    /** velocity kept along the ground per step when touching (lower = drags harder). Default .7 */
    grip?: number;
    /** share of the landing speed bounced back. Default .05 (a body is heavy: a thud, no bounce) */
    bounce?: number;
    /** walls etc: a segment cast (`t` 0..1, `normal`); a point moving through a hit stops at it */
    cast?: (from: [number, number, number], to: [number, number, number]) => { t: number; normal?: ArrayLike<number> } | null;
};

/** one fixed physics step (the same fall on every machine, slow motion plays it slower) */
export const STEP = 1 / 120;
const PASSES = 8;
const AIR = .999;
/** below this mean speed (m/s) for `SETTLE` s it sleeps */
const STILL = .15;
const SETTLE = .5;

/**
 * Verlet points + sticks (copied from arrow-warfare's ragdoll), tuned heavy: hardly any bounce, the ground
 * drags. Knows nothing about bones: named points and pairs of them; whoever draws reads the points.
 * Falls on any ground `height(x, z)`. `update(dt)` runs the fixed steps `dt` holds.
 */
export class Ragdoll<Name extends string = string> {
    readonly points: Record<Name, RagdollPoint>;
    private sticks: Stick[];
    private gravity: number;
    private sink: number;
    private grip: number;
    private bounce: number;
    private cast?: RagdollOptions["cast"];
    private left = 0;
    private still = 0;
    /** seconds of physics run */
    time = 0;
    /** asleep: no more steps */
    resting = false;

    constructor(start: Record<Name, Vec>, sticks: readonly (readonly [Name, Name])[], private height: (x: number, z: number) => number, options: RagdollOptions = {}) {
        this.gravity = options.gravity ?? 9.81;
        this.sink = options.sink ?? .03;
        this.grip = options.grip ?? .7;
        this.bounce = options.bounce ?? .05;
        this.cast = options.cast;
        const points = {} as Record<Name, RagdollPoint>;
        for (const name of Object.keys(start) as Name[])
        {
            const [x, y, z] = start[name];
            points[name] = { x, y, z, ox: x, oy: y, oz: z, radius: options.radius?.[name] ?? .05 };
        }
        this.points = points;
        this.sticks = sticks.map(([from, to]) => {
            const a = points[from], b = points[to];
            return { a, b, length: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) };
        });
    }

    /** every point this velocity, m/s (what the body was doing) */
    moving(v: ArrayLike<number>) {
        const vx = v[0], vy = v[1], vz = v[2];
        for (const name in this.points)
        {
            const p = this.points[name];
            p.ox = p.x - vx * STEP; p.oy = p.y - vy * STEP; p.oz = p.z - vz * STEP;
        }
        this.wake();
    }

    /** adds velocity to one point, m/s */
    push(name: Name, v: ArrayLike<number>) {
        const vx = v[0], vy = v[1], vz = v[2];
        const p = this.points[name];
        p.ox -= vx * STEP; p.oy -= vy * STEP; p.oz -= vz * STEP;
        this.wake();
    }

    wake() { this.resting = false; this.still = 0; }

    update(dt: number) {
        if (this.resting || !(dt > 0)) return;
        this.left += Math.min(dt, .25);
        for (let i = 0; i < 40 && this.left >= STEP && !this.resting; i++)
        {
            this.left -= STEP;
            this.step();
        }
    }

    /** the middle of some points */
    centre(names: readonly Name[]): Vec {
        let x = 0, y = 0, z = 0;
        for (const name of names) { const p = this.points[name]; x += p.x; y += p.y; z += p.z; }
        const n = names.length || 1;
        return [x / n, y / n, z / n];
    }

    at(name: Name): Vec { const p = this.points[name]; return [p.x, p.y, p.z]; }

    private step() {
        this.time += STEP;
        let speed = 0, count = 0;
        const g = this.gravity * STEP * STEP;
        for (const name in this.points)
        {
            const p = this.points[name];
            const vx = (p.x - p.ox) * AIR, vy = (p.y - p.oy) * AIR, vz = (p.z - p.oz) * AIR;
            p.ox = p.x; p.oy = p.y; p.oz = p.z;
            p.x += vx; p.y += vy - g; p.z += vz;
            speed += Math.hypot(vx, vy, vz) / STEP;
            count++;
        }
        for (let pass = 0; pass < PASSES; pass++)
        {
            for (const stick of this.sticks) pull(stick);
            for (const name in this.points) this.ground(this.points[name], pass === PASSES - 1);
        }
        // walls: a point that went through something this step stops at it (sticks can't pull it through after)
        if (this.cast) for (const name in this.points) this.wall(this.points[name]);
        this.still = speed / (count || 1) < STILL ? this.still + STEP : 0;
        if (this.still >= SETTLE) this.resting = true;
    }

    /** from where it was this step to where it is: through a surface -> back to the hit, a radius off it, dragged */
    private wall(p: RagdollPoint) {
        const dx = p.x - p.ox, dy = p.y - p.oy, dz = p.z - p.oz, len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) return;
        // cast a radius further than the move, so a point never ends inside the wall's skin
        const k = (len + p.radius) / len;
        const hit = this.cast!([p.ox, p.oy, p.oz], [p.ox + dx * k, p.oy + dy * k, p.oz + dz * k]);
        if (!hit) return;
        const t = Math.max(0, hit.t * k - p.radius / len);
        const n = hit.normal;
        p.x = p.ox + dx * t; p.y = p.oy + dy * t; p.z = p.oz + dz * t;
        // velocity: into the wall gone, along it dragged
        let vx = dx, vy = dy, vz = dz;
        if (n) { const d = vx * n[0] + vy * n[1] + vz * n[2]; if (d < 0) { vx -= n[0] * d; vy -= n[1] * d; vz -= n[2] * d; } }
        else vx = vy = vz = 0;
        p.ox = p.x - vx * this.grip; p.oy = p.y - vy * this.grip; p.oz = p.z - vz * this.grip;
    }

    /** out of the ground, sinking in a little; on the last pass it drags and (barely) bounces */
    private ground(p: RagdollPoint, last: boolean) {
        const floor = this.height(p.x, p.z) + p.radius - this.sink;
        if (p.y >= floor) return;
        const vy = p.y - p.oy;
        p.y = floor;
        if (!last) return;
        p.ox = p.x - (p.x - p.ox) * this.grip;
        p.oz = p.z - (p.z - p.oz) * this.grip;
        p.oy = p.y + Math.min(0, vy) * this.bounce;
    }
}

function pull({ a, b, length }: Stick) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance === 0) return;
    const part = (length - distance) / distance / 2;
    a.x -= dx * part; a.y -= dy * part; a.z -= dz * part;
    b.x += dx * part; b.y += dy * part; b.z += dz * part;
}
