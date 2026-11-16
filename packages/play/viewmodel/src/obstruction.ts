import { point, type Vec3 } from "./math";

/** first hit on the segment from -> to (world), or null (same shape as `@polywar/ballistics` Cast) */
export type ObstructionCast = (from: Vec3, to: Vec3) => { t: number; normal: Vec3 } | null;

export type ObstructionSetting = {
    cast: ObstructionCast;
    /** most the barrel turns aside before it tucks, radians (default 30°) */
    deflect?: number;
    /** tucked: untucks once a turn this small clears again (default 20°) */
    release?: number;
    /** search steps up to `deflect` (default 6) */
    steps?: number;
    /** past the tip, m (the barrel's thickness / a gap) (default .04) */
    margin?: number;
    /** most it slides back, m (default .12) */
    back?: number;
};

/** what the geometry does to the gun: turn aside (yaw, left +), slide back (m), tuck (+1 up, -1 down, 0 none) */
export type Obstructed = { yaw: number; back: number; tuck: number };

/**
 * The barrel against the world: casts from the grip to past the muzzle. Touching something it turns aside
 * (round the grip, away from the hit, the smallest turn that clears: a pole pushes it out); if no turn up to
 * `deflect` clears (a wall), it tucks: up for a low thing / looking up, down else. Camera space in, a target out.
 */
export class Obstruction {
    readonly value: Obstructed = { yaw: 0, back: 0, tuck: 0 };
    private s: Required<ObstructionSetting>;

    constructor(setting: ObstructionSetting) {
        this.s = { deflect: Math.PI / 6, release: Math.PI / 9, steps: 6, margin: .04, back: .12, ...setting };
    }

    /** `camera` world matrix; `grip` / `muzzle` camera space (the unobstructed pose); `pitch` view pitch (up +) */
    update(camera: ArrayLike<number>, grip: Vec3, muzzle: Vec3, pitch: number): Obstructed {
        const s = this.s, v = this.value;
        const d: Vec3 = [muzzle[0] - grip[0], muzzle[1] - grip[1], muzzle[2] - grip[2]];
        const len = Math.hypot(...d) || 1, L = len + s.margin;
        const u: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
        const from = point(camera, grip);
        // the barrel turned round the camera's up by `a` (left +)
        const cast = (a: number) => {
            const c = Math.cos(a), sn = Math.sin(a);
            const r: Vec3 = [u[0] * c + u[2] * sn, u[1], -u[0] * sn + u[2] * c];
            return s.cast(from, point(camera, [grip[0] + r[0] * L, grip[1] + r[1] * L, grip[2] + r[2] * L]));
        };
        const hit = cast(0);
        if (!hit) { v.yaw = 0; v.back = 0; v.tuck = 0; return v; }

        // the normal in camera space: its x says which way it pushes (right +)
        const n = hit.normal, m = camera;
        const nx = n[0] * m[0] + n[1] * m[1] + n[2] * m[2], ny = n[0] * m[4] + n[1] * m[5] + n[2] * m[6];
        const sides = Math.abs(nx) > .15 ? [nx > 0 ? -1 : 1] : [v.yaw < 0 ? -1 : 1, v.yaw < 0 ? 1 : -1];
        const limit = v.tuck ? s.release : s.deflect;
        const into = Math.max(0, L - hit.t * L);
        for (let k = 1; k <= s.steps; k++)
        {
            const a = s.deflect * k / s.steps;
            if (a > limit + 1e-6) break;
            for (const side of sides)
                if (!cast(a * side)) { v.yaw = a * side; v.back = Math.min(s.back, into * .3); v.tuck = 0; return v; }
        }
        // a wall: back off and tuck
        v.yaw = 0;
        v.back = Math.min(s.back, into);
        v.tuck = v.tuck || (ny > .5 || pitch > .2 ? 1 : -1);
        return v;
    }
}
