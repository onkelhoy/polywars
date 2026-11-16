import type { Cast, Hit, Vec3 } from "./types";

/** the nearest hit of several casts */
export function nearest(...casts: Cast[]): Cast {
    return (from, to) => {
        let best: Hit | null = null;
        for (const cast of casts)
        {
            const hit = cast(from, to);
            if (hit && (!best || hit.t < best.t)) best = hit;
        }
        return best;
    };
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * A segment against a height field `ground(x, z)`: marched every `step` metres, the crossing found by bisection,
 * the normal from the slope there.
 */
export function castGround(ground: (x: number, z: number) => number, from: Vec3, to: Vec3, step = 1, surface = "ground"): Hit | null {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const n = Math.max(1, Math.ceil(length / step));
    const above = (t: number) => { const p = lerp(from, to, t); return p[1] - ground(p[0], p[2]); };
    let t0 = 0, h0 = above(0);
    if (h0 < 0) return null; // started under: not ours
    for (let i = 1; i <= n; i++)
    {
        const t1 = i / n, h1 = above(t1);
        if (h1 < 0)
        {
            let a = t0, b = t1;
            for (let k = 0; k < 12; k++) { const m = (a + b) / 2; if (above(m) < 0) b = m; else a = m; }
            const point = lerp(from, to, b), e = .2;
            const gx = (ground(point[0] + e, point[2]) - ground(point[0] - e, point[2])) / (2 * e);
            const gz = (ground(point[0], point[2] + e) - ground(point[0], point[2] - e)) / (2 * e);
            const l = Math.hypot(gx, 1, gz);
            return { t: b, point, normal: [-gx / l, 1 / l, -gz / l], surface };
        }
        t0 = t1; h0 = h1;
    }
    return null;
}

/** a segment against an axis aligned box */
export function castBox(min: Vec3, max: Vec3, from: Vec3, to: Vec3): Hit | null {
    let enter = 0, exit = 1, axis = -1, sign = 0;
    for (let k = 0; k < 3; k++)
    {
        const d = to[k] - from[k];
        if (Math.abs(d) < 1e-12) { if (from[k] < min[k] || from[k] > max[k]) return null; continue; }
        let a = (min[k] - from[k]) / d, b = (max[k] - from[k]) / d, s = -1;
        if (a > b) { [a, b] = [b, a]; s = 1; }
        if (a > enter) { enter = a; axis = k; sign = s; }
        exit = Math.min(exit, b);
        if (enter > exit) return null;
    }
    if (axis < 0) return null; // started inside
    const normal: Vec3 = [0, 0, 0];
    normal[axis] = sign;
    return { t: enter, point: lerp(from, to, enter), normal };
}

/** a segment against a sphere */
export function castSphere(centre: Vec3, radius: number, from: Vec3, to: Vec3): Hit | null {
    const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], f: Vec3 = [from[0] - centre[0], from[1] - centre[1], from[2] - centre[2]];
    const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = 2 * (f[0] * d[0] + f[1] * d[1] + f[2] * d[2]), c = f[0] * f[0] + f[1] * f[1] + f[2] * f[2] - radius * radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0 || c < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return null;
    const point = lerp(from, to, t);
    return { t, point, normal: [(point[0] - centre[0]) / radius, (point[1] - centre[1]) / radius, (point[2] - centre[2]) / radius] };
}

/** a segment against an upright cylinder (with caps) */
export function castCylinder(x: number, z: number, radius: number, bottom: number, top: number, from: Vec3, to: Vec3): Hit | null {
    let best: Hit | null = null;
    const dx = to[0] - from[0], dz = to[2] - from[2], fx = from[0] - x, fz = from[2] - z;
    const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - radius * radius;
    if (a > 1e-12 && c > 0)
    {
        const disc = b * b - 4 * a * c;
        if (disc >= 0)
        {
            const t = (-b - Math.sqrt(disc)) / (2 * a);
            const point = lerp(from, to, t);
            if (t >= 0 && t <= 1 && point[1] >= bottom && point[1] <= top)
                best = { t, point, normal: [(point[0] - x) / radius, 0, (point[2] - z) / radius] };
        }
    }
    // caps
    for (const [y, ny] of [[top, 1], [bottom, -1]] as const)
    {
        const dy = to[1] - from[1];
        if (Math.abs(dy) < 1e-12) continue;
        const t = (y - from[1]) / dy;
        if (t < 0 || t > 1 || (best && t >= best.t)) continue;
        const point = lerp(from, to, t);
        if ((point[0] - x) ** 2 + (point[2] - z) ** 2 <= radius * radius && (ny > 0 ? from[1] > y : from[1] < y)) best = { t, point, normal: [0, ny, 0] };
    }
    return best;
}
