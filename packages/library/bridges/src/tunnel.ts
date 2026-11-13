import { Soup } from "./geometry";
import type { Mesh, RGB, TunnelOptions, Vec3 } from "./types";

export const TUNNEL: TunnelOptions = { width: 9, height: 7, walkway: .8, kerb: .3, lampEvery: 16, stone: [.42, .4, .37], lamp: [1, .82, .45] };

/**
 * Tunnel tube along `path` (road level, the floor itself is the road drawn by the caller): walkways with a kerb,
 * walls, round vault, a handrail on posts, a cable run and wall lamps. Rings at every path point share their
 * vertices with the next (one closed tube). Ends open: portals (`portal`) frame them.
 */
export function tunnel(path: Vec3[], options: Partial<TunnelOptions> = {}): Mesh {
    const o = { ...TUNNEL, ...options }, s = new Soup(), n = path.length;
    if (n < 2) return s.mesh();
    const r = o.width / 2, spring = o.height - r, kw = o.walkway, kh = o.kerb, N = 10;
    const stone = o.stone, vault: RGB = stone.map(c => c * .8) as RGB, walk: RGB = stone.map(c => Math.min(1, c * 1.25)) as RGB, metal: RGB = [.25, .26, .28];
    // profile (x across, y up), left to right over the top
    const prof: [number, number, RGB][] = [[-r + kw, -.4, walk], [-r + kw, kh, walk], [-r, kh, stone], [-r, spring, stone]];
    for (let i = 1; i < N; i++) { const t = Math.PI - i / N * Math.PI; prof.push([Math.cos(t) * r, spring + Math.sin(t) * r, vault]); }
    prof.push([r, spring, stone], [r, kh, walk], [r - kw, kh, walk], [r - kw, -.4, walk]);
    // frame per point: mitred side vector (rings meet exactly)
    const frames = path.map((p, i) => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
        return { p, sx: -(b[2] - a[2]) / l, sz: (b[0] - a[0]) / l };
    });
    const at = (f: typeof frames[0], x: number, y: number): Vec3 => [f.p[0] + f.sx * x, f.p[1] + y, f.p[2] + f.sz * x];
    for (let i = 0; i < n - 1; i++)
    {
        const A = frames[i], B = frames[i + 1];
        for (let k = 0; k < prof.length - 1; k++)
        {
            const [xa, ya, col] = prof[k], [xb, yb] = prof[k + 1];
            s.quad2(at(A, xa, ya), at(B, xa, ya), at(B, xb, yb), at(A, xb, yb), col);
        }
    }
    // handrail on posts along both walkways, a cable run on the walls
    let walked = 0, nextPost = 0, nextLamp = o.lampEvery / 2, side = 1;
    for (let i = 0; i < n - 1; i++)
    {
        const A = frames[i], B = frames[i + 1], l = Math.hypot(B.p[0] - A.p[0], B.p[2] - A.p[2]);
        for (const k of [-1, 1])
        {
            const x = k * (r - kw + .12);
            s.beam(at(A, x, kh + 1), at(B, x, kh + 1), .08, .08, metal);
            s.beam(at(A, k * (r - .1), spring - 1), at(B, k * (r - .1), spring - 1), .2, .12, metal);
        }
        while (nextPost <= walked + l)
        {
            const t = (nextPost - walked) / l, f = { p: [A.p[0] + (B.p[0] - A.p[0]) * t, A.p[1] + (B.p[1] - A.p[1]) * t, A.p[2] + (B.p[2] - A.p[2]) * t] as Vec3, sx: A.sx, sz: A.sz };
            for (const k of [-1, 1]) s.beam(at(f, k * (r - kw + .12), kh), at(f, k * (r - kw + .12), kh + 1), .08, .08, metal);
            nextPost += 3;
        }
        while (nextLamp <= walked + l)
        {
            const t = (nextLamp - walked) / l, f = { p: [A.p[0] + (B.p[0] - A.p[0]) * t, A.p[1] + (B.p[1] - A.p[1]) * t, A.p[2] + (B.p[2] - A.p[2]) * t] as Vec3, sx: A.sx, sz: A.sz };
            const c = at(f, side * (r - .15), spring - .2);
            s.beam([c[0], c[1] - .2, c[2]], [c[0], c[1] + .2, c[2]], .5, .25, o.lamp);
            side = -side;
            nextLamp += o.lampEvery;
        }
        walked += l;
    }
    return s.mesh();
}
