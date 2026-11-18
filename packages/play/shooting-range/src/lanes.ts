import { Vector3, type VectorValue } from "@papit/vector";
import type { RangeData, Vec3 } from "./types";

/** where a lane's carrier stops, m from the firing line */
export const STOPS = [10, 25, 50, 75, 100];

/** a lane: its carrier + paper target slide down the rails between the stops */
export type Lane = {
    lane: number;
    /** the names that ride (carrier, target) */
    names: string[];
    /** the stop it goes to (index in `STOPS`) */
    stop: number;
    /** how far it has slid from the first stop, m (down the range = -z) */
    offset: number;
    /** the paper target's box at the first stop */
    target?: { min: Vec3; max: Vec3 };
};

/** slide speed, m/s */
const SPEED = 6;

/**
 * The lane targets: a desk button moves its lane's carrier to the next stop nearer / further, it slides there.
 * `update` says how far each moved this frame (the host moves the drawn nodes, solids and marks with it).
 */
export class Lanes {
    readonly lanes: Lane[] = [];

    constructor(readonly data: RangeData) {
        for (const c of data.carriers ?? [])
        {
            const n = Number(c.name.match(/\.L(\d+)$/)?.[1] ?? 0);
            const target = data.targets.find(t => t.name === `Lane Target.L${n}`);
            this.lanes.push({ lane: n, names: [c.name, ...(target ? [target.name] : [])], stop: 0, offset: 0, target: target && { min: [...target.min], max: [...target.max] } });
        }
    }

    of(lane: number) { return this.lanes.find(l => l.lane === lane); }

    /** a button pressed: the lane's next stop (dir -1 nearer, +1 further); the stop's distance, or undefined */
    press(lane: number, dir: -1 | 1) {
        const l = this.of(lane);
        if (!l) return undefined;
        l.stop = Math.max(0, Math.min(STOPS.length - 1, l.stop + dir));
        return STOPS[l.stop];
    }

    /** slides the carriers; per lane that moved, the step (m along z, game space) */
    update(dt: number) {
        const out: { lane: Lane; dz: number }[] = [];
        for (const l of this.lanes)
        {
            const want = STOPS[l.stop] - STOPS[0], d = want - l.offset;
            if (Math.abs(d) < 1e-4) continue;
            const step = Math.sign(d) * Math.min(Math.abs(d), SPEED * dt);
            l.offset += step;
            out.push({ lane: l, dz: -step });
        }
        return out;
    }
}

/** the desk button the ray from `from` along unit `dir` points at within `reach`, or undefined */
export function buttonAt(data: RangeData, from: VectorValue, dir: VectorValue, reach = 2.2) {
    const o = Vector3.coerce(from), d = Vector3.coerce(dir), pad = new Vector3(.04, .04, .04);
    let best: NonNullable<RangeData["buttons"]>[number] | undefined, bestT = reach;
    for (const b of data.buttons ?? [])
    {
        // slab test on the button's box, a little bigger so it's easy to point at
        const lo = new Vector3(b.min[0], b.min[1], b.min[2]).subtract(pad).subtract(o).divide(d);
        const hi = new Vector3(b.max[0], b.max[1], b.max[2]).add(pad).subtract(o).divide(d);
        const t0 = Math.max(0, ...[0, 1, 2].map(k => Math.min(lo[k], hi[k])));
        const t1 = Math.min(bestT, ...[0, 1, 2].map(k => Math.max(lo[k], hi[k])));
        if (t0 <= t1 && t0 < bestT) { best = b; bestT = t0; }
    }
    return best;
}
