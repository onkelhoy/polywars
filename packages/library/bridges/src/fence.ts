import { Soup } from "./geometry";
import type { Mesh, RGB, Vec3 } from "./types";

const WOOD: RGB = [.45, .32, .2], WOOD_DARK: RGB = [.33, .23, .15], STONE: RGB = [.52, .5, .46];

/** Post and rail fence along `run` (points on the ground): a post on every point, two rails between, both follow the slope. */
export function fence(run: Vec3[], height = 1.1, col: RGB = WOOD): Mesh {
    const s = new Soup();
    for (const p of run) s.beam([p[0], p[1] - .3, p[2]], [p[0], p[1] + height, p[2]], .12, .12, WOOD_DARK);
    for (let i = 0; i < run.length - 1; i++)
    {
        const a = run[i], b = run[i + 1];
        for (const h of [height * .45, height * .9]) s.beam([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], .06, .1, col);
    }
    return s.mesh();
}

/**
 * Stone steps along a steep `path` (points on the ground): one block per rise of `rise` m, `width` m wide,
 * each block level, its top at the ground where it starts.
 */
export function steps(path: Vec3[], width = 1.6, rise = .25): Mesh {
    const s = new Soup();
    for (let i = 0; i < path.length - 1; i++)
    {
        const a = path[i], b = path[i + 1], dy = b[1] - a[1], n = Math.max(1, Math.round(Math.abs(dy) / rise));
        const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1;
        for (let q = 0; q < n; q++)
        {
            const t0 = q / n, t1 = (q + 1) / n, top = a[1] + dy * (dy > 0 ? t1 : t0);
            const cx = a[0] + dx * (t0 + t1) / 2, cz = a[2] + dz * (t0 + t1) / 2;
            s.block([cx, top - rise - .3, cz], [dx / len, dz / len], [len / n + .02, rise + .3, width], STONE);
        }
    }
    return s.mesh();
}

/**
 * Log steps up a steep trail: a round-ish log across the way every `rise` m of climb, each laid on the ground where it
 * falls (half sunk, so it never floats or hides), a short peg at each end. `ground` = drawn ground height.
 */
export function logSteps(path: Vec3[], ground: (x: number, z: number) => number, width = 1.4, rise = .35): Mesh {
    const s = new Soup();
    let last = ground(path[0][0], path[0][2]);
    for (let i = 0; i < path.length - 1; i++)
    {
        const a = path[i], b = path[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1, sx = -dz / len, sz = dx / len;
        for (let d = 0; d < len; d += .25)
        {
            const x = a[0] + dx * d / len, z = a[2] + dz * d / len, y = ground(x, z);
            if (Math.abs(y - last) < rise) continue;
            last = y;
            const h = width / 2, l: Vec3 = [x - sx * h, ground(x - sx * h, z - sz * h) + .06, z - sz * h], r: Vec3 = [x + sx * h, ground(x + sx * h, z + sz * h) + .06, z + sz * h];
            s.beam(l, r, .24, .2, i % 2 ? WOOD : WOOD_DARK);
            for (const p of [l, r]) s.beam([p[0], p[1] - .2, p[2]], [p[0], p[1] + .22, p[2]], .08, .08, WOOD_DARK);
        }
    }
    return s.mesh();
}
