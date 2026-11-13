// Road network audit on a generated world: prints defect counts + worst examples (x z) to look at.
import { generate, type TerrainHooks } from "@polywar/terrain";
import { hydrologyHooks } from "@polywar/hydrology";
import { roadHooks, sampler } from "@polywar/roads";
import { generateSites } from "@polywar/sites";
import { STEEP } from "@polywar/ways";

const [quality = "low", seed = "1"] = process.argv.slice(2);
const hydro = hydrologyHooks({}), roads = roadHooks(raw => generateSites(raw as any, raw.cities, {}), {}, "{}");
const hooks: TerrainHooks = {
    key: hydro.key + "|" + roads.key,
    features: async raw => {
        const a = hydro.features(raw as any); roads.features(raw as any);
        return a;
    },
    fix: async data => { await hydro.fix(data as any); await roads.fix(data as any); },
};
let t = performance.now();
const d = await generate({ quality: quality as any, seed: +seed }, undefined, hooks);
console.log(`world ${quality} seed ${seed}: ${((performance.now() - t) / 1000).toFixed(1)} s, timings ${JSON.stringify(roads.roads?.timings, (_, v) => typeof v === "number" ? Math.round(v) : v)}`);
const net = roads.roads!.network, n = d.n, size = d.size, ground = sampler(d as any);
const node = (x: number, z: number) => Math.round((z / size + .5) * (n - 1)) * n + Math.round((x / size + .5) * (n - 1));
const wet = (x: number, z: number) => { const k = node(x, z); return k >= 0 && k < n * n ? d.water[k] : 0; };
const at = (p: number[]) => `(${p[0].toFixed(0)} ${p[2].toFixed(0)})`;

type Issue = { what: string; score: number; where: string };
const issues: Issue[] = [];
const add = (what: string, score: number, where: string) => issues.push({ what, score, where });
const counts: Record<string, number> = {};
for (const r of net.roads) counts[r.class] = (counts[r.class] ?? 0) + 1;
console.log(`roads ${net.roads.length} ${JSON.stringify(counts)}, junctions ${net.junctions.length}`);
{
    // bridges per class: count / metres
    const b: Record<string, [number, number]> = {};
    for (const r of net.roads) for (const s of r.spans) if (s.kind === "bridge")
    {
        let l = 0; for (let i = s.from + 1; i <= s.to; i++) l += Math.hypot(r.points[i][0] - r.points[i - 1][0], r.points[i][2] - r.points[i - 1][2]);
        const e = b[r.class + (s.auto ? "*" : "")] ??= [0, 0]; e[0]++; e[1] += l;
    }
    console.log(`bridges ${Object.entries(b).map(([k, [n, l]]) => `${k} ${n} / ${l.toFixed(0)} m`).join(", ")}`);
}

const MINR: Record<string, number> = { highway: 150, road: 60, lane: 25, path: 8, rail: 300 };
for (const r of net.roads)
{
    const P = r.points;
    for (const s of r.spans)
    {
        const pts = P.slice(s.from, s.to + 1);
        if (s.kind === "bridge")
        {
            const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]);
            let path = 0, dev = 0, w = 0;
            for (let i = 1; i < pts.length; i++) path += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
            for (const p of pts) { const ux = (b[0] - a[0]) / (L || 1), uz = (b[2] - a[2]) / (L || 1); dev = Math.max(dev, Math.abs(-(p[0] - a[0]) * uz + (p[2] - a[2]) * ux)); if (wet(p[0], p[2])) w++; }
            if (dev > 3) add(`bridge bent (${r.class})`, dev, `${at(a)} dev ${dev.toFixed(0)} m, len ${path.toFixed(0)}`);
            if (wet(a[0], a[2]) || wet(b[0], b[2])) add(`bridge end in water (${r.class})`, path, `${at(a)}→${at(b)}`);
            if (path > 60 && w / pts.length > .6) add(`long bridge along water (${r.class})`, path, `${at(a)} len ${path.toFixed(0)}`);
            const ga = ground(a[0], a[2]), gb = ground(b[0], b[2]);
            if (Math.abs(a[1] - ga) > 1.5 || Math.abs(b[1] - gb) > 1.5) add(`bridge end off ground (${r.class})`, Math.max(Math.abs(a[1] - ga), Math.abs(b[1] - gb)), `${at(a)} ${(a[1] - ga).toFixed(1)} / ${(b[1] - gb).toFixed(1)}`);
        }
        if (s.kind === "ground")
        {
            let inWater = 0, off = 0, offAt = "", tight = 0, tightAt = "", tr = Infinity;
            for (const p of pts) if (wet(p[0], p[2])) inWater++;
            for (const p of pts) { const e = Math.abs(p[1] - ground(p[0], p[2])); if (e > off) { off = e; offAt = at(p); } }
            for (let i = 2; i < pts.length - 2; i++)
            {
                const a = pts[i - 2], b = pts[i], c = pts[i + 2];
                const ab = Math.hypot(b[0] - a[0], b[2] - a[2]), bc = Math.hypot(c[0] - b[0], c[2] - b[2]), ac = Math.hypot(c[0] - a[0], c[2] - a[2]);
                const cross = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]));
                const R = cross < 1e-6 ? Infinity : ab * bc * ac / (2 * cross);
                if (R < MINR[r.class] * .5) { tight++; if (R < tr) { tr = R; tightAt = at(b); } }
            }
            if (inWater && r.class !== "path") add(`ground in water (${r.class})`, inWater, `${at(pts[0])} ${inWater} pts`);
            if (off > 1.5 && r.class !== "path") add(`bed off ground (${r.class})`, off, `${offAt} ${off.toFixed(1)} m`);
            if (tight) add(`tight curve (${r.class})`, MINR[r.class] / tr, `${tightAt} R ${tr.toFixed(0)} < ${MINR[r.class]}`);
            if (r.class === "path")
            {
                let run = 0;
                for (let i = 1; i < pts.length; i++)
                {
                    const g0 = ground(pts[i - 1][0], pts[i - 1][2]), g1 = ground(pts[i][0], pts[i][2]), l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]) || 1;
                    if (Math.abs(g1 - g0) / l > STEEP) run++; else { if (run >= 2) add("path steps", run, at(pts[i])); run = 0; }
                }
            }
        }
    }
    // kinks where spans meet (bridge / tunnel straight vs ground)
    for (const s of r.spans) if (s.kind !== "ground") for (const e of [s.from, s.to])
    {
        if (e < 2 || e > P.length - 3) continue;
        const a = P[e - 2], b = P[e], c = P[e + 2];
        const h0 = Math.atan2(b[2] - a[2], b[0] - a[0]), h1 = Math.atan2(c[2] - b[2], c[0] - b[0]);
        let dd = Math.abs(h1 - h0); dd = Math.min(dd, Math.PI * 2 - dd);
        if (dd > .35) add(`kink at ${s.kind} end (${r.class})`, dd * 57.3, `${at(b)} ${(dd * 57.3).toFixed(0)}°`);
    }
}
// spikes: the line turns back on itself (> 90° between neighbour segments), drawn as a fold
for (const r of net.roads) for (let i = 1; i < r.points.length - 1; i++)
{
    const a = r.points[i - 1], b = r.points[i], c = r.points[i + 1];
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - b[0], vz = c[2] - b[2];
    if (ux * vx + uz * vz < 0) add(`spike (${r.class})`, 1, `${at(b)} road ${r.id} i ${i}/${r.points.length}`);
}
// crossings of two ways on the ground (no junction): one height
for (const A of net.roads) for (const Bw of net.roads)
{
    if (A.id >= Bw.id || (A.chain !== undefined && A.chain === Bw.chain)) continue;
    const kind = (r: typeof A, i: number) => r.spans.find(s => i >= s.from && i < s.to)?.kind ?? "ground";
    for (let i = 0; i < A.points.length - 1; i++) for (let k = 0; k < Bw.points.length - 1; k++)
    {
        const a0 = A.points[i], a1 = A.points[i + 1], b0 = Bw.points[k], b1 = Bw.points[k + 1];
        if (Math.abs(a0[0] - b0[0]) > 10 || Math.abs(a0[2] - b0[2]) > 10) continue;
        const d1x = a1[0] - a0[0], d1z = a1[2] - a0[2], d2x = b1[0] - b0[0], d2z = b1[2] - b0[2], den = d1x * d2z - d1z * d2x;
        if (Math.abs(den) < 1e-9) continue;
        const s = ((b0[0] - a0[0]) * d2z - (b0[2] - a0[2]) * d2x) / den, t = ((b0[0] - a0[0]) * d1z - (b0[2] - a0[2]) * d1x) / den;
        if (s < 0 || s > 1 || t < 0 || t > 1 || kind(A, i) !== "ground" || kind(Bw, k) !== "ground") continue;
        const dy = Math.abs(a0[1] + (a1[1] - a0[1]) * s - b0[1] - (b1[1] - b0[1]) * t);
        if (dy > .5) add(`crossing height step (${A.class}/${Bw.class})`, dy, `${at(a0)} ${dy.toFixed(1)} m`);
    }
}
// grade: over ~20 m stretches, steeper than 2x the class max (roads climbing / dropping into tunnels, ...)
{
    const MAX: Record<string, number> = { highway: .06, road: .1, lane: .15, rail: .04, path: .6 };
    for (const r of net.roads)
    {
        let worst = 0, where = r.points[0];
        for (let i = 0; i + 5 < r.points.length; i++)
        {
            const a = r.points[i], b = r.points[i + 5], l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1, g = Math.abs(b[1] - a[1]) / l;
            if (g > worst) { worst = g; where = a; }
        }
        if (worst > (MAX[r.class] ?? .2) * 2) add(`steep (${r.class})`, worst, `${at(where)} ${(worst * 100).toFixed(0)}% road ${r.id} ${r.spans.map(s => s.kind[0]).join("")}`);
    }
}
// junction ends: every road end at a junction should be at the same spot and height
for (const j of net.junctions)
{
    let gap = 0, dy = 0;
    const ends = j.roads.map(a => { const r = net.roads[a.road]; return r.from === j.id && Math.hypot(r.points[0][0] - j.x, r.points[0][2] - j.z) < Math.hypot(r.points[r.points.length - 1][0] - j.x, r.points[r.points.length - 1][2] - j.z) ? r.points[0] : r.points[r.points.length - 1]; });
    for (const e of ends) { gap = Math.max(gap, Math.hypot(e[0] - j.x, e[2] - j.z)); }
    for (const e of ends) for (const f of ends) dy = Math.max(dy, Math.abs(e[1] - f[1]));
    if (gap > .5) add("junction gap", gap, `${at([j.x, 0, j.z])} ${gap.toFixed(1)} m`);
    if (dy > .3) add("junction height step", dy, `${at([j.x, 0, j.z])} ${dy.toFixed(2)} m, ${j.roads.length} arms`);
    // narrow junction: two non-rail arms less than 35° apart (pads / overlapping strips)
    for (let a = 0; a < j.roads.length; a++) for (let b = a + 1; b < j.roads.length; b++)
    {
        if (j.roads[a].class === "rail" || j.roads[b].class === "rail") continue;
        let dd = Math.abs(j.roads[a].angle - j.roads[b].angle); dd = Math.min(dd, Math.PI * 2 - dd);
        if (dd < .61) add(`junction narrow (${j.roads[a].class}/${j.roads[b].class})`, 35 - dd * 57.3, `${at([j.x, 0, j.z])} ${(dd * 57.3).toFixed(0)}°`);
    }
    // through roads: 2 same class arms ~opposite = should be one curve (kink check)
    for (let a = 0; a < j.roads.length; a++) for (let b = a + 1; b < j.roads.length; b++)
    {
        let dd = Math.abs(j.roads[a].angle - j.roads[b].angle); dd = Math.min(dd, Math.PI * 2 - dd);
        if (j.roads[a].class === j.roads[b].class && dd > Math.PI * .6 && dd < Math.PI * .93) add(`junction kink (${j.roads[a].class})`, 180 - dd * 57.3, `${at([j.x, 0, j.z])} ${(180 - dd * 57.3).toFixed(0)}°`);
    }
}
// overlap: points of two different ways (not near a shared junction) closer than their half widths
{
    const B = 16, grid = new Map<number, [number, number, number][]>(), key = (x: number, z: number) => (Math.floor(x / B) + 4096) * 8192 + Math.floor(z / B) + 4096;
    for (const r of net.roads) r.points.forEach((p, i) => { const k = key(p[0], p[2]); (grid.get(k) ?? grid.set(k, []).get(k)!).push([r.id, i, 0]); });
    const near = (r: typeof net.roads[0], p: number[]) => net.junctions.some(j => (j.id === r.from || j.id === r.to) && Math.hypot(p[0] - j.x, p[2] - j.z) < 30);
    const seen = new Set<string>();
    for (const r of net.roads) for (const p of r.points)
    {
        if (near(r, p)) continue;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [id, i] of grid.get(key(p[0] + a * B, p[2] + b * B)) ?? [])
        {
            if (id === r.id) continue;
            const o = net.roads[id], q = o.points[i];
            if (Math.abs(q[1] - p[1]) > 5 || near(o, q)) continue;
            const g = Math.hypot(q[0] - p[0], q[2] - p[2]);
            if (g < (r.width + o.width) / 2 + 1)
            {
                const k = [Math.min(r.id, id), Math.max(r.id, id)].join();
                if (seen.has(k)) continue;
                seen.add(k);
                add(`ways overlap (${r.class}/${o.class})`, 1, at(p));
            }
        }
    }
}
// lakes: neighbouring lake nodes with different levels
{
    let steps = 0, worst = 0, where = "";
    for (let k = 0; k < n * n; k++) if (d.water[k] === 2) for (const o of [1, n])
    {
        const m = k + o;
        if (m < n * n && d.water[m] === 2 && Math.abs(d.surface[m] - d.surface[k]) > .05) { steps++; const s = Math.abs(d.surface[m] - d.surface[k]); if (s > worst) { worst = s; where = `(${((k % n) / (n - 1) * size - size / 2).toFixed(0)} ${(((k / n) | 0) / (n - 1) * size - size / 2).toFixed(0)})`; } }
    }
    if (steps) add("lake level step", worst, `${where} ${steps} edges, worst ${worst.toFixed(2)} m`);
    let rl = 0;
    for (let k = 0; k < n * n; k++) if (d.water[k] === 3) for (const o of [1, -1, n, -n]) { const m = k + o; if (m >= 0 && m < n * n && d.water[m] === 2 && d.surface[k] < d.surface[m] - .5) rl++; }
    if (rl) add("river under lake level", rl, `${rl} edges`);
}

const groups = new Map<string, Issue[]>();
for (const i of issues) (groups.get(i.what) ?? groups.set(i.what, []).get(i.what)!).push(i);
for (const [what, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0])))
{
    list.sort((a, b) => b.score - a.score);
    console.log(`${String(list.length).padStart(5)}  ${what}: ${list.slice(0, 3).map(i => i.where).join(" | ")}`);
}

// AT="x,z": the ways near a spot (points, spans) to debug one issue
if (process.env.AT)
{
    const [x, z] = process.env.AT.split(",").map(Number);
    for (const r of net.roads)
    {
        const i = r.points.findIndex(p => Math.hypot(p[0] - x, p[2] - z) < 12);
        if (i < 0) continue;
        console.log(`road ${r.id} ${r.class} chain ${r.chain} ${r.from}→${r.to} spans ${JSON.stringify(r.spans)} n ${r.points.length}`);
        console.log("  " + r.points.slice(Math.max(0, i - 6), i + 7).map((p, k) => `${Math.max(0, i - 6) + k}:${p[0].toFixed(1)},${p[2].toFixed(1)},${p[1].toFixed(1)}`).join(" "));
    }
}
if (process.env.ROAD) { const r = net.roads[+process.env.ROAD]; console.log(r.points.map((p, i) => `${i} ${p[0].toFixed(0)},${p[2].toFixed(0)} y ${p[1].toFixed(1)} g ${ground(p[0], p[2]).toFixed(1)}`).join("\n")); }
if (process.env.CHAIN) for (const r of net.roads.filter(r => r.chain === +process.env.CHAIN!)) console.log(`road ${r.id} ${r.from}→${r.to} ${JSON.stringify(r.spans)} ` + r.points.filter((_, i) => i % 3 === 0).map(p => `${p[0].toFixed(0)},${p[2].toFixed(0)}:${(p[1] - ground(p[0], p[2])).toFixed(0)}`).join(" "));
if (process.env.WATER) { const [x, z] = process.env.WATER.split(",").map(Number); for (let b = -3; b <= 3; b++) console.log(Array.from({ length: 7 }, (_, a) => { const k = node(x + (a - 3) * 6, z + b * 6); return `${d.water[k]}:${d.height[k].toFixed(0)}/${d.surface[k].toFixed(0)}`; }).join("  ")); }
if (process.env.TUNNELS) for (const r of net.roads) for (const s of r.spans) if (s.kind === "tunnel") { const a = r.points[s.from], b = r.points[s.to]; console.log(`tunnel ${r.class} ${at(a)}→${at(b)} y ${a[1].toFixed(0)}/${b[1].toFixed(0)} ground ${ground(a[0], a[2]).toFixed(0)}/${ground(b[0], b[2]).toFixed(0)}`); }
