import { Random } from "@papit/random";
import type { RoadClass, RoadsOptions, Site } from "./types";

export type Link = { cls: RoadClass; a: Site; b: Site };
const dist = (a: Site, b: Site) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Which sites to connect, per class, in build order (highway, rail, road, lane, path; short links first so longer
 * ones can reuse them):
 * highway = cities as a Gabriel graph (loops: more than one way between towns), rail = the biggest cities as a
 * minimum spanning tree + one loop, road = each village to its 2 nearest towns / villages (3 at `extra`),
 * lane = farm to nearest town / village, path = landmark to nearest settlement.
 */
export function topology(sites: Site[], o: RoadsOptions): Link[] {
    const rng = new Random(o.seed), cities = sites.filter(s => s.kind === "city"), villages = sites.filter(s => s.kind === "village");
    const farms = sites.filter(s => s.kind === "farm"), marks = sites.filter(s => !["city", "village", "farm"].includes(s.kind));
    const towns = [...cities, ...villages], out: Link[] = [], seen = new Set<string>();
    const add = (cls: RoadClass, a: Site, b: Site) => {
        const key = cls + ":" + Math.min(a.id, b.id) + ":" + Math.max(a.id, b.id);
        if (a === b || seen.has(key)) return;
        seen.add(key); out.push({ cls, a, b });
    };
    const sorted = (list: Link[]) => list.sort((p, q) => dist(p.a, p.b) - dist(q.a, q.b));

    if (o.build.highway) for (const l of sorted(gabriel(cities).map(([a, b]) => ({ cls: "highway" as RoadClass, a, b })))) add(l.cls, l.a, l.b);
    if (o.build.rail)
    {
        const big = cities.slice().sort((a, b) => b.weight - a.weight || b.radius - a.radius).slice(0, o.rail.count);
        const tree = mst(big), rest = gabriel(big).filter(([a, b]) => !tree.some(([c, d]) => (a === c && b === d) || (a === d && b === c)));
        for (const [a, b] of tree) add("rail", a, b);
        if (o.extra > 0 && rest.length) { const [a, b] = rest.sort((p, q) => dist(p[0], p[1]) - dist(q[0], q[1]))[0]; add("rail", a, b); }
    }
    if (o.build.road)
    {
        const list: Link[] = [];
        for (const v of villages)
        {
            const near = towns.filter(t => t !== v).sort((a, b) => dist(v, a) - dist(v, b));
            const k = rng.chance(o.extra) ? 3 : 2;
            for (const t of near.slice(0, k)) list.push({ cls: "road", a: v, b: t });
        }
        for (const l of sorted(list)) add(l.cls, l.a, l.b);
    }
    if (o.build.lane) for (const f of farms) { const t = nearest(f, towns); if (t) add("lane", f, t); }
    if (o.build.path) for (const m of marks) { const t = nearest(m, [...towns, ...farms]); if (t) add("path", m, t); }
    return out;
}

const nearest = (s: Site, list: Site[]) => list.reduce<Site | null>((best, t) => !best || dist(s, t) < dist(s, best) ? t : best, null);

/** edges ab with no other site inside the circle over ab */
function gabriel(list: Site[]): [Site, Site][] {
    const out: [Site, Site][] = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
    {
        const a = list[i], b = list[j], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, r2 = ((a.x - b.x) ** 2 + (a.z - b.z) ** 2) / 4;
        if (list.every(c => c === a || c === b || (c.x - mx) ** 2 + (c.z - mz) ** 2 > r2)) out.push([a, b]);
    }
    return out;
}

/** Prim */
function mst(list: Site[]): [Site, Site][] {
    if (list.length < 2) return [];
    const inside = [list[0]], rest = list.slice(1), out: [Site, Site][] = [];
    while (rest.length)
    {
        let best: [number, Site, Site] = [Infinity, list[0], list[0]];
        for (const a of inside) for (const b of rest) { const d = dist(a, b); if (d < best[0]) best = [d, a, b]; }
        out.push([best[1], best[2]]); inside.push(best[2]); rest.splice(rest.indexOf(best[2]), 1);
    }
    return out;
}
