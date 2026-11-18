import { Vector3 } from "@papit/vector";
import type { Vec3 } from "./math";
import type { ObstructionCast } from "./obstruction";

export type BraceSetting = {
    cast: ObstructionCast;
    /** comes in closer than this (m, from the shoulder) (default .55) */
    near?: number;
    /** lets go past this (m) (default .7) */
    far?: number;
    /** heights tried, m below the shoulder (default [-.05, .1]: about neck high) */
    heights?: number[];
    /** up / down probe for a bar, m (default .06) */
    bar?: number;
    /** blend in / out per s (default 8) */
    speed?: number;
};

/** where the free hand rests: `weight` 0..1, `point` / `normal` world, `bar` a thin rail (grip it) else a flat wall */
export type Braced = { weight: number; point: Vector3; normal: Vector3; bar: boolean };

const UP = new Vector3(0, 1, 0);
const tuple = (v: Vector3): Vec3 => [v[0], v[1], v[2]];

/**
 * The free hand against the world: casts forward, to the side and between from the shoulder at a few heights.
 * The nearest hit in reach (hysteresis `near` / `far`) is a wall, or a bar when probes just above and below miss.
 * Pure, world space; the caller says when the hand is free.
 */
export class Brace {
    readonly value: Braced = { weight: 0, point: new Vector3(0, 0, 0), normal: new Vector3(0, 0, 1), bar: false };
    private s: Required<BraceSetting>;
    private on = false;

    constructor(setting: BraceSetting) {
        this.s = { near: .55, far: .7, heights: [-.05, .1], bar: .06, speed: 8, ...setting };
    }

    /** `shoulder` world; `forward` / `side` unit, flat (side = the free hand's side); `free` the hand may let go of the gun */
    update(dt: number, shoulder: ArrayLike<number>, forward: ArrayLike<number>, side: ArrayLike<number>, free: boolean): Braced {
        const s = this.s, v = this.value, reach = this.on ? s.far : s.near;
        const cast = (from: Vector3, dir: Vector3, length: number) => s.cast(tuple(from), tuple(from.clone.add(dir.clone.multiply(length))));
        let best: { d: number; normal: Vector3; dir: Vector3; from: Vector3 } | undefined;
        if (free)
        {
            const f = new Vector3(forward[0], 0, forward[2]), l = new Vector3(side[0], 0, side[2]);
            const dirs = [f, l, f.clone.add(l).normalize()];
            for (const h of s.heights)
            {
                const from = new Vector3(shoulder[0], shoulder[1] - h, shoulder[2]);
                for (const dir of dirs)
                {
                    const hit = cast(from, dir, reach);
                    // facing the hand (not a floor / ceiling)
                    if (!hit || Math.abs(hit.normal[1]) > .7) continue;
                    const d = hit.t * reach;
                    if (!best || d < best.d) best = { d, normal: new Vector3(hit.normal[0], hit.normal[1], hit.normal[2]), dir, from };
                }
            }
        }
        this.on = !!best;
        if (best)
        {
            const probe = (dy: number) => cast(best!.from.clone.add(UP.clone.multiply(dy)), best!.dir, best!.d + .05);
            const at = best.from.clone.add(best.dir.clone.multiply(best.d));
            const k = v.weight < .01 ? 1 : 1 - Math.exp(-dt * 20);
            v.point.lerp(at, k); v.normal.lerp(best.normal, k).normalize();
            v.bar = !probe(s.bar) && !probe(-s.bar);
        }
        v.weight += ((best ? 1 : 0) - v.weight) * (1 - Math.exp(-dt * s.speed));
        if (v.weight < .01 && !best) v.weight = 0;
        return v;
    }
}
