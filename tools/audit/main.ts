// Road network audit on a generated world: prints defect counts + worst examples (x z) to look at.
import { generate, type TerrainHooks } from "@polywar/terrain";
import { hydrologyHooks } from "@polywar/hydrology";
import { roadHooks, sampler } from "@polywar/roads";
import { generateSites } from "@polywar/sites";
import { STEEP, buildWays } from "@polywar/ways";
import { Ground, triangulate } from "@polywar/terrain";

const [quality = "low", seed = "1"] = process.argv.slice(2);
const hydro = hydrologyHooks({}), roads = roadHooks(raw => generateSites(raw as any, raw.cities, {}), {}, "{}");
const hooks: TerrainHooks = {
    key: hydro.key + "|" + roads.key,
    features: async raw => {
        const a = hydro.features(raw as any); roads.features(raw as any);
        return a;
    },
    fix: async data => {
        await hydro.fix(data as any);
        if (process.env.SEALDBG) { const c = { ...data, height: data.height.slice(), surface: data.surface.slice(), water: data.water.slice() }; hydro.seal(c as any); console.log("seal before roads", JSON.stringify(hydro.sealed)); }
        await roads.fix(data as any);
        const pre = data.height.slice();
        if (process.env.WGRID) { const [x, z] = process.env.WGRID.split(',').map(Number), N = data.n, c = data.size / (N - 1), nd = (x: number, z: number) => Math.round((z / data.size + .5) * (N - 1)) * N + Math.round((x / data.size + .5) * (N - 1)); console.log('pre seal:'); for (let b = -5; b <= 5; b++) console.log(Array.from({ length: 11 }, (_, a) => { const k = nd(x + (a - 5) * c, z + b * c); return `${data.water[k]}:${pre[k].toFixed(1)}/${data.water[k] ? data.surface[k].toFixed(1) : '    '}`.padEnd(15); }).join('')); }
        hydro.seal(data as any);
        if (process.env.SEALDBG) { const cells = new Map<string, [number, number]>(), N = data.n, c = data.size / (N - 1); for (let k = 0; k < pre.length; k++) { const r = data.height[k] - pre[k]; if (r > 2) { const key = `${Math.round(((k % N) * c - data.size / 2) / 60) * 60},${Math.round((((k / N) | 0) * c - data.size / 2) / 60) * 60}`; const e = cells.get(key) ?? [0, 0]; e[0]++; e[1] = Math.max(e[1], r); cells.set(key, e); } } console.log('raised > 2 m by 60 m cell:', [...cells].sort((a, b) => b[1][0] - a[1][0]).slice(0, 15).map(([k, [n, m]]) => `${k} ${n}x ${m.toFixed(0)}m`).join(' | ')); }
    },
};
let t = performance.now();
const d = await generate({ quality: quality as any, seed: +seed }, undefined, hooks);
console.log(`world ${quality} seed ${seed}: ${((performance.now() - t) / 1000).toFixed(1)} s, timings ${JSON.stringify(roads.roads?.timings, (_, v) => typeof v === "number" ? Math.round(v) : v)}`);
const net = roads.roads!.network, n = d.n, size = d.size, ground = sampler(d as any);
const node = (x: number, z: number) => Math.round((z / size + .5) * (n - 1)) * n + Math.round((x / size + .5) * (n - 1));
const wet = (x: number, z: number) => { const k = node(x, z); return k >= 0 && k < n * n ? d.water[k] : 0; };
const at = (p: number[]) => `(${p[0].toFixed(0)} ${p[2].toFixed(0)})`;

// UNDER=1: spots where a way passes under another way's deck (piers must keep off it)
if (process.env.UNDER)
{
    const kindAt = (r: typeof net.roads[0], i: number) => r.spans.find(sp => i >= sp.from && i < sp.to)?.kind ?? "ground";
    const out: string[] = [];
    for (const r of net.roads) for (const sp of r.spans) if (sp.kind === "bridge") for (const o of net.roads)
    {
        if (o === r || (o.chain !== undefined && o.chain === r.chain)) continue;
        for (let i = 0; i < o.points.length; i++)
        {
            const p = o.points[i];
            if (kindAt(o, i) === "tunnel") continue;
            const hit = r.points.slice(sp.from, sp.to + 1).some(q => Math.hypot(q[0] - p[0], q[2] - p[2]) < (r.width + o.width) / 2 && q[1] > p[1] + 1);
            if (hit) { out.push(`${r.class} over ${o.class} ${at(p)}`); break; }
        }
    }
    console.log("under decks:", [...new Set(out)].join(" | "));
}

// rail junctions by arms (2 = a split / join of one track, 3 = a fork, 4 = a diamond crossing)
{
    const arms = new Map<number, number>();
    for (const r of net.roads) if (r.class === "rail") for (const j of [r.from, r.to]) arms.set(j, (arms.get(j) ?? 0) + 1);
    const by: Record<number, number> = {};
    for (const a of arms.values()) by[a] = (by[a] ?? 0) + 1;
    console.log("rail junctions by arms", JSON.stringify(by));
}

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
// stacked: one way over another (plan strips overlap) with too little room between (1..7 m): a deck through a deck,
// a way hanging under / in another; not within 15 m of a junction both share
{
    const B = 16, grid = new Map<number, [number, number][]>(), key = (x: number, z: number) => (Math.floor(x / B) + 4096) * 8192 + Math.floor(z / B) + 4096;
    const kindAt = (r: typeof net.roads[0], i: number) => r.spans.find(sp => i >= sp.from && i < sp.to)?.kind ?? "ground";
    for (const r of net.roads) r.points.forEach((p, i) => { const k = key(p[0], p[2]); (grid.get(k) ?? grid.set(k, []).get(k)!).push([r.id, i]); });
    const jxz = new Map(net.junctions.map(j => [j.id, j]));
    const seen = new Set<string>();
    for (const r of net.roads) r.points.forEach((p, ip) => {
        if (kindAt(r, ip) === "tunnel") return;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [id, i] of grid.get(key(p[0] + a * B, p[2] + b * B)) ?? [])
        {
            const o = net.roads[id], q = o.points[i];
            if (id === r.id || (o.chain !== undefined && o.chain === r.chain) || kindAt(o, i) === "tunnel") continue;
            const dy = Math.abs(q[1] - p[1]);
            if (dy < 1 || dy > 6.5 || Math.hypot(q[0] - p[0], q[2] - p[2]) > (r.width + o.width) / 2) continue;
            const shared = [r.from, r.to].filter(j => j === o.from || j === o.to).map(j => jxz.get(j)!).filter(Boolean);
            if (shared.some(j => Math.hypot(p[0] - j.x, p[2] - j.z) < 15)) continue;
            const k = [Math.min(r.id, id), Math.max(r.id, id)].join();
            if (seen.has(k)) continue;
            seen.add(k);
            add(`ways stacked (${r.class}/${o.class})`, dy, `${at(p)} ${dy.toFixed(1)} m ${kindAt(r, ip)}/${kindAt(o, i)}`);
        }
    });
}
// underground: a way meeting / crossing another inside a tunnel (fork in the tube, tube through a tube)
{
    const kindAt = (r: typeof net.roads[0], i: number) => r.spans.find(sp => i >= sp.from && i < sp.to)?.kind ?? "ground";
    const inTube = (r: typeof net.roads[0], i: number) => kindAt(r, i) === "tunnel" || (i > 0 && kindAt(r, i - 1) === "tunnel");
    // ends: a way ending at a junction with a tunnel at that end (the junction point is under the hill)
    for (const r of net.roads) for (const [i, j] of [[1, r.from], [r.points.length - 2, r.to]] as const)
    {
        const e = i === 1 ? 0 : r.points.length - 1;
        if (!inTube(r, i) && !inTube(r, e)) continue;
        const p = r.points[e], arms = net.roads.filter(o => o.from === j || o.to === j);
        // a chain going on through (2 arms) is no fork
        if (arms.length < 3 && arms.every(o => o.chain !== undefined && o.chain === r.chain)) continue;
        if (ground(p[0], p[2]) - p[1] > 4) add("tunnel fork underground", ground(p[0], p[2]) - p[1], `${at(p)} ${r.class} junction ${j}`);
    }
    const seen = new Set<string>();
    for (const r of net.roads) r.points.forEach((p, ip) => {
        if (!inTube(r, ip)) return;
        for (const o of net.roads)
        {
            if (o === r || (o.chain !== undefined && o.chain === r.chain)) continue;
            const k = [Math.min(r.id, o.id), Math.max(r.id, o.id)].join();
            if (seen.has(k)) continue;
            const i = o.points.findIndex(q => Math.hypot(q[0] - p[0], q[2] - p[2]) < (r.width + o.width) / 2 && Math.abs(q[1] - p[1]) < 10);
            if (i < 0 || [r.from, r.to].some(j => j === o.from || j === o.to)) continue;
            seen.add(k);
            add("tunnel crossing underground", 10 - Math.abs(o.points[i][1] - p[1]), `${at(p)} ${r.class}/${o.class} ${kindAt(o, i)} dy ${(o.points[i][1] - p[1]).toFixed(1)}`);
        }
    });
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

if (process.env.NEARS) { const [x, z] = process.env.NEARS.split(',').map(Number); hydro.network.streams.forEach((st, si) => st.points.forEach((p, q) => { if (Math.hypot(p[0] - x, p[2] - z) < 15) console.log(`stream ${si} pt ${q}/${st.points.length} (${p[0].toFixed(1)} ${p[2].toFixed(1)}) y ${p[1].toFixed(1)} w ${p[3].toFixed(1)} ground ${ground(p[0], p[2]).toFixed(1)}`); })); }
if (process.env.RIM) { const G = (roads.roads as any).grid; let c = 0; for (const v of G.rim) c += v; console.log('rim nodes', c); const r = net.roads[+process.env.RIM]; console.log(r.points.map(p => { const i = Math.round((p[0] / size + .5) * (G.m - 1)), j = Math.round((p[2] / size + .5) * (G.m - 1)), q = j * G.m + i; return `${p[0].toFixed(0)},${p[2].toFixed(0)} rim ${G.rim[q]} h ${G.height[q].toFixed(1)} w ${G.water[q]}`; }).join('\n')); }
if (process.env.FALLS) for (const st of hydro.network.streams) for (const f of st.falls) { const a = st.points[Math.max(0, f - 1)], b = st.points[Math.min(st.points.length - 1, f + 3)]; if (a[1] - b[1] > 6) console.log(`fall (${a[0].toFixed(0)} ${a[2].toFixed(0)}) drop ${(a[1] - b[1]).toFixed(1)} dir ${(Math.atan2(b[0] - a[0], b[2] - a[2]) * 180 / Math.PI).toFixed(0)} w ${a[3].toFixed(1)}`); }
// water: ground must fit the water exactly (hydrology seal), rivers continuous and never rising
{
    const W = d.water, S = d.surface, H = d.height, holes = (d as any).holes as Uint8Array | undefined;
    const xz = (k: number) => `(${((k % n) / (n - 1) * size - size / 2).toFixed(0)} ${(((k / n) | 0) / (n - 1) * size - size / 2).toFixed(0)})`;
    const nb = (k: number) => { const i = k % n, j = (k / n) | 0, o: number[] = []; for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) if ((a !== i || b !== j) && a >= 0 && b >= 0 && a < n && b < n) o.push(b * n + a); return o; };
    const tally = (what: string, test: (k: number) => number) => { let c = 0, worst = 0, where = ""; for (let k = 0; k < n * n; k++) { const v = test(k); if (v > 0) { c++; if (v > worst) { worst = v; where = xz(k); } } } if (c) add(what, worst, `${where} ${c} nodes, worst ${worst.toFixed(2)} m`); return c; };
    const a = tally("water: ground over river", k => W[k] === 3 && !holes?.[k] ? H[k] - (S[k] - .05) : 0);
    const b = tally("water: lake / sea edge in the air", k => { if (W[k] || holes?.[k]) return 0; let l = -Infinity; for (const m of nb(k)) if (W[m] === 1 || W[m] === 2) l = Math.max(l, S[m]); return l - H[k]; });
    let spill = 0; for (let k = 0; k < n * n; k++) if (!W[k] && !holes?.[k]) { let r = Infinity; for (const m of nb(k)) if (W[m] === 3) r = Math.min(r, S[m]); if (r < Infinity && H[k] - .1 < r) spill++; }
    const c = tally("water: river next to still water at another level", k => W[k] === 3 ? Math.max(0, ...nb(k).map(m => W[m] === 1 || W[m] === 2 ? Math.abs(S[m] - S[k]) - .01 : 0)) : 0);
    let rising = 0, broken = 0, ends = 0;
    const net2 = hydro.network.streams;
    for (const st of net2)
    {
        for (let q = 1; q < st.points.length; q++) if (st.points[q][1] > st.points[q - 1][1] + .01) rising++;
        for (const p of st.points) { const k = node(p[0], p[2]); if (!W[k]) { broken++; if (broken < 4) add("water: stream point on dry ground", 1, at(p)); } }
        const e = st.points[st.points.length - 1], ke = node(e[0], e[2]);
        if (![ke, ...nb(ke)].flatMap(m => [m, ...nb(m)]).flatMap(m => [m, ...nb(m)]).some(m => W[m] === 1 || W[m] === 2) && !net2.some(o => o !== st && o.points.some(p => Math.hypot(p[0] - e[0], p[2] - e[2]) < Math.max(p[3] / 2, 4)))) { ends++; add("water: river ends nowhere", st.points.length, `${at(e)} y ${e[1].toFixed(1)} ground ${ground(e[0], e[2]).toFixed(1)} from ${at(st.points[0])}, ${st.points.length} pts`); }
    }
    if (rising) add("water: river rising downstream", rising, `${rising} steps`);
    console.log(`water: ${net2.length} streams, ${net2.reduce((t, s) => t + s.points.length, 0)} points; ground over river ${a}, lake edge in air ${b}, river spill corners ${spill}, mouth level ${c}, rising ${rising}, dry points ${broken}, ends nowhere ${ends}; seal ${JSON.stringify(hydro.sealed)}`);
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
if (process.env.JUNCTION) { const j = net.junctions.find(j => j.id === +process.env.JUNCTION!); console.log("junction", JSON.stringify(j)); for (const r of net.roads) if (r.from === j?.id || r.to === j?.id) console.log(`  road ${r.id} ${r.class} chain ${r.chain} ${r.from}→${r.to} ends ${at(r.points[0])} ${at(r.points[r.points.length - 1])}`); }
if (process.env.BRIDGES) { const [x, z] = process.env.BRIDGES.split(",").map(Number); for (const r of net.roads) for (const sp of r.spans) if (sp.kind === "bridge") { const P = r.points.slice(sp.from, sp.to + 1); if (!P.some(p => Math.hypot(p[0] - x, p[2] - z) < 200)) continue; let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]); const h = Math.max(...P.map(p => p[1] - ground(p[0], p[2]))); console.log(`bridge road ${r.id} ${r.class} ${at(P[0])}→${at(P[P.length - 1])} L ${L.toFixed(0)} h ${h.toFixed(0)}${sp.auto ? " auto" : ""}`); } }
if (process.env.ROAD) { const r = net.roads[+process.env.ROAD], h0 = roads.roads!.heightAt; console.log(`spans ${JSON.stringify(r.spans)}`); console.log(r.points.map((p, i) => `${i} ${p[0].toFixed(0)},${p[2].toFixed(0)} y ${p[1].toFixed(1)} g ${ground(p[0], p[2]).toFixed(1)} routed on ${h0(p[0], p[2]).toFixed(1)}`).join("\n")); }
if (process.env.CHAIN) for (const r of net.roads.filter(r => r.chain === +process.env.CHAIN!)) console.log(`road ${r.id} ${r.from}→${r.to} ${JSON.stringify(r.spans)} ` + r.points.filter((_, i) => i % 3 === 0).map(p => `${p[0].toFixed(0)},${p[2].toFixed(0)}:${(p[1] - ground(p[0], p[2])).toFixed(0)}`).join(" "));
if (process.env.WGRID) { const [x, z] = process.env.WGRID.split(",").map(Number), c = size / (n - 1); for (let b = -5; b <= 5; b++) console.log(Array.from({ length: 11 }, (_, a) => { const k = node(x + (a - 5) * c, z + b * c); return `${d.water[k]}:${d.height[k].toFixed(1)}/${d.water[k] ? d.surface[k].toFixed(1) : "    "}`.padEnd(15); }).join("")); }
if (process.env.WATER) { const [x, z] = process.env.WATER.split(",").map(Number); for (let b = -3; b <= 3; b++) console.log(Array.from({ length: 7 }, (_, a) => { const k = node(x + (a - 3) * 6, z + b * 6); return `${d.water[k]}:${d.height[k].toFixed(0)}/${d.surface[k].toFixed(0)}`; }).join("  ")); }
if (process.env.TUNNELS) for (const r of net.roads) for (const s of r.spans) if (s.kind === "tunnel") { const a = r.points[s.from], b = r.points[s.to]; console.log(`tunnel ${r.class} ${at(a)}→${at(b)} y ${a[1].toFixed(0)}/${b[1].toFixed(0)} ground ${ground(a[0], a[2]).toFixed(0)}/${ground(b[0], b[2]).toFixed(0)}`); }
// bridges at a dead end: the way ends (no other way at that end) on or right after a bridge
{
    const ends = new Map<string, number>(), k = (p: number[]) => `${Math.round(p[0])},${Math.round(p[2])}`;
    for (const r of net.roads) for (const p of [r.points[0], r.points[r.points.length - 1]]) ends.set(k(p), (ends.get(k(p)) ?? 0) + 1);
    for (const r of net.roads) for (const s of r.spans) if (s.kind === "bridge")
    {
        const n = r.points.length - 1, deadStart = s.from <= 2 && ends.get(k(r.points[0]))! < 2, deadEnd = s.to >= n - 2 && ends.get(k(r.points[n]))! < 2;
        if (deadStart || deadEnd) console.log(`  bridge to nowhere (${r.class}) road ${r.id} ${at(r.points[s.from])}→${at(r.points[s.to])}`);
    }
}

// TRIS=1: ground triangles per lod level (all chunks), as the terrain draws them
if (process.env.TRIS)
{
    const G = new Ground(null as any, d as any, .3, .8, 1.5, 64, { levels: 4, distance: 400, factor: 2.5 }) as any;
    const per = (d.n - 1) / 64, out: string[] = [];
    for (let l = 0; l < 4; l++)
    {
        let t = 0;
        for (const c of G.chunks) t += triangulate(G.errorsOf(c), 65, G.levelError(l)).triangles.length / 3;
        out.push(`L${l} ${(t / 1000).toFixed(0)}k (err ${G.levelError(l).toFixed(2)})`);
    }
    console.log(`ground triangles (${per * per} chunks): ${out.join(", ")}`);
}

// WAYS=1: vertex counts of the ways mesh by part
if (process.env.WAYS)
{
    const verts = (roads: typeof net.roads, junctions = net.junctions) => buildWays({ roads, junctions, ground }).mesh?.positions.length! / 3 || 0;
    const only = (k: string) => net.roads.map(r => ({ ...r, spans: (r.spans.length ? r.spans : [{ kind: "ground" as const, from: 0, to: r.points.length - 1 }]).filter(s => s.kind === k) })).filter(r => r.spans.length);
    console.log(`ways verts: all ${verts(net.roads)}, ground ${verts(only("ground"), [])}, bridges ${verts(only("bridge"), [])}, tunnels ${verts(only("tunnel"), [])}, rail ${verts(net.roads.filter(r => r.class === "rail"), [])}`);
}
