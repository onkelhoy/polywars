import type { Point } from "./types";

/** a hand on the rim, model space: `at` the grab point, `axis` the rim's tangent (thumb along it), `palm` toward the rim */
export type RimHand = { at: Point; axis: Point; palm: Point };

export type SteeringHandsSetting = {
    /** how far a hand rides round with the wheel before it lets go (rad) */
    follow: number;
    /** time to move to the new grab (s) */
    regrab: number;
    /** rest grabs: right / left, rad round the rim from its right (0) counter clockwise as the driver sees it */
    home: [number, number];
};
const DEFAULT: SteeringHandsSetting = { follow: Math.PI * .55, regrab: .22, home: [Math.PI / 6, Math.PI * 5 / 6] };

type Grip = { angle: number; from: number; t: number };

/**
 * Two hands on a steering wheel: each holds its spot on the rim as the wheel turns, past `follow` it lets go and
 * grabs again back near its rest spot (one hand at a time, the other holds). Pure: model space in, model space out.
 */
export class SteeringHands {
    readonly setting: SteeringHandsSetting;
    /** grab angles on the wheel (wheel's own frame) */
    private grips: [Grip, Grip];
    private turn = 0;

    constructor(readonly wheel: { position: Point; axis: Point; radius?: number }, setting: Partial<SteeringHandsSetting> = {}) {
        this.setting = { ...DEFAULT, ...setting };
        const h = this.setting.home;
        this.grips = [{ angle: h[0], from: h[0], t: 1 }, { angle: h[1], from: h[1], t: 1 }];
    }

    /** back to rest on a straight wheel (getting in) */
    reset(turn = 0) {
        this.turn = turn;
        this.grips.forEach((g, i) => { g.angle = g.from = this.setting.home[i] - turn; g.t = 1; });
    }

    /** `turn`: the wheel's turn round its axis (rad, `Vehicle.wheelTurn`) */
    update(dt: number, turn: number) {
        this.turn = turn;
        const s = this.setting;
        this.grips.forEach((g, i) => {
            if (g.t < 1) { g.t = Math.min(1, g.t + dt / s.regrab); return; }
            const other = this.grips[1 - i];
            const off = g.angle + turn - s.home[i];
            if (Math.abs(off) > s.follow && other.t >= 1)
            {
                // over the top the other way: lands a bit past rest, against the turn
                g.from = g.angle + turn;
                g.angle = s.home[i] - turn - Math.sign(off) * s.follow * .3;
                g.t = 0;
            }
        });
    }

    /** the hands, model space [right, left] */
    hands(): [RimHand, RimHand] {
        return [this.hand(0), this.hand(1)];
    }

    private hand(i: 0 | 1): RimHand {
        const g = this.grips[i], w = this.wheel, r = w.radius ?? .19;
        const to = g.angle + this.turn;
        // moving: lerp the rim angle (world), lift the hand off the rim a little
        const e = g.t < 1 ? g.t * g.t * (3 - 2 * g.t) : 1;
        const a = g.t < 1 ? g.from + (to - g.from) * e : to;
        const lift = g.t < 1 ? Math.sin(Math.PI * e) * .06 : 0;
        const n = norm(w.axis);
        // rim frame: right along model x (off the axis), up = n x right
        const right = norm(sub([1, 0, 0], mul(n, n[0]))), up = cross(n, right);
        const radial = add(mul(right, Math.cos(a)), mul(up, Math.sin(a)));
        const tangent = cross(n, radial);
        const at = add(add(w.position, mul(radial, r)), mul(n, lift));
        // palm on the rim from outside and the driver's side
        const palm = norm(add(mul(radial, -.6), mul(n, -1)));
        return { at, axis: i ? tangent : mul(tangent, -1), palm };
    }
}

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Point, k: number): Point => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Point): Point => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
