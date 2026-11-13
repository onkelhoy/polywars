import type { GridResult } from "@polywar/pathfinding";
import { dry, routingGrid, sampler, toNode, toXZ, type Grid } from "./grid";
import { CLASSES, RANK, resolve } from "./presets";
import { Router } from "./route";
import { gradeRoute, planRoute, shapeRoute, structures } from "./shape";
import { topology, type Link } from "./topology";
import type { Ground, Junction, Network, Road, RoadClass, RoadsOptions, Site, Span } from "./types";

type Raw = { id: number; cls: RoadClass; nodes: number[]; tags: number[]; from: number; to: number };
type RawJunction = { id: number; node: number; site?: number };

export type Nearest = { road: Road; distance: number; x: number; z: number; index: number };
export type Route = { points: [number, number, number][]; spans: Span[]; cost: number; visited: number };

/**
 * A road network over a ground: `build(sites)` links sites (topology per class), routes every link on a coarse
 * grid (later links reuse earlier roads, so trunks are shared and junctions appear where they part), splits roads
 * at junctions and shapes them into smooth graded lines.
 */
export class Roads {
    readonly o: RoadsOptions;
    readonly grid: Grid;
    readonly heightAt: (x: number, z: number) => number;
    network: Network = { roads: [], junctions: [] };
    /** ms per class of the last build */
    timings: Partial<Record<RoadClass | "shape", number>> = {};
    private router: Router;
    private buckets = new Map<number, [number, number][]>();
    private bucket = 64;

    constructor(readonly ground: Ground, options: Partial<RoadsOptions> = {}) {
        this.o = resolve(options);
        this.grid = routingGrid(ground, this.o.cell);
        this.heightAt = sampler(ground);
        this.router = new Router(this.grid, this.o.greed);
    }

    /** `links`: which sites to join and how (default: `topology(sites)`); scenario views pass their own */
    build(sites: Site[], links: Link[] = topology(sites, this.o)): Network {
        const { grid, router, o } = this, m = grid.m;
        router.reset();
        const raws: Raw[] = [], junctions: RawJunction[] = [];
        const owner = { road: new Int32Array(m * m).fill(-1), rail: new Int32Array(m * m).fill(-1) };
        const at = new Map<string, number>(), siteJunction = new Map<string, number>(), stations = new Map<number, number>();
        const junction = (net: string, node: number, site?: number) => {
            if (site !== undefined && siteJunction.has(net + site)) return siteJunction.get(net + site)!;
            const key = net + ":" + node;
            if (site === undefined && at.has(key)) return at.get(key)!;
            const j = { id: junctions.length, node, site };
            junctions.push(j);
            if (site !== undefined) siteJunction.set(net + site, j.id); else at.set(key, j.id);
            return j.id;
        };
        const own = (r: Raw, net: "road" | "rail") => { for (let s = 1; s < r.nodes.length - 1; s++) if (owner[net][r.nodes[s]] < 0 || RANK[raws[owner[net][r.nodes[s]]].cls] < RANK[r.cls]) owner[net][r.nodes[s]] = r.id; };
        // junction on node `k` of road `id`: split the road there
        const split = (id: number, k: number, net: "road" | "rail") => {
            const r = raws[id], idx = r.nodes.indexOf(k);
            if (idx <= 0) return r.from;
            if (idx >= r.nodes.length - 1) return r.to;
            const j = junction(net, k);
            const b: Raw = { id: raws.length, cls: r.cls, nodes: r.nodes.slice(idx), tags: [0, ...r.tags.slice(idx + 1)], from: j, to: r.to };
            raws.push(b);
            r.nodes = r.nodes.slice(0, idx + 1); r.tags = r.tags.slice(0, idx + 1); r.to = j;
            for (let s = 1; s < b.nodes.length - 1; s++) if (owner[net][b.nodes[s]] === r.id) owner[net][b.nodes[s]] = b.id;
            return j;
        };

        let cls: RoadClass | null = null, t0 = performance.now();
        this.timings = {};
        for (const link of links)
        {
            if (link.cls !== cls) { if (cls) this.timings[cls] = performance.now() - t0; cls = link.cls; t0 = performance.now(); }
            const c = o.classes[link.cls], rank = RANK[link.cls], isRail = link.cls === "rail", net = isRail ? "rail" : "road";
            // rail: a station node off the roads near the site (rail never shares the road out of town)
            const station = (site: Site) => {
                const k0 = dry(grid, toNode(grid, site.x, site.z));
                if (!isRail) return k0;
                if (stations.has(site.id)) return stations.get(site.id)!;
                const r = Math.max(2, Math.round(Math.min(site.radius, 80) / grid.cell)), i0 = k0 % m, j0 = (k0 / m) | 0;
                let best = k0, bd = Infinity;
                for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++)
                {
                    const x = i0 + a, z = j0 + b, k = z * m + x, d = a * a + b * b;
                    if (x < 2 || z < 2 || x >= m - 2 || z >= m - 2 || d > r * r || grid.water[k] || router.nearRoad[k]) continue;
                    if (d < bd) { bd = d; best = k; }
                }
                stations.set(site.id, best);
                return best;
            };
            const a = station(link.a), b = station(link.b);
            if (a === b) continue;
            const r = router.route(a, b, c, rank, isRail);
            if (!r) continue;
            const own2 = owner[net], last = r.nodes.length - 1;
            // a site on an existing road: that road gets a junction there, the site's
            const siteAt = (node: number, site: number) => {
                if (siteJunction.has(net + site) || own2[node] < 0) return junction(net, node, site);
                const j = split(own2[node], node, net);
                if (junctions[j].site === undefined) { junctions[j].site = site; siteJunction.set(net + site, j); return j; }
                return junction(net, node, site);
            };
            const ja = siteAt(a, link.a.id), jb = siteAt(b, link.b.id);
            const existing = (s: number) => s === 0 || s === last || (own2[r.nodes[s]] >= 0 && RANK[raws[own2[r.nodes[s]]].cls] >= rank);
            const anchor = (s: number) => s === 0 ? ja : s === last ? jb : at.get(net + ":" + r.nodes[s]) ?? split(own2[r.nodes[s]], r.nodes[s], net);
            let s = 0;
            while (s < last)
            {
                // riding an existing road: nothing new (at the ends only when that road already reaches the site)
                const touches = (i: number, j: number) => { const w = own2[r.nodes[i]]; return w >= 0 && (raws[w].from === j || raws[w].to === j); };
                const end = s === 0 ? !touches(1, ja) : s + 1 === last ? !touches(s, jb) : false;
                if (existing(s) && existing(s + 1) && !r.tags[s + 1] && !end) { s++; continue; }
                // new stretch from anchor s to the next existing node
                let e = s + 1;
                while (e < last && !existing(e)) e++;
                const from = anchor(s), to = anchor(e);
                if (from !== to)
                {
                    const raw: Raw = { id: raws.length, cls: link.cls, nodes: r.nodes.slice(s, e + 1), tags: [0, ...r.tags.slice(s + 1, e + 1)], from, to };
                    raws.push(raw); own(raw, net);
                }
                s = e;
            }
            router.mark(r.nodes, rank, isRail, r.tags);
        }
        if (cls) this.timings[cls] = performance.now() - t0;

        t0 = performance.now();
        const { roads, out } = this.shape(raws.filter(r => r.nodes.length > 1), junctions);
        levelCrossings(roads, o.step);
        for (const r of roads)
        {
            const p = r.points, k = Math.min(3, p.length - 1);
            out[r.from].roads.push({ road: r.id, class: r.class, angle: Math.atan2(p[k][2] - p[0][2], p[k][0] - p[0][0]) });
            const e = p.length - 1;
            out[r.to].roads.push({ road: r.id, class: r.class, angle: Math.atan2(p[e - k][2] - p[e][2], p[e - k][0] - p[e][0]) });
        }
        this.timings.shape = performance.now() - t0;
        this.network = { roads, junctions: out.filter(j => j.roads.length || j.site !== undefined) };
        this.index();
        return this.network;
    }

    /**
     * Raw routes → shaped roads. Roads that go on through a junction (same class, the straightest pair) are shaped as
     * one curve (a chain) and cut at the junctions after; bigger chains first: they set each junction's spot and
     * height, later ones bend onto it and are graded to it (every end at a junction meets at one point, one height).
     */
    private shape(raws: Raw[], junctions: RawJunction[]): { roads: Road[]; out: Junction[] } {
        const { grid, o } = this;
        const arms = new Map<number, { raw: number; end: 0 | 1; angle: number }[]>();
        const dir = (r: Raw, end: 0 | 1) => {
            const n = r.nodes, a = end ? n[n.length - 1] : n[0], b = end ? n[Math.max(0, n.length - 4)] : n[Math.min(3, n.length - 1)];
            const [ax, az] = toXZ(grid, a), [bx, bz] = toXZ(grid, b);
            return Math.atan2(bz - az, bx - ax);
        };
        raws.forEach((r, i) => {
            if (r.from === r.to) return;
            for (const end of [0, 1] as const) { const j = end ? r.to : r.from; (arms.get(j) ?? arms.set(j, []).get(j)!).push({ raw: i, end, angle: dir(r, end) }); }
        });
        // pair the straightest arms of one class at each junction
        const partner = new Map<string, { raw: number; end: 0 | 1 }>();
        for (const list of arms.values())
        {
            const pairs: [number, number, number][] = [];
            for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++)
            {
                if (raws[list[a].raw].cls !== raws[list[b].raw].cls || list[a].raw === list[b].raw) continue;
                let d = Math.abs(list[a].angle - list[b].angle); d = Math.min(d, Math.PI * 2 - d);
                if (d > Math.PI * .6) pairs.push([d, a, b]);
            }
            pairs.sort((x, y) => y[0] - x[0]);
            const used = new Set<number>();
            for (const [, a, b] of pairs)
            {
                if (used.has(a) || used.has(b)) continue;
                used.add(a); used.add(b);
                partner.set(list[a].raw + ":" + list[a].end, list[b]);
                partner.set(list[b].raw + ":" + list[b].end, list[a]);
            }
        }
        // chains: [raw, reversed][]
        const seen = new Uint8Array(raws.length), chains: [number, boolean][][] = [];
        for (let r0 = 0; r0 < raws.length; r0++)
        {
            if (seen[r0]) continue;
            let raw = r0, rev = false;
            const walked = new Set([r0]);
            for (; ;)
            {
                const p = partner.get(raw + ":" + (rev ? 1 : 0));
                if (!p || seen[p.raw] || walked.has(p.raw)) break;
                raw = p.raw; rev = p.end === 0; walked.add(raw);
            }
            const chain: [number, boolean][] = [[raw, rev]];
            seen[raw] = 1;
            for (; ;)
            {
                const p = partner.get(raw + ":" + (rev ? 0 : 1));
                if (!p || seen[p.raw]) break;
                raw = p.raw; rev = p.end === 1; seen[raw] = 1;
                chain.push([raw, rev]);
            }
            chains.push(chain);
        }
        chains.sort((a, b) => Math.max(...b.map(([r]) => RANK[raws[r].cls])) - Math.max(...a.map(([r]) => RANK[raws[r].cls])) || b.length - a.length);

        const spot = new Map<number, [number, number, number]>(), roads: Road[] = [];
        chains.forEach((chain, chainId) => {
            const cls = raws[chain[0][0]].cls, c = o.classes[cls];
            const nodes: number[] = [], tags: number[] = [], joints: number[] = [], ids: number[] = [];
            for (const [r, rev] of chain)
            {
                const raw = raws[r], n = rev ? raw.nodes.slice().reverse() : raw.nodes, t = rev ? raw.nodes.map((_, s) => s ? raw.tags[raw.nodes.length - s] : 0) : raw.tags;
                const start = nodes.length ? 1 : 0;
                if (nodes.length) joints.push(nodes.length - 1);
                for (let s = start; s < n.length; s++) { nodes.push(n[s]); tags.push(s ? t[s] : 0); }
                ids.push(rev ? raw.to : raw.from);
            }
            const last = chain[chain.length - 1], end = last[1] ? raws[last[0]].from : raws[last[0]].to;
            ids.push(end);
            const head = spot.get(ids[0]), tail = spot.get(end);
            const plan = planRoute(grid, nodes, tags, c, o.step, this.heightAt, [head ? [head[0], head[2]] : null, tail ? [tail[0], tail[2]] : null]);
            const P = plan.points, n = P.length;
            // where each inner junction falls on the curve
            const idx = [0];
            for (const jn of joints)
            {
                const [jx, jz] = toXZ(grid, nodes[jn]);
                let best = -1, bd = Infinity;
                for (let i = idx[idx.length - 1] + 1; i < n - 1; i++) { const d = Math.hypot(P[i][0] - jx, P[i][2] - jz); if (d < bd) { bd = d; best = i; } }
                idx.push(best < 0 ? Math.min(n - 1, idx[idx.length - 1] + 1) : best);
            }
            idx.push(n - 1);
            const rigid = (i: number) => plan.spans.some(s => s.kind !== "ground" && i > s.from && i < s.to);
            const pins = new Map<number, number>();
            idx.forEach((i, q) => {
                const at = spot.get(ids[q]);
                if (!at) return;
                pins.set(i, at[1]);
                if (q === 0 || q === idx.length - 1) return;
                // bend onto a junction set by a bigger road: shift the points around it, fading out over ~30 m
                const dx = at[0] - P[i][0], dz = at[2] - P[i][2], W = Math.max(3, Math.round(30 / o.step));
                for (let k = Math.max(1, i - W); k <= Math.min(n - 2, i + W); k++)
                {
                    if (rigid(k)) continue;
                    const f = 1 - Math.abs(k - i) / (W + 1), w = f * f * (3 - 2 * f);
                    P[k][0] += dx * w; P[k][2] += dz * w; P[k][1] = this.heightAt(P[k][0], P[k][2]);
                }
            });
            gradeRoute(plan, c, o.step, pins);
            structures(plan, this.heightAt);
            idx.forEach((i, q) => { if (!spot.has(ids[q])) spot.set(ids[q], [P[i][0], P[i][1], P[i][2]]); });
            chain.forEach(([r, rev], q) => {
                const a = idx[q], b = Math.max(idx[q + 1], a + 1), raw = raws[r];
                const points = P.slice(a, Math.min(n, b + 1)).map(p => [p[0], p[1], p[2]] as [number, number, number]);
                if (points.length < 2) points.push([...points[0]]);
                const spans: Span[] = plan.spans.filter(s => s.to > a && s.from < b).map(s => ({ kind: s.kind, from: Math.max(s.from, a) - a, to: Math.min(s.to, b) - a })).filter(s => s.to > s.from);
                roads.push({ id: roads.length, class: raw.cls, from: rev ? raw.to : raw.from, to: rev ? raw.from : raw.to, points, spans, width: c.width, surface: c.surface, chain: chainId });
            });
        });
        const out: Junction[] = junctions.map(j => {
            const s = spot.get(j.id), [x, z] = s ? [s[0], s[2]] : toXZ(grid, j.node);
            return { id: j.id, x, z, y: s ? s[1] : this.heightAt(x, z), site: j.site, roads: [] };
        });
        return { roads, out };
    }

    /** the junction at a site: every road coming in, with its angle */
    at(site: number): Junction | undefined { return this.network.junctions.find(j => j.site === site); }

    /** A → B for one class, k different routes (best first), not touching the network */
    route(ax: number, az: number, bx: number, bz: number, cls: RoadClass, k = 1): Route[] {
        const { grid, router, o } = this, a = dry(grid, toNode(grid, ax, az)), b = dry(grid, toNode(grid, bx, bz)), c = o.classes[cls];
        const found: GridResult[] = k > 1 ? router.alternatives(a, b, c, RANK[cls], k, o.penalty, o.overlap, cls === "rail") : [router.route(a, b, c, RANK[cls], cls === "rail")].filter(r => r) as GridResult[];
        return found.map(r => ({ ...shapeRoute(grid, r.nodes, r.tags, c, o.step, this.heightAt), cost: r.cost, visited: r.visited }));
    }

    private index() {
        this.buckets.clear();
        const B = this.bucket, key = (i: number, j: number) => (j + 4096) * 8192 + i + 4096;
        for (const r of this.network.roads) for (let s = 0; s < r.points.length - 1; s++)
        {
            const [ax, , az] = r.points[s], [bx, , bz] = r.points[s + 1];
            const i0 = Math.floor(Math.min(ax, bx) / B), i1 = Math.floor(Math.max(ax, bx) / B), j0 = Math.floor(Math.min(az, bz) / B), j1 = Math.floor(Math.max(az, bz) / B);
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
            {
                const k = key(i, j);
                if (!this.buckets.has(k)) this.buckets.set(k, []);
                this.buckets.get(k)!.push([r.id, s]);
            }
        }
    }

    /** nearest road to (x, z) within `max` metres (default 2 buckets) */
    nearest(x: number, z: number, max = this.bucket * 2): Nearest | null {
        const B = this.bucket, ci = Math.floor(x / B), cj = Math.floor(z / B), r = Math.ceil(max / B);
        let best: Nearest | null = null;
        for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++)
            for (const [id, s] of this.buckets.get((j + 4096) * 8192 + i + 4096) ?? [])
            {
                const road = this.network.roads[id], [ax, , az] = road.points[s], [bx, , bz] = road.points[s + 1];
                const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
                const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
                if (d <= max && (!best || d < best.distance)) best = { road, distance: d, x: px, z: pz, index: s + t };
            }
        return best;
    }

    /**
     * Road cover on an `m`² grid over the map: 1 on the road (half width), falling to 0 over the shoulder.
     * `classes` limits which roads count.
     */
    mask(m: number, classes: RoadClass[] = CLASSES): Float32Array {
        const out = new Float32Array(m * m), size = this.ground.size, cell = size / (m - 1);
        for (const r of this.network.roads)
        {
            if (!classes.includes(r.class)) continue;
            const c = this.o.classes[r.class], inner = c.width / 2, outer = inner + c.shoulder;
            for (let s = 0; s < r.points.length - 1; s++)
            {
                const [ax, , az] = r.points[s], [bx, , bz] = r.points[s + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
                const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - outer + size / 2) / cell)), i1 = Math.min(m - 1, Math.ceil((Math.max(ax, bx) + outer + size / 2) / cell));
                const j0 = Math.max(0, Math.floor((Math.min(az, bz) - outer + size / 2) / cell)), j1 = Math.min(m - 1, Math.ceil((Math.max(az, bz) + outer + size / 2) / cell));
                for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
                {
                    const x = i * cell - size / 2, z = j * cell - size / 2, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
                    const d = Math.hypot(x - ax - dx * t, z - az - dz * t), v = d <= inner ? 1 : d >= outer ? 0 : 1 - (d - inner) / (outer - inner);
                    if (v > out[j * m + i]) out[j * m + i] = v;
                }
            }
        }
        return out;
    }

    toJSON(): Network { return this.network; }

    /** use a saved network (no routing) */
    load(network: Network) { this.network = network; this.index(); }
}

/** one call: route and shape the network for `sites` */
export function generateRoads(ground: Ground, sites: Site[], options: Partial<RoadsOptions> = {}): Roads {
    const r = new Roads(ground, options);
    r.build(sites);
    return r;
}

/**
 * Ways crossing without a junction (rail / road level crossings, ...): both meet at one height there (the smaller
 * way ramps to the bigger, rail never moves). Bridges / tunnels over or under other ways are left alone.
 */
export function levelCrossings(roads: Road[], step: number) {
    const B = 32, cells = new Map<number, [number, number][]>(), key = (x: number, z: number) => (Math.floor(x / B) + 4096) * 8192 + Math.floor(z / B) + 4096;
    for (const r of roads) for (let i = 0; i < r.points.length - 1; i++)
    {
        const a = r.points[i], b = r.points[i + 1], ks = new Set([key(a[0], a[2]), key(b[0], b[2])]);
        for (const k of ks) (cells.get(k) ?? cells.set(k, []).get(k)!).push([r.id, i]);
    }
    const kindAt = (r: Road, i: number) => r.spans.find(s => i >= s.from && i < s.to)?.kind ?? "ground";
    const weight = (r: Road) => r.class === "rail" ? 10 : RANK[r.class];
    const done = new Set<string>();
    const ramp = (r: Road, i: number, t: number, target: number) => {
        const y = r.points[i][1] + (r.points[i + 1][1] - r.points[i][1]) * t, dy = target - y, W = Math.max(3, Math.round(40 / step)), n = r.points.length;
        for (let k = Math.max(1, i - W); k <= Math.min(n - 2, i + 1 + W); k++)
        {
            if (kindAt(r, k) !== "ground") continue;
            // fades to nothing at the piece ends (they are junctions, pinned)
            const d = k <= i ? i - k : k - i - 1, f = Math.max(0, 1 - d / W) * Math.min(1, Math.min(k, n - 1 - k) / 3);
            r.points[k][1] += dy * f * f * (3 - 2 * f);
        }
    };
    for (const list of cells.values()) for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++)
    {
        const [ra, ia] = list[p], [rb, ib] = list[q];
        if (ra === rb) continue;
        const A = roads[ra], Bw = roads[rb];
        if (A.chain !== undefined && A.chain === Bw.chain) continue;
        const a0 = A.points[ia], a1 = A.points[ia + 1], b0 = Bw.points[ib], b1 = Bw.points[ib + 1];
        const d1x = a1[0] - a0[0], d1z = a1[2] - a0[2], d2x = b1[0] - b0[0], d2z = b1[2] - b0[2], den = d1x * d2z - d1z * d2x;
        if (Math.abs(den) < 1e-9) continue;
        const s = ((b0[0] - a0[0]) * d2z - (b0[2] - a0[2]) * d2x) / den, t = ((b0[0] - a0[0]) * d1z - (b0[2] - a0[2]) * d1x) / den;
        if (s < 0 || s > 1 || t < 0 || t > 1) continue;
        const id = `${Math.min(ra, rb)}:${Math.max(ra, rb)}:${ra < rb ? ia : ib}:${ra < rb ? ib : ia}`;
        if (done.has(id)) continue;
        done.add(id);
        const ka = kindAt(A, ia), kb = kindAt(Bw, ib);
        // an auto bridge (big fill) crossing another bridge: back to the ground (an embankment), bridges never cross
        if (ka === "bridge" && kb === "bridge")
        {
            for (const [r, i] of [[A, ia], [Bw, ib]] as const) { const sp = r.spans.find(s => i >= s.from && i < s.to); if (sp?.auto) { sp.kind = "ground"; delete sp.auto; break; } }
            continue;
        }
        if (ka !== "ground" || kb !== "ground") continue;
        const ya = a0[1] + (a1[1] - a0[1]) * s, yb = b0[1] + (b1[1] - b0[1]) * t;
        // near a shared junction both are pinned already: leave them
        const nearEnd = (r: Road, i: number) => i < 3 || i > r.points.length - 5;
        if (nearEnd(A, ia) && nearEnd(Bw, ib)) continue;
        const [hi, lo] = weight(A) >= weight(Bw) ? [[A, ia, s, ya], [Bw, ib, t, yb]] as const : [[Bw, ib, t, yb], [A, ia, s, ya]] as const;
        ramp(lo[0], lo[1], lo[2], hi[3]);
    }
}
