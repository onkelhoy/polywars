import { Soup } from "./geometry";
import type { Mesh, PortalOptions, RGB, Vec3 } from "./types";

export const PORTAL: Record<"rail" | "road" | "lane", PortalOptions> = {
    rail: { width: 6, height: 7, wall: 2.5, wings: 7, depth: 10, stone: [.5, .48, .44] },
    road: { width: 9, height: 7, wall: 2.5, wings: 8, depth: 10, stone: [.55, .52, .47] },
    lane: { width: 5, height: 5, wall: 1.8, wings: 5, depth: 8, stone: [.52, .5, .45] },
};

const DARK: RGB = [.05, .05, .05];

/**
 * Tunnel mouth at `at` (road level, centre), `dir` (x z) pointing into the hill: face wall with a round arch,
 * keystone, cornice, wing walls stepping down, lining into the hill and a dark plug at the back.
 */
export function portal(at: Vec3, dir: [number, number], options: Partial<PortalOptions> = {}): Mesh {
    const o = { ...PORTAL.road, ...options }, s = new Soup();
    const l = Math.hypot(dir[0], dir[1]) || 1, fx = dir[0] / l, fz = dir[1] / l, sx = -fz, sz = fx;
    const r = o.width / 2, spring = o.height - r, W = r + o.wall, H = o.height + o.wall * .6, N = 12;
    const stone = o.stone, dark: RGB = [stone[0] * .75, stone[1] * .75, stone[2] * .75];
    // local (x across, y up, d into the hill) to world
    const P = (x: number, y: number, d = 0): Vec3 => [at[0] + sx * x + fx * d, at[1] + y, at[2] + sz * x + fz * d];
    const arch = Array.from({ length: N + 1 }, (_, i) => { const t = Math.PI - i / N * Math.PI; return [Math.cos(t) * r, spring + Math.sin(t) * r] as [number, number]; });
    const below = -2;
    // face (front = towards -dir): jambs, then arch columns up to the top
    const face = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => s.quad(a, b, c, d, stone);
    face(P(-W, below), P(-r, below), P(-r, spring), P(-W, spring));
    face(P(r, below), P(W, below), P(W, spring), P(r, spring));
    face(P(-W, spring), P(-r, spring), P(-r, H), P(-W, H));
    face(P(r, spring), P(W, spring), P(W, H), P(r, H));
    for (let i = 0; i < N; i++) { const [xa, ya] = arch[i], [xb, yb] = arch[i + 1]; face(P(xa, ya), P(xb, yb), P(xb, H), P(xa, H)); }
    // thickness: top + sides of the face wall (1 m)
    s.block(P(0, H, .5), [fx, fz], [1.6, .5, W * 2 + .6], dark);
    // keystone + voussoir ring
    s.block(P(0, o.height - .3, -.15), [fx, fz], [.6, 1.1, 1], dark);
    for (let i = 1; i < N; i += 2) { const [x, y] = arch[i], ux = x / r, uy = (y - spring) / r; s.beam(P(x, y, -.1), P(x + ux * .8, y + uy * .8, -.1), .5, .4, dark); }
    // lining: jamb walls + arch vault into the hill (seen from inside: faces point in)
    s.quad(P(-r, below, 0), P(-r, below, o.depth), P(-r, spring, o.depth), P(-r, spring, 0), dark);
    s.quad(P(r, spring, 0), P(r, spring, o.depth), P(r, below, o.depth), P(r, below, 0), dark);
    for (let i = 0; i < N; i++) { const [xa, ya] = arch[i], [xb, yb] = arch[i + 1]; s.quad(P(xb, yb, 0), P(xb, yb, o.depth), P(xa, ya, o.depth), P(xa, ya, 0), dark); }
    // dark plug
    s.quad(P(r, below, o.depth), P(-r, below, o.depth), P(-r, o.height, o.depth), P(r, o.height, o.depth), DARK);
    // wing walls: out and back from the face edges, stepping down
    if (o.wings > 0) for (const k of [-1, 1])
    {
        const steps = 3, wx = W, ang = .6;
        for (let i = 0; i < steps; i++)
        {
            const t0 = i / steps, t1 = (i + 1) / steps, h = H * (1 - t0 * .75);
            const x0 = k * (wx + Math.sin(ang) * o.wings * t0), d0 = -Math.cos(ang) * o.wings * t0 + .5;
            const x1 = k * (wx + Math.sin(ang) * o.wings * t1), d1 = -Math.cos(ang) * o.wings * t1 + .5;
            const a = P(x0, below, d0), b = P(x1, below, d1);
            const segDir: [number, number] = [b[0] - a[0], b[2] - a[2]], len = Math.hypot(segDir[0], segDir[1]);
            s.block(P((x0 + x1) / 2, below, (d0 + d1) / 2), segDir, [len + .05, h - below, 1], stone);
        }
    }
    return s.mesh();
}
