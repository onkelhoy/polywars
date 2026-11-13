import { bounds } from "@polywar/sweep";
import type { ClassStyle, Mesh, Way, WayJunction } from "./types";

/** corner radius per class (metres): bigger roads sweep wider */
export const CORNER: Record<string, number> = { highway: 14, road: 8, lane: 4, path: 1.5 };
const RANK: Record<string, number> = { path: 1, lane: 2, road: 3, highway: 4 };

/**
 * One flat shaded pad per junction: road ends joined with rounded corners (a quadratic curve between the left edge of
 * one road and the right edge of the next, around the junction). Straight through (2 roads, ~180°) and dead ends get none.
 * Sits a little over the road strips so it covers their ends.
 */
export function junctionPads(junctions: WayJunction[], roads: Way[], ground: (x: number, z: number) => number, styles: Record<string, ClassStyle>): Mesh | undefined {
    const byId = new Map(roads.map(r => [r.id, r])), p: number[] = [], n: number[] = [], c: number[] = [];
    for (const j of junctions)
    {
        const arms = j.roads.filter(a => a.class !== "rail" && styles[a.class]?.profile).map(a => ({ ...a, w: (byId.get(a.road)?.width ?? 4) / 2 })).sort((a, b) => a.angle - b.angle);
        if (arms.length < 2) continue;
        if (arms.length === 2) { let d = Math.abs(arms[1].angle - arms[0].angle); d = Math.min(d, Math.PI * 2 - d); if (d > Math.PI * .8) continue; }
        const big = arms.reduce((b, a) => (RANK[a.class] ?? 0) > (RANK[b.class] ?? 0) ? a : b), style = styles[big.class]!;
        const col = style.profile!.colors?.[1] ?? style.profile!.color ?? [.5, .5, .5];
        const R = CORNER[big.class] ?? 6, lift = style.lift + .04;
        const ring: [number, number][] = [];
        for (let i = 0; i < arms.length; i++)
        {
            const a = arms[i], b = arms[(i + 1) % arms.length];
            const ua: [number, number] = [Math.cos(a.angle), Math.sin(a.angle)], ub: [number, number] = [Math.cos(b.angle), Math.sin(b.angle)];
            // left of a (towards b, counter clockwise) and right of b
            const la: [number, number] = [-ua[1], ua[0]], rb: [number, number] = [ub[1], -ub[0]];
            const A0: [number, number] = [j.x + la[0] * a.w, j.z + la[1] * a.w], B0: [number, number] = [j.x + rb[0] * b.w, j.z + rb[1] * b.w];
            // where the two edge lines meet
            const den = ua[0] * ub[1] - ua[1] * ub[0];
            let gap = b.angle - a.angle; if (i === arms.length - 1) gap += Math.PI * 2;
            if (Math.abs(den) < .15 || gap > Math.PI * .95)
            {
                const s = Math.max(a.w, b.w) * 1.2;
                ring.push([A0[0] + ua[0] * s, A0[1] + ua[1] * s], [B0[0] + ub[0] * s, B0[1] + ub[1] * s]);
                continue;
            }
            const t = ((B0[0] - A0[0]) * ub[1] - (B0[1] - A0[1]) * ub[0]) / den, P: [number, number] = [A0[0] + ua[0] * t, A0[1] + ua[1] * t];
            // the curve starts R further out along both edges (sharper corners need more)
            const r = R / Math.max(.35, Math.tan(Math.min(gap, Math.PI * .9) / 2));
            const T0: [number, number] = [P[0] + ua[0] * r, P[1] + ua[1] * r], T1: [number, number] = [P[0] + ub[0] * r, P[1] + ub[1] * r];
            for (let q = 0; q <= 6; q++) { const s = q / 6, k0 = (1 - s) * (1 - s), k1 = 2 * s * (1 - s), k2 = s * s; ring.push([T0[0] * k0 + P[0] * k1 + T1[0] * k2, T0[1] * k0 + P[1] * k1 + T1[1] * k2]); }
        }
        const y = (x: number, z: number) => Math.max(j.y, ground(x, z)) + lift;
        const centre: [number, number, number] = [j.x, y(j.x, j.z), j.z];
        for (let i = 0; i < ring.length; i++)
        {
            const a = ring[i], b = ring[(i + 1) % ring.length];
            // fan from the centre, wound so the face points up
            const A = [a[0], y(a[0], a[1]), a[1]], B = [b[0], y(b[0], b[1]), b[1]];
            p.push(...centre, ...B, ...A);
            for (let v = 0; v < 3; v++) { n.push(0, 1, 0); c.push(...col, 1); }
        }
    }
    if (!p.length) return undefined;
    const positions = new Float32Array(p);
    return { positions, normals: new Float32Array(n), colors: new Float32Array(c), bounds: bounds(positions) };
}
