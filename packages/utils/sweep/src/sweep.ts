import type { Bank, Mesh, Profile, RGB, SweepLod, SweepOptions, Vec3 } from "./types";

export const PROFILES = {
    /** flat strip */
    flat: { points: [[-1, 0], [1, 0]], color: [.5, .5, .5] } as Profile,
    /** crowned road with low shoulders */
    road: { points: [[-1.15, -.25], [-1, 0], [0, .08], [1, 0], [1.15, -.25]], colors: [[.35, .32, .28], [.55, .55, .52], [.55, .55, .52], [.35, .32, .28]] } as Profile,
    /** water surface (flat) */
    water: { points: [[-1, 0], [1, 0]], color: [.2, .45, .6] } as Profile,
    /** river bed + banks below a water ribbon */
    bed: { points: [[-1.3, .3], [-1, 0], [-.6, -.6], [.6, -.6], [1, 0], [1.3, .3]], color: [.35, .3, .22] } as Profile,
} satisfies Record<string, Profile>;

export const DEFAULTS: SweepOptions = { width: 6, profile: PROFILES.road, bank: { max: .06, gain: 4 }, step: 2, noFold: true, flat: true };

/** points every `step` m along a polyline (ends kept); `widths` resampled with it */
export function resample(points: Vec3[], step: number, widths?: number[]): { points: Vec3[]; widths?: number[] } {
    if (step <= 0 || points.length < 2) return { points, widths };
    const out: Vec3[] = [points[0]], w: number[] = widths ? [widths[0]] : [];
    let left = step;
    for (let i = 0; i < points.length - 1; i++)
    {
        const a = points[i], b = points[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        let at = 0;
        while (l - at >= left)
        {
            at += left; left = step;
            const t = at / l;
            out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
            if (widths) w.push(widths[i] + (widths[i + 1] - widths[i]) * t);
        }
        left -= l - at;
    }
    const last = points[points.length - 1], end = out[out.length - 1];
    if (Math.hypot(last[0] - end[0], last[2] - end[2]) > step * .3) { out.push(last); if (widths) w.push(widths[widths.length - 1]); }
    else { out[out.length - 1] = last; if (widths) w[w.length - 1] = widths[widths.length - 1]; }
    return { points: out, widths: widths ? w : undefined };
}

/** per point: unit side vector (horizontal, to the right), signed curvature (rad/m, + = turning left), bank angle */
export function frames(points: Vec3[], bank: Bank) {
    const n = points.length, side: [number, number][] = [], curve = new Float32Array(n), roll = new Float32Array(n);
    for (let i = 0; i < n; i++)
    {
        const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[2] - a[2];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        side.push([-dz, dx]);
    }
    for (let i = 1; i < n - 1; i++)
    {
        const h0 = Math.atan2(side[i - 1][1], side[i - 1][0]), h1 = Math.atan2(side[i + 1][1], side[i + 1][0]);
        let d = h1 - h0; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
        const l = Math.hypot(points[i + 1][0] - points[i - 1][0], points[i + 1][2] - points[i - 1][2]) || 1;
        curve[i] = -d / l;
    }
    if (bank !== "flat") for (let i = 0; i < n; i++)
    {
        // smooth curvature a little so the tilt eases in
        let c = 0, k = 0;
        for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { c += curve[j]; k++; }
        roll[i] = Math.max(-bank.max, Math.min(bank.max, c / k * bank.gain));
    }
    return { side, curve, roll };
}

/** Mesh along a 3D path (x y z per point). Low poly: one ring per point, one quad strip per profile segment. */
export function sweep(path: Vec3[], options: Partial<SweepOptions> = {}): Mesh {
    const o = { ...DEFAULTS, ...options };
    const r = resample(path, o.step, Array.isArray(o.width) ? o.width : undefined);
    const pts = r.points, n = pts.length, prof = o.profile.points, m = prof.length;
    const width = (i: number) => r.widths ? r.widths[i] : o.width as number;
    const { side, curve, roll } = frames(pts, o.bank);
    // rings: m points per path point
    const ring = new Float32Array(n * m * 3);
    let along = 0;
    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++)
    {
        if (i) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
        dist[i] = along;
        const half = width(i) / 2, [sx, sz] = side[i], c = Math.cos(roll[i]), s = Math.sin(roll[i]);
        // inner side (curve > 0 = turning left: left side, x < 0 is inner) can't reach past the turn centre
        const radius = Math.abs(curve[i]) > 1e-6 ? 1 / Math.abs(curve[i]) : Infinity;
        for (let j = 0; j < m; j++)
        {
            let x = prof[j][0] * half;
            const y = prof[j][1];
            if (o.noFold && Math.sign(x) === -Math.sign(curve[i]) && Math.abs(x) > radius * .9) x = Math.sign(x) * radius * .9;
            // roll around the path: turning left (+roll) lifts the outer (right) side
            const rx = x * c - y * s, ry = y * c + x * s;
            const k = (i * m + j) * 3;
            ring[k] = pts[i][0] + sx * rx; ring[k + 1] = pts[i][1] + ry; ring[k + 2] = pts[i][2] + sz * rx;
        }
    }
    const colour = (j: number): RGB => o.profile.colors?.[j] ?? o.profile.color ?? [.6, .6, .6];
    const tris = (n - 1) * (m - 1) * 2;
    const positions = new Float32Array(tris * 9), normals = new Float32Array(tris * 9), colors = new Float32Array(tris * 12);
    let v = 0;
    const put = (k: number, c: RGB, shade: number, nx: number, ny: number, nz: number) => {
        positions.set([ring[k], ring[k + 1], ring[k + 2]], v * 3);
        normals.set([nx, ny, nz], v * 3);
        colors.set([c[0] * shade, c[1] * shade, c[2] * shade, 1], v * 4);
        v++;
    };
    for (let i = 0; i < n - 1; i++)
    {
        const shade = o.bands && Math.floor((dist[i] + dist[i + 1]) / 2 / o.bands.every) % 2 ? 1 - o.bands.shade : 1;
        for (let j = 0; j < m - 1; j++)
        {
            const a = (i * m + j) * 3, b = (i * m + j + 1) * 3, c = ((i + 1) * m + j) * 3, d = ((i + 1) * m + j + 1) * 3;
            for (const [p, q, s] of [[a, b, c], [b, d, c]])
            {
                // face normal: along x right = up, so wind a -> b -> c
                const ux = ring[q] - ring[p], uy = ring[q + 1] - ring[p + 1], uz = ring[q + 2] - ring[p + 2];
                const wx = ring[s] - ring[p], wy = ring[s + 1] - ring[p + 1], wz = ring[s + 2] - ring[p + 2];
                let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
                const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
                if (!o.flat) { nx = 0; ny = 1; nz = 0; }
                const col = colour(j);
                put(p, col, shade, nx, ny, nz); put(q, col, shade, nx, ny, nz); put(s, col, shade, nx, ny, nz);
            }
        }
    }
    return { positions, normals, colors, bounds: bounds(positions) };
}

/** one mesh per LOD level: level 0 = `options`, level i overrides with `lods[i - 1]` */
export function sweepLods(path: Vec3[], options: Partial<SweepOptions>, lods: SweepLod[]): Mesh[] {
    return [sweep(path, options), ...lods.map(l => sweep(path, { ...options, ...l }))];
}

/** several meshes as one (non indexed) */
export function merge(meshes: Mesh[]): Mesh {
    const len = (k: "positions" | "normals" | "colors") => meshes.reduce((s, m) => s + (m[k]?.length ?? 0), 0);
    const positions = new Float32Array(len("positions")), normals = new Float32Array(len("normals")), colors = new Float32Array(positions.length / 3 * 4);
    let p = 0, c = 0;
    for (const m of meshes)
    {
        positions.set(m.positions, p); normals.set(m.normals, p);
        if (m.colors) colors.set(m.colors, c); else colors.fill(1, c, c + m.positions.length / 3 * 4);
        p += m.positions.length; c += m.positions.length / 3 * 4;
    }
    return { positions, normals, colors, bounds: bounds(positions) };
}

export function bounds(p: Float32Array): Mesh["bounds"] {
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let i = 0; i < p.length; i += 3)
    {
        min.x = Math.min(min.x, p[i]); min.y = Math.min(min.y, p[i + 1]); min.z = Math.min(min.z, p[i + 2]);
        max.x = Math.max(max.x, p[i]); max.y = Math.max(max.y, p[i + 1]); max.z = Math.max(max.z, p[i + 2]);
    }
    if (!p.length) { min.x = min.y = min.z = max.x = max.y = max.z = 0; }
    const radius = Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
    return { min, max, radius };
}
