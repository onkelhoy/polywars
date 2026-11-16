import type { Collider, MoveInput, MoverSetting } from "./types";

/** fixed sub steps so a slow frame moves the same as many fast ones */
const STEP = 1 / 120;
/** how far below the feet the ground still holds them (walking down a slope / off a kerb) */
const SNAP = .6;

/**
 * An upright capsule on a ground height + colliders. No camera, no keys: `update(dt, input)` with the wanted
 * velocity. Walks walkable ground, slides down steeper ground (and can't walk up it), steps up low ledges,
 * stands on box tops, is pushed out of boxes and cylinders.
 */
export class Mover {
    /** where the feet are */
    readonly feet: [number, number, number];
    readonly velocity: [number, number, number] = [0, 0, 0];
    grounded = true;
    /** on ground steeper than `slope`: sliding down */
    sliding = false;
    /** ground normal under the feet */
    readonly normal: [number, number, number] = [0, 1, 0];
    /** seconds in the air (0 on the ground), for landing sounds / camera dips */
    airTime = 0;
    /** set on the step it landed: the downwards speed it hit with, m/s */
    landed = 0;

    readonly radius: number;
    readonly height: number;
    private setting: Required<Omit<MoverSetting, "colliders">> & Pick<MoverSetting, "colliders">;
    private maxSlope: number;
    private left = 0;

    constructor(setting: MoverSetting, at: [number, number, number] = [0, 0, 0]) {
        this.setting = {
            radius: .3, height: 1.8, gravity: 18, jump: 5, slope: 40, step: .45, grip: 14, air: 3, friction: .15,
            ...setting,
        };
        this.radius = this.setting.radius;
        this.height = this.setting.height;
        this.maxSlope = Math.tan(this.setting.slope * Math.PI / 180);
        this.feet = [at[0], setting.ground(at[0], at[2]), at[2]];
    }

    /** horizontal speed, m/s */
    get speed() {
        return Math.hypot(this.velocity[0], this.velocity[2]);
    }

    /** jump to a place (respawn, editor) */
    place(x: number, z: number, y = this.floor(x, z, Infinity)) {
        this.feet[0] = x; this.feet[1] = y; this.feet[2] = z;
        this.velocity.fill(0);
        this.grounded = true;
    }

    /** a push from outside (an explosion, a hit), m/s */
    push(x: number, y: number, z: number) {
        this.velocity[0] += x; this.velocity[1] += y; this.velocity[2] += z;
        if (y > 0) this.grounded = false;
    }

    update(dt: number, input: MoveInput) {
        this.landed = 0;
        let jump = !!input.jump;
        this.left += Math.min(dt, .25);
        while (this.left >= STEP)
        {
            this.left -= STEP;
            this.step(STEP, input, jump);
            jump = false;
        }
    }

    /** ground height at x / z: the `ground` or a collider top the feet are over (up to `below` under `from`) */
    floor(x: number, z: number, from = this.feet[1] + this.setting.step) {
        let y = this.setting.ground(x, z);
        if (this.setting.colliders) for (const c of this.setting.colliders(x, z))
        {
            const top = c.kind === "box" ? c.max[1] : c.top;
            if (top > y && top <= from && this.over(c, x, z)) y = top;
        }
        return y;
    }

    private over(c: Collider, x: number, z: number) {
        if (c.kind === "box") return x > c.min[0] && x < c.max[0] && z > c.min[2] && z < c.max[2];
        return Math.hypot(x - c.x, z - c.z) < c.radius;
    }

    /** ground slope (rise per metre, downhill direction) from the `ground` around x / z */
    private gradient(x: number, z: number) {
        const e = .25, g = this.setting.ground;
        const gx = (g(x + e, z) - g(x - e, z)) / (2 * e), gz = (g(x, z + e) - g(x, z - e)) / (2 * e);
        return { gx, gz, steep: Math.hypot(gx, gz) };
    }

    private step(dt: number, input: MoveInput, jump: boolean) {
        const s = this.setting, v = this.velocity, f = this.feet;
        const { gx, gz, steep } = this.gradient(f[0], f[2]);
        const n = Math.hypot(gx, 1, gz);
        this.normal[0] = -gx / n; this.normal[1] = 1 / n; this.normal[2] = -gz / n;
        const onFloor = this.grounded && this.floor(f[0], f[2]) > s.ground(f[0], f[2]) + 1e-3;
        this.sliding = this.grounded && !onFloor && steep > this.maxSlope;

        let wx = input.x, wz = input.z;
        if (this.sliding)
        {
            // no walking up it: drop the uphill part of what's wanted, gravity pulls along the slope
            const dx = -gx / steep, dz = -gz / steep, up = -(wx * dx + wz * dz);
            if (up > 0) { wx += up * dx; wz += up * dz; }
            const pull = s.gravity * steep / Math.hypot(1, steep) * (1 - s.friction);
            // steer a little (sideways / down), the friction keeps it from running away
            const damp = Math.exp(-dt * s.friction * 4);
            v[0] = (v[0] + (dx * pull + wx) * dt) * damp; v[2] = (v[2] + (dz * pull + wz) * dt) * damp;
        }
        else
        {
            const ease = 1 - Math.exp(-dt * (this.grounded ? s.grip : s.air));
            v[0] += (wx - v[0]) * ease; v[2] += (wz - v[2]) * ease;
        }

        if (jump && this.grounded && !this.sliding) { v[1] = s.jump; this.grounded = false; }
        if (!this.grounded || this.sliding) v[1] -= s.gravity * dt;
        else v[1] = 0;

        let x = f[0] + v[0] * dt, z = f[2] + v[2] * dt, y = f[1] + v[1] * dt;

        // walking onto ground that's too steep going up: stop at its foot (a wall of hill)
        if (this.grounded && !this.sliding)
        {
            const ahead = this.gradient(x, z), rise = s.ground(x, z) - f[1];
            if (ahead.steep > this.maxSlope && rise > 0 && this.floor(x, z) <= s.ground(x, z) + 1e-3)
            {
                const dx = -ahead.gx / ahead.steep, dz = -ahead.gz / ahead.steep, into = v[0] * dx + v[2] * dz;
                if (into < 0) { v[0] -= into * dx; v[2] -= into * dz; }
                x = f[0] + v[0] * dt; z = f[2] + v[2] * dt;
            }
        }

        [x, z] = this.collide(x, y, z);

        const g = this.floor(x, z, y + s.step);
        const wasGrounded = this.grounded;
        if (y <= g || (wasGrounded && v[1] <= 0 && y - g < SNAP))
        {
            if (!wasGrounded) this.landed = Math.max(this.landed, -v[1]);
            y = g;
            if (v[1] < 0) v[1] = 0;
            this.grounded = true;
            this.airTime = 0;
        }
        else
        {
            this.grounded = false;
            this.airTime += dt;
        }
        f[0] = x; f[1] = y; f[2] = z;
    }

    /** push the capsule out of colliders it overlaps (sideways only; tops it can step on are floors) */
    private collide(x: number, y: number, z: number): [number, number] {
        const s = this.setting;
        if (!s.colliders) return [x, z];
        const r = this.radius, v = this.velocity;
        for (let pass = 0; pass < 2; pass++)
            for (const c of s.colliders(x, z))
            {
                const bottom = c.kind === "box" ? c.min[1] : c.bottom, top = c.kind === "box" ? c.max[1] : c.top;
                // above it (or able to step onto it), or under it
                if (y >= top - s.step || y + this.height <= bottom) continue;
                let nx = 0, nz = 0, depth = 0;
                if (c.kind === "cylinder")
                {
                    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), reach = c.radius + r;
                    if (d >= reach) continue;
                    nx = d > 1e-6 ? dx / d : 1; nz = d > 1e-6 ? dz / d : 0; depth = reach - d;
                }
                else
                {
                    const cx = Math.max(c.min[0], Math.min(x, c.max[0])), cz = Math.max(c.min[2], Math.min(z, c.max[2]));
                    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
                    if (d >= r) continue;
                    if (d > 1e-6) { nx = dx / d; nz = dz / d; depth = r - d; }
                    else
                    {
                        // centre inside: out the nearest side
                        const sides = [x - c.min[0], c.max[0] - x, z - c.min[2], c.max[2] - z], i = sides.indexOf(Math.min(...sides));
                        nx = i === 0 ? -1 : i === 1 ? 1 : 0; nz = i === 2 ? -1 : i === 3 ? 1 : 0; depth = sides[i] + r;
                    }
                }
                x += nx * depth; z += nz * depth;
                const into = v[0] * nx + v[2] * nz;
                if (into < 0) { v[0] -= into * nx; v[2] -= into * nz; }
            }
        return [x, z];
    }
}
