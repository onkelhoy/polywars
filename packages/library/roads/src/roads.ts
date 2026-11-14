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
        unzip(roads, out);
        // bridges running into a hill bore through it instead (trimTunnels then sets the mouths / cuttings)
        hillBridges(roads, this.heightAt);
        // tunnels trimmed first: their open approaches are ground the merges / crossings below must see
        trimTunnels(roads, this.heightAt);
        mergeAlong(roads, out);
        // merged pieces may now leave a junction along another way to its end: unzip drops / parts them
        unzip(roads, out);
        dropClimbs(roads);
        railCrossings(roads, out);
        levelCrossings(roads, o.step);
        // last: nothing may fork / cross inside a tube (opens it into a cutting there)
        clearTunnels(roads);
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
            // a chain passing one junction twice (a loop): both visits at one height, the first one's ground
            const twice = new Map<number, [number, number, number]>();
            idx.forEach((i, q) => { if (!spot.has(ids[q]) && ids.indexOf(ids[q]) !== q) twice.set(ids[q], [P[idx[ids.indexOf(ids[q])]][0], this.heightAt(P[idx[ids.indexOf(ids[q])]][0], P[idx[ids.indexOf(ids[q])]][2]), P[idx[ids.indexOf(ids[q])]][2]]); });
            idx.forEach((i, q) => {
                const at = spot.get(ids[q]) ?? twice.get(ids[q]);
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
            structures(plan, this.heightAt, c.bridge.fill, 28, new Set(pins.keys()));
            idx.forEach((i, q) => { if (!spot.has(ids[q])) spot.set(ids[q], [P[i][0], P[i][1], P[i][2]]); });
            chain.forEach(([r, rev], q) => {
                const a = idx[q], b = Math.max(idx[q + 1], a + 1), raw = raws[r];
                const points = P.slice(a, Math.min(n, b + 1)).map(p => [p[0], p[1], p[2]] as [number, number, number]);
                if (points.length < 2) points.push([...points[0]]);
                // small ways hug the ground: a piece up a cliff (no room to climb, e.g. onto a junction set high by a
                // bigger road) is left out instead of becoming a wall or a tall bridge
                if (c.bridge.fill <= 0 && cliff(points, cls === "path" ? 1.2 : c.maxGrade * 3)) return;
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

/** steepest rise over ~20 m along `points` above `max` (rise / run) */
function cliff(points: [number, number, number][], max: number) {
    for (let i = 0, k = 0; i < points.length; i++)
    {
        while (k < points.length - 1 && Math.hypot(points[k][0] - points[i][0], points[k][2] - points[i][2]) < 20) k++;
        const l = Math.hypot(points[k][0] - points[i][0], points[k][2] - points[i][2]);
        if (l > 8 && Math.abs(points[k][1] - points[i][1]) / l > max) return true;
    }
    return false;
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
    /** surface to surface where ways cross at two levels (deck ~1 m + 6 m headroom) */
    const CLEAR = 7;
    const GRADE: Record<string, number> = { highway: .06, road: .1, lane: .15, rail: .04, path: .3 };
    const ramp = (r: Road, i: number, t: number, target: number) => {
        const y = r.points[i][1] + (r.points[i + 1][1] - r.points[i][1]) * t, dy = target - y, n = r.points.length;
        // long enough to stay in the way's grade (both sides of the crossing)
        const W = Math.max(3, Math.round(Math.max(40, Math.abs(dy) / (GRADE[r.class] ?? .1) * 1.6) / step));
        // points of bridges / tunnels (their end points too) stay: the ramp fades out 3 points before them
        const fixed = (k: number) => r.spans.some(s => s.kind !== "ground" && k >= s.from && k <= s.to);
        const near = (k: number) => { let m = 3; for (let q = 1; q < 3; q++) if (fixed(k - q) || fixed(k + q)) { m = q; break; } return m; };
        for (let k = Math.max(1, i - W); k <= Math.min(n - 2, i + 1 + W); k++)
        {
            if (fixed(k)) continue;
            // fades to nothing at the piece ends (they are junctions, pinned) and next to structures
            const d = k <= i ? i - k : k - i - 1, f = Math.max(0, 1 - d / W) * Math.min(1, Math.min(k, n - 1 - k, near(k)) / 3);
            r.points[k][1] += dy * f * f * (3 - 2 * f);
        }
    };
    const yAt = (r: Road, i: number, t: number) => r.points[i][1] + (r.points[i + 1][1] - r.points[i][1]) * t;
    // the way on top bridges the crossing: ±4 points (inside the piece, ground only) become an auto bridge span
    const overpass = (r: Road, i: number) => {
        const n = r.points.length, a = Math.max(1, i - 3), b = Math.min(n - 2, i + 4);
        if (b - a < 2) return;
        const out: Span[] = [];
        for (const sp of r.spans.length ? r.spans : [{ kind: "ground" as const, from: 0, to: n - 1 }])
        {
            if (sp.kind !== "ground" || sp.to <= a || sp.from >= b) { out.push(sp); continue; }
            if (sp.from < a) out.push({ ...sp, to: a });
            out.push({ kind: "bridge", from: Math.max(a, sp.from), to: Math.min(b, sp.to), auto: true });
            if (sp.to > b) out.push({ ...sp, from: b });
        }
        r.spans = out.filter(s => s.to > s.from);
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
        const ya = a0[1] + (a1[1] - a0[1]) * s, yb = b0[1] + (b1[1] - b0[1]) * t;
        // a deck over a way on the ground with too little room under it: the ground way dips to the clearance
        if ((ka === "bridge" && kb === "ground" && ya > yb && ya - yb < CLEAR) || (kb === "bridge" && ka === "ground" && yb > ya && yb - ya < CLEAR))
        {
            const [r, i, f, y] = ka === "ground" ? [A, ia, s, yb] : [Bw, ib, t, ya];
            // only when it stays a road (no room to dip, e.g. a junction close by: left as it is)
            const before = r.points.map(p => p[1]);
            ramp(r, i, f, y - CLEAR);
            const limit = (GRADE[r.class] ?? .1) * 2;
            for (let k = 1; k < r.points.length; k++)
            {
                const p = r.points[k - 1], q = r.points[k], l = Math.hypot(q[0] - p[0], q[2] - p[2]) || 1;
                if (Math.abs(q[1] - p[1]) / l > limit && Math.abs(before[k] - before[k - 1]) / l <= limit) { r.points.forEach((p, k) => p[1] = before[k]); break; }
            }
            continue;
        }
        if (ka !== "ground" || kb !== "ground") continue;
        // near a shared junction both are pinned already: leave them
        const nearEnd = (r: Road, i: number) => i < 3 || i > r.points.length - 5;
        if (nearEnd(A, ia) && nearEnd(Bw, ib)) continue;
        const [hi, lo] = weight(A) >= weight(Bw) ? [[A, ia, s, ya], [Bw, ib, t, yb]] as const : [[Bw, ib, t, yb], [A, ia, s, ya]] as const;
        const dy = lo[3] - hi[3];
        // close in height: one level crossing (the smaller way ramps gently)
        if (Math.abs(dy) <= 2.5) { ramp(lo[0], lo[1], lo[2], hi[3]); continue; }
        // far apart: grade separated, the smaller way eased to a clearance under / over the bigger one, the upper one bridges
        if (Math.abs(dy) < CLEAR)
        {
            // the one held by a bridge / tunnel end close by moves the other instead
            const held = (r: Road, i: number) => r.spans.some(sp => sp.kind !== "ground" && sp.to >= i - 8 && sp.from <= i + 9);
            if (held(lo[0], lo[1]) && !held(hi[0], hi[1])) { ramp(hi[0], hi[1], hi[2], lo[3] - Math.sign(dy) * CLEAR); }
            else ramp(lo[0], lo[1], lo[2], hi[3] + Math.sign(dy) * CLEAR);
            // not enough (held by a structure / junction near by): the other one moves the rest
            const got = yAt(lo[0], lo[1], lo[2]) - yAt(hi[0], hi[1], hi[2]);
            if (Math.abs(got) < CLEAR - .3) ramp(hi[0], hi[1], hi[2], yAt(lo[0], lo[1], lo[2]) - Math.sign(dy) * CLEAR);
        }
        const [up, ui] = dy > 0 ? [lo[0], lo[1]] : [hi[0], hi[1]];
        overpass(up, ui);
    }
}

/**
 * Two ways leaving a junction the same way (one runs along the other before it parts): the smaller one starts where
 * it really leaves the bigger one's surface, the bigger one gets a junction there (split, same chain so it still
 * draws as one sweep). One running along all the way is dropped. In place; road ids are renumbered.
 */
export function unzip(roads: Road[], out: Junction[], maxAngle = .6) {
    const seg = (p: number[], a: number[], b: number[]) => {
        const dx = b[0] - a[0], dz = b[2] - a[2], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / (dx * dx + dz * dz || 1)));
        return { d: Math.hypot(p[0] - a[0] - dx * t, p[2] - a[2] - dz * t), t };
    };
    for (let guard = 0; guard < 200; guard++)
    {
        let changed = false;
        const ends = new Map<number, { r: Road; start: boolean }[]>();
        for (const r of roads) for (const [j, start] of [[r.from, true], [r.to, false]] as const) (ends.get(j) ?? ends.set(j, []).get(j)!).push({ r, start });
        const outward = (e: { r: Road; start: boolean }) => e.start ? e.r.points : e.r.points.slice().reverse();
        const heading = (pts: number[][]) => { const k = Math.min(3, pts.length - 1); return Math.atan2(pts[k][2] - pts[0][2], pts[k][0] - pts[0][0]); };
        for (const [, list] of ends)
        {
            for (let x = 0; x < list.length && !changed; x++) for (let y = x + 1; y < list.length && !changed; y++)
            {
                // rail pairs with rail, roads with roads
                if (list[x].r === list[y].r || (list[x].r.class === "rail") !== (list[y].r.class === "rail")) continue;
                let d = Math.abs(heading(outward(list[x])) - heading(outward(list[y]))); d = Math.min(d, Math.PI * 2 - d);
                if (d > maxAngle) continue;
                // B: the smaller (then shorter) one leaves A's chain
                const [A, B] = RANK[list[x].r.class] > RANK[list[y].r.class] || (RANK[list[x].r.class] === RANK[list[y].r.class] && list[x].r.points.length >= list[y].r.points.length) ? [list[x], list[y]] : [list[y], list[x]];
                if (B.r.spans.some(sp => sp.kind === "tunnel")) continue;
                const along = roads.filter(r => r !== B.r && (r === A.r || (A.r.chain !== undefined && r.chain === A.r.chain)));
                const near = (p: number[]) => {
                    let best = { d: Infinity, r: A.r, i: 0, t: 0 };
                    // only at its level: a way passing over / under is not one to run along
                    for (const r of along) for (let i = 0; i < r.points.length - 1; i++)
                    {
                        const a = r.points[i], b = r.points[i + 1], q = seg(p, a, b);
                        if (q.d < best.d && Math.abs(a[1] + (b[1] - a[1]) * q.t - p[1]) < 3) best = { d: q.d, r, i, t: q.t };
                    }
                    return best;
                };
                const P = outward(B), on = A.r.width / 2, clear = (A.r.width + B.r.width) / 2 + .5;
                let k = 0;
                while (k + 1 < P.length && near(P[k + 1]).d < on) k++;
                let free = k + 1;
                while (free < P.length && near(P[free]).d < clear) free++;
                if (free >= P.length)
                {
                    // along the bigger way all the way: drop it. Ways meeting it at its far end would hang there (beside
                    // / under the bigger way): that junction moves onto the bigger way, they join it there
                    const far = B.start ? B.r.to : B.r.from;
                    const others = roads.filter(r => r !== B.r && (r.from === far || r.to === far));
                    if (others.length && !along.some(r => r.from === far || r.to === far))
                    {
                        const J = out[far], q = near([J.x, J.y, J.z]), R = q.r, m = q.t < .5 ? q.i : q.i + 1;
                        const jid = splitAt(roads, out, R, m), K = out[jid];
                        for (const o of others)
                        {
                            const start = o.from === far, pts = o.points, n = pts.length;
                            if (start) o.from = jid; else o.to = jid;
                            const e = start ? 0 : n - 1, dy = K.y - pts[e][1];
                            pts[e] = [K.x, K.y, K.z];
                            // ease the next points onto the junction height (no step), long enough for the class grade
                            const W = Math.min(n - 1, Math.max(6, Math.ceil(Math.abs(dy) / (({ highway: .05, road: .08 } as Record<string, number>)[o.class] ?? .12) / 4) + 2));
                            for (let k = 1; k < W; k++) { const f = 1 - k / W, w = f * f * (3 - 2 * f); pts[start ? k : n - 1 - k][1] += dy * w; }
                        }
                    }
                    roads.splice(roads.indexOf(B.r), 1);
                    changed = true; continue;
                }
                // B parts at a narrow angle right away: its strip still lies over A's for a while (a messy wedge);
                // it leaves A from the last point still over A's surface (one road until there, then a clean fork)
                if (k < 2)
                {
                    if (free - k < 3) continue;
                    k = free - 1;
                    while (k > 2 && near(P[k]).d > on + B.r.width / 2) k--;
                    if (k < 2) continue;
                }
                // split A's chain at the point nearest P[k]
                const q = near(P[k]), R = q.r, m = q.t < .5 ? q.i : q.i + 1;
                let jid: number;
                if (m <= 0) jid = R.from;
                else if (m >= R.points.length - 1) jid = R.to;
                else
                {
                    const pt = R.points[m];
                    jid = out.length;
                    out.push({ id: jid, x: pt[0], z: pt[2], y: pt[1], roads: [] });
                    const tail: Road = {
                        ...R, from: jid, points: R.points.slice(m),
                        spans: R.spans.filter(sp => sp.to > m).map(sp => ({ ...sp, from: Math.max(0, sp.from - m), to: sp.to - m })),
                    };
                    R.points = R.points.slice(0, m + 1);
                    R.spans = R.spans.filter(sp => sp.from < m).map(sp => ({ ...sp, to: Math.min(sp.to, m) }));
                    R.to = jid;
                    roads.splice(roads.indexOf(R) + 1, 0, tail);
                }
                const J = out[jid], head: [number, number, number] = [J.x, J.y, J.z];
                const rest = P.slice(k + 1).map(p => [p[0], p[1], p[2]] as [number, number, number]);
                // ease B's height onto the junction over the first few points
                for (let i = 0; i < Math.min(3, rest.length - 1); i++) { const w = 1 - (i + 1) / 4; rest[i][1] += (head[1] - rest[i][1]) * w; }
                const pts = [head, ...rest], n = pts.length - 1;
                // segment kinds (outward order) kept: new segment 0 = old segment k, j = old k + j
                const N = B.r.points.length, kindOf = (seg: number) => {
                    const i = B.start ? seg : N - 2 - seg;
                    return B.r.spans.find(sp => i >= sp.from && i < sp.to)?.kind ?? "ground";
                };
                const kinds = Array.from({ length: n }, (_, j) => kindOf(k + j));
                if (!B.start) kinds.reverse();
                const spans: Span[] = [];
                kinds.forEach((kd, i) => { const l = spans[spans.length - 1]; if (l && l.kind === kd) l.to = i + 1; else spans.push({ kind: kd, from: i, to: i + 1 }); });
                B.r.points = B.start ? pts : pts.reverse();
                if (B.start) B.r.from = jid; else B.r.to = jid;
                B.r.spans = spans;
                changed = true;
            }
            if (changed) break;
        }
        if (!changed) break;
    }
    // re-attached ways squeezed to nothing (both ends on one junction, a few metres): gone
    for (let k = roads.length - 1; k >= 0; k--)
    {
        const P = roads[k].points;
        if (roads[k].from === roads[k].to && Math.hypot(P[P.length - 1][0] - P[0][0], P[P.length - 1][2] - P[0][2]) < 1 && P.length < 6) roads.splice(k, 1);
    }
    roads.forEach((r, i) => r.id = i);
}

/**
 * Short pieces far steeper than their class can climb (a stub left by the merges, from under a deck up onto it) with
 * other ways at both ends (nothing cut off), and twins (the same two junctions, side by side): dropped. In place; road
 * ids renumbered.
 */
export function dropClimbs(roads: Road[]) {
    const GRADE: Record<string, number> = { highway: .06, road: .1, lane: .15, rail: .025, path: .35 };
    for (let k = roads.length - 1; k >= 0; k--)
    {
        const r = roads[k], P = r.points, n = P.length;
        if (n > 16 || r.spans.some(s => s.kind !== "ground")) continue;
        let run = 0;
        for (let i = 1; i < n; i++) run += Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]);
        if (Math.abs(P[n - 1][1] - P[0][1]) / (run || 1) < (GRADE[r.class] ?? .1) * 3) continue;
        const linked = (j: number) => roads.some(o => o !== r && (o.from === j || o.to === j));
        if (linked(r.from) && linked(r.to)) roads.splice(k, 1);
    }
    // twins: two ways (not rail) between the same two junctions running close (≤ 15 m): the smaller goes
    for (let k = roads.length - 1; k >= 0; k--)
    {
        const B = roads[k];
        if (B.class === "rail" || B.from === B.to) continue;
        const A = roads.find(A => A !== B && A.class !== "rail" && ((A.from === B.from && A.to === B.to) || (A.from === B.to && A.to === B.from))
            && (RANK[A.class] > RANK[B.class] || (RANK[A.class] === RANK[B.class] && A.points.length >= B.points.length)));
        if (A && B.points.every(p => A.points.some(q => Math.hypot(p[0] - q[0], p[2] - q[2]) < 15))) roads.splice(k, 1);
    }
    roads.forEach((r, i) => r.id = i);
}

/** junction on `R` at point `m` (an end's junction, or a new one splitting `R`; the tail goes right after it) */
function splitAt(roads: Road[], out: Junction[], R: Road, m: number) {
    if (m <= 0) return R.from;
    if (m >= R.points.length - 1) return R.to;
    const pt = R.points[m], jid = out.length;
    out.push({ id: jid, x: pt[0], z: pt[2], y: pt[1], roads: [] });
    const tail: Road = { ...R, from: jid, points: R.points.slice(m), spans: sliceSpans(R, m, R.points.length - 1) };
    R.spans = sliceSpans(R, 0, m);
    R.points = R.points.slice(0, m + 1);
    R.to = jid;
    roads.splice(roads.indexOf(R) + 1, 0, tail);
    return jid;
}

/**
 * Rail crossing rail at its level (on the ground, away from the ends): a real junction (a diamond), both tracks split
 * at the one crossing point, at one height. Crossings far apart in height are left to `levelCrossings` (overpass).
 */
export function railCrossings(roads: Road[], out: Junction[]) {
    const kindAt = (r: Road, i: number) => r.spans.find(sp => i >= sp.from && i < sp.to)?.kind ?? "ground";
    /** insert `p` after point `i` (spans shifted), returns its index */
    const insert = (r: Road, i: number, p: [number, number, number]) => {
        r.points.splice(i + 1, 0, p);
        for (const sp of r.spans) { if (sp.from > i) sp.from++; if (sp.to > i) sp.to++; }
        return i + 1;
    };
    // twins: a track whose both ends sit on another rail chain and that runs beside it all along (an eye, two tracks
    // between the same junctions) is dropped: one track; two pieces joining the same two junctions always. Only when the other runs on between both ends (stays connected).
    for (let guard = 0; guard < 50; guard++)
    {
        const chains = new Map<number, Road[]>();
        for (const r of roads) if (r.class === "rail" && r.chain !== undefined) (chains.get(r.chain) ?? chains.set(r.chain, []).get(r.chain)!).push(r);
        // a continuous run of chain `c`'s roads from junction `x` to `y` (either way), or null
        const between = (c: number, x: number, y: number) => {
            const list = chains.get(c)!;
            for (const [u, v] of [[x, y], [y, x]])
            {
                const i = list.findIndex(r => r.from === u);
                if (i < 0) continue;
                for (let k = i; k < list.length && (k === i || list[k - 1].to === list[k].from); k++) if (list[k].to === v) return list.slice(i, k + 1);
            }
            return null;
        };
        // ends where B's own chain goes on (the twin dropped is the one its chain doesn't need: no kinks)
        const goesOn = (B: Road) => chains.get(B.chain!)!.filter(r => r !== B && (r.to === B.from || r.from === B.to)).length;
        const twin = roads.filter(B => {
            if (B.class !== "rail" || B.chain === undefined || B.from === B.to) return false;
            for (const c of chains.keys())
            {
                if (c === B.chain) continue;
                const path = between(c, B.from, B.to);
                if (!path) continue;
                // the same two junctions by one road each: one is enough, however far apart they run
                if (path.length === 1) return true;
                const pts = path.flatMap(r => r.points);
                if (B.points.every(p => pts.some(q => Math.hypot(p[0] - q[0], p[2] - q[2]) < 25))) return true;
            }
            return false;
        }).sort((a, b) => goesOn(a) - goesOn(b))[0];
        if (!twin) break;
        roads.splice(roads.indexOf(twin), 1);
    }
    for (let guard = 0; guard < 100; guard++)
    {
        let hit: [Road, number, number, Road, number, number] | null = null;
        const rails = roads.filter(r => r.class === "rail");
        search: for (let p = 0; p < rails.length; p++) for (let q = p + 1; q < rails.length; q++)
        {
            const A = rails[p], B = rails[q];
            if (A.from === B.from || A.from === B.to || A.to === B.from || A.to === B.to) continue;
            for (let ia = 2; ia < A.points.length - 3; ia++) for (let ib = 2; ib < B.points.length - 3; ib++)
            {
                const a0 = A.points[ia], a1 = A.points[ia + 1], b0 = B.points[ib], b1 = B.points[ib + 1];
                const d1x = a1[0] - a0[0], d1z = a1[2] - a0[2], d2x = b1[0] - b0[0], d2z = b1[2] - b0[2], den = d1x * d2z - d1z * d2x;
                if (Math.abs(den) < 1e-9) continue;
                const s = ((b0[0] - a0[0]) * d2z - (b0[2] - a0[2]) * d2x) / den, t = ((b0[0] - a0[0]) * d1z - (b0[2] - a0[2]) * d1x) / den;
                if (s < 0 || s > 1 || t < 0 || t > 1) continue;
                if (kindAt(A, ia) !== "ground" || kindAt(B, ib) !== "ground") continue;
                const ya = a0[1] + (a1[1] - a0[1]) * s, yb = b0[1] + (b1[1] - b0[1]) * t;
                if (Math.abs(ya - yb) > 2.5) continue;
                hit = [A, ia, s, B, ib, t]; break search;
            }
        }
        if (!hit) break;
        const [A, ia, s, B, ib, t] = hit, a0 = A.points[ia], a1 = A.points[ia + 1], b0 = B.points[ib], b1 = B.points[ib + 1];
        const y = (a0[1] + (a1[1] - a0[1]) * s + b0[1] + (b1[1] - b0[1]) * t) / 2;
        const X: [number, number, number] = [a0[0] + (a1[0] - a0[0]) * s, y, a0[2] + (a1[2] - a0[2]) * s];
        // both tracks eased onto the crossing height over a few points each side
        const ease = (r: Road, m: number) => {
            for (let k = 1; k <= 4; k++) for (const i of [m - k, m + k])
                if (i > 0 && i < r.points.length - 1 && kindAt(r, i) === "ground") r.points[i][1] += (y - r.points[i][1]) * (1 - k / 5);
        };
        // a crossing right at a point: use it (no sliver segment)
        const near = (r: Road, i: number, f: number) => f < .15 ? i : f > .85 ? i + 1 : -1;
        let ma = near(A, ia, s), mb = near(B, ib, t);
        if (ma < 0) ma = insert(A, ia, [...X]); else A.points[ma] = [...X];
        if (mb < 0) mb = insert(B, ib, [...X]); else B.points[mb] = [...X];
        ease(A, ma); ease(B, mb);
        const j = splitAt(roads, out, A, ma);
        // B's split joins A's junction (one point, four arms)
        const tail: Road = { ...B, from: j, points: B.points.slice(mb), spans: sliceSpans(B, mb, B.points.length - 1) };
        B.spans = sliceSpans(B, 0, mb); B.points = B.points.slice(0, mb + 1); B.to = j;
        roads.splice(roads.indexOf(B) + 1, 0, tail);
    }
    roads.forEach((r, i) => r.id = i);
}

/** spans of `r` cut to points `a..b`, renumbered from 0 */
const sliceSpans = (r: Road, a: number, b: number): Span[] => r.spans.filter(sp => sp.to > a && sp.from < b).map(sp => ({ ...sp, from: Math.max(sp.from, a) - a, to: Math.min(sp.to, b) - a })).filter(sp => sp.to > sp.from);

/**
 * Ways running on top of each other away from their ends (side by side, or crossing at a shallow angle): one road
 * there. Where the smaller way's centre runs on the bigger one's surface it ends at a junction on the bigger way and
 * starts again where it leaves; the stretch in between is dropped. In place; road ids renumbered.
 */
export function mergeAlong(roads: Road[], out: Junction[]) {
    const seg = (p: number[], a: number[], b: number[]) => {
        const dx = b[0] - a[0], dz = b[2] - a[2], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / (dx * dx + dz * dz || 1)));
        return { d: Math.hypot(p[0] - a[0] - dx * t, p[2] - a[2] - dz * t), t, y: a[1] + (b[1] - a[1]) * t };
    };
    const kindAt = (r: Road, i: number) => r.spans.find(sp => i >= sp.from && i <= sp.to)?.kind ?? "ground";
    const box = (r: Road) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of r.points) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[2]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[2]); } return b; };
    const split = (R: Road, m: number) => splitAt(roads, out, R, m);
    for (let guard = 0; guard < 400; guard++)
    {
        let done = true;
        search: for (const B of roads)
        {
            if (B.points.length < 4) continue;
            for (const A of roads)
            {
                // rail merges with rail only (one track), roads with roads
                // (rail: pieces of one chain too, a line looping back along itself)
                if (A === B || (A.class === "rail") !== (B.class === "rail") || (B.class !== "rail" && A.chain !== undefined && A.chain === B.chain)) continue;
                // A: the bigger one (same class: the longer)
                if (RANK[A.class] < RANK[B.class] || (RANK[A.class] === RANK[B.class] && A.points.length < B.points.length)) continue;
                // strips overlapping (not just touching at a crossing)
                // rail: tracks closer than a ballast width side by side are one track
                const rail = A.class === "rail", on = rail ? (A.width + B.width) * .9 : (A.width + B.width) / 2 * .85, P = B.points, n = P.length;
                const ba = box(A), bb = box(B);
                if (ba[0] > bb[2] + on || bb[0] > ba[2] + on || ba[1] > bb[3] + on || bb[1] > ba[3] + on) continue;
                const near = (p: number[]) => {
                    let best = { d: Infinity, i: 0, t: 0, y: 0 };
                    for (let i = 0; i < A.points.length - 1; i++) { const q = seg(p, A.points[i], A.points[i + 1]); if (q.d < best.d) best = { ...q, i }; }
                    return best;
                };
                // first run of points on A's surface away from B's ends (ends on A are unzip's job / real junctions;
                // a single point is a plain crossing)
                const over = (i: number) => { const q = near(P[i]); return q.d < on && Math.abs(q.y - P[i][1]) < 3; };
                let a = -1, b = -1;
                for (let i = 0; i < n; )
                {
                    if (!over(i)) { i++; continue; }
                    let e = i;
                    while (e + 1 < n && over(e + 1)) e++;
                    if (i > 0 && e < n - 1 && e - i >= 2) { a = i; b = e; break; }
                    i = e + 1;
                }
                if (a < 0) continue;
                // rail: one track on a shared deck / bore too (both on a bridge / in a tunnel there)
                for (let i = a; i <= b; i++)
                {
                    const k = kindAt(B, i);
                    if (k === "ground" || (rail && kindAt(A, near(P[i]).i) === k)) continue;
                    continue search;
                }
                const qa = near(P[a]), qb = near(P[b]);
                const ma = qa.t < .5 ? qa.i : qa.i + 1, mb = qb.t < .5 ? qb.i : qb.i + 1;
                // crossing at a shallow angle (both ends nearest one point of A): one four way junction there
                let [lo, hi] = ma < mb ? [ma, mb] : [mb, ma];
                if (hi - lo <= 1) lo = hi;
                // split A at the later point first (indices before it stay valid)
                const jHi = split(A, hi), jLo = lo === hi ? jHi : split(A, lo), ja = ma < mb ? jLo : jHi, jb = ma < mb ? jHi : jLo;
                const head = out[ja], tail = out[jb];
                const first: Road = { ...B, to: ja, points: [...P.slice(0, a).map(p => [p[0], p[1], p[2]] as [number, number, number]), [head.x, head.y, head.z]], spans: sliceSpans(B, 0, a) };
                const second: Road = { ...B, from: jb, points: [[tail.x, tail.y, tail.z], ...P.slice(b + 1).map(p => [p[0], p[1], p[2]] as [number, number, number])], spans: sliceSpans(B, b, n - 1) };
                // rail: the last points slide sideways onto the track (no jog where it joins)
                if (rail) for (const [pts, end] of [[first.points, true], [second.points, false]] as const)
                    for (let k = 1; k <= Math.min(8, pts.length - 2); k++)
                    {
                        const p = pts[end ? pts.length - 1 - k : k], q = near(p), a = A.points[q.i], b = A.points[q.i + 1];
                        if (q.d > on * 1.5) break;
                        const f = 1 - k / 9, w = f * f * (3 - 2 * f);
                        p[0] += (a[0] + (b[0] - a[0]) * q.t - p[0]) * w; p[2] += (a[2] + (b[2] - a[2]) * q.t - p[2]) * w;
                    }
                // ease both onto the junction heights over a few points
                for (let k = 1; k <= Math.min(3, first.points.length - 1); k++) { const w = 1 - k / 4, q = first.points[first.points.length - 1 - k]; q[1] += (head.y - q[1]) * w; }
                for (let k = 1; k <= Math.min(3, second.points.length - 1); k++) { const w = 1 - k / 4, q = second.points[k]; q[1] += (tail.y - q[1]) * w; }
                const at = roads.indexOf(B);
                roads.splice(at, 1, ...[first, second].filter(r => r.points.length >= 2));
                done = false;
                break search;
            }
        }
        if (done) break;
    }
    roads.forEach((r, i) => r.id = i);
}

/** Bridge stretches deep inside the ground (a deck through a hill): tunnel there, the rest stays bridge. */
export function hillBridges(roads: Road[], heightAt: (x: number, z: number) => number) {
    for (const r of roads)
    {
        const P = r.points, inside = (i: number) => heightAt(P[i][0], P[i][2]) > P[i][1] + 1;
        if (!r.spans.some(s => s.kind === "bridge" && P.slice(s.from, s.to + 1).some((_, k) => inside(s.from + k)))) continue;
        const out: Span[] = [];
        for (const s of r.spans)
        {
            if (s.kind !== "bridge") { out.push(s); continue; }
            // per segment: in the hill when either end is; only runs reaching a tunnel's height under the ground (a real
            // hill: a bump under the deck stays bridged)
            const deep = new Uint8Array(s.to - s.from);
            for (let i = s.from; i < s.to;)
            {
                if (!(inside(i) || inside(i + 1))) { i++; continue; }
                let e = i;
                while (e + 1 < s.to && (inside(e + 1) || inside(e + 2))) e++;
                let most = 0;
                for (let q = i; q <= e + 1; q++) most = Math.max(most, heightAt(P[q][0], P[q][2]) - P[q][1]);
                if (most > (TUNNEL_HEIGHT[r.class] ?? 6)) deep.fill(1, i - s.from, e + 1 - s.from);
                i = e + 1;
            }
            for (let i = s.from; i < s.to; i++)
            {
                const kind = deep[i - s.from] ? "tunnel" : "bridge", l = out[out.length - 1];
                if (l && l.kind === kind && l.to === i) l.to = i + 1;
                else out.push({ kind, from: i, to: i + 1, ...(s.auto ? { auto: true } : {}) });
            }
        }
        r.spans = out;
    }
}

/** opening height per class at a tunnel mouth, metres (portals in `@polywar/bridges` match) */
export const TUNNEL_HEIGHT: Record<string, number> = { rail: 7, highway: 7, road: 7, lane: 5, path: 3 };

/**
 * Tunnels only where the hill covers them: the mouth moves in to where the ground is a portal height (+2 m) over the
 * way, the stretch before it is a cutting (ground span, carved). A tunnel nothing covers is a bridge (over lower
 * ground) or plain ground.
 */
export function trimTunnels(roads: Road[], heightAt: (x: number, z: number) => number) {
    for (const r of roads)
    {
        if (!r.spans.some(s => s.kind === "tunnel")) continue;
        const need = (TUNNEL_HEIGHT[r.class] ?? 6) + 2, P = r.points, out: Span[] = [];
        const covered = (i: number) => heightAt(P[i][0], P[i][2]) >= P[i][1] + need;
        // an uncovered stretch: ground (a cutting / low bank) where the way is near the ground, a bridge where it
        // hangs high over it (runs of 2+ points; a bridge reaches one point onto the ground each side)
        const open = (from: number, to: number) => {
            const high = (i: number) => P[i][1] > heightAt(P[i][0], P[i][2]) + 4;
            for (let i = from; i < to;)
            {
                let e = i;
                while (e + 1 <= to && high(e + 1) === high(i)) e++;
                if (high(i) && e - i >= 1) out.push({ kind: "bridge", from: Math.max(from, i - 1), to: Math.min(to, e + 1), auto: true });
                else out.push({ kind: "ground", from: i, to: Math.min(to, e + 1) });
                i = e + 1;
            }
        };
        for (const s of r.spans)
        {
            if (s.kind !== "tunnel") { out.push(s); continue; }
            let a = s.from, b = s.to;
            while (a < b && !covered(a)) a++;
            while (b > a && !covered(b)) b--;
            if (b - a < 2) { open(s.from, s.to); continue; }
            // the mouth a point outside the covered part, so the portal face has the hill right above it
            a = Math.max(s.from, a - 1); b = Math.min(s.to, b + 1);
            if (a > s.from) open(s.from, a);
            out.push({ ...s, from: a, to: b });
            if (b < s.to) open(b, s.to);
        }
        r.spans = out.filter(s => s.to > s.from).reduce<Span[]>((o, s) => { const p = o[o.length - 1]; if (p && p.kind === s.kind && p.to >= s.from) p.to = Math.max(p.to, s.to); else o.push({ ...s }); return o; }, []);
    }
}

/**
 * Nothing meets or crosses inside a tunnel: tube points near another way (plan strips touch, under 10 m apart in
 * height, not the way's own chain) open up into a cutting (ground span). A tube left shorter than 3 points goes too.
 * Ways ending in a tube (a fork under the hill) open the tube up to that end the same way.
 */
export function clearTunnels(roads: Road[]) {
    const B = 24, grid = new Map<number, [Road, number][]>(), key = (x: number, z: number) => (Math.floor(x / B) + 4096) * 8192 + Math.floor(z / B) + 4096;
    for (const r of roads) r.points.forEach((p, i) => { const k = key(p[0], p[2]); (grid.get(k) ?? grid.set(k, []).get(k)!).push([r, i]); });
    for (const r of roads)
    {
        if (!r.spans.some(s => s.kind === "tunnel")) continue;
        const P = r.points, open = new Uint8Array(P.length);
        P.forEach((p, i) => {
            for (let a = -1; a <= 1 && !open[i]; a++) for (let b = -1; b <= 1 && !open[i]; b++) for (const [o, j] of grid.get(key(p[0] + a * B, p[2] + b * B)) ?? [])
            {
                if (o === r || (o.chain !== undefined && o.chain === r.chain)) continue;
                const q = o.points[j];
                // margin: the tube walls + a little
                const reach = (r.width + o.width) / 2 + 3;
                if (Math.hypot(q[0] - p[0], q[2] - p[2]) < reach && Math.abs(q[1] - p[1]) < 10) { open[i] = 1; break; }
            }
        });
        const out: Span[] = [];
        for (const s of r.spans)
        {
            if (s.kind !== "tunnel" || !open.subarray(s.from, s.to + 1).some(v => v)) { out.push(s); continue; }
            // runs of covered points stay tunnel (3+ points), the rest is ground
            for (let i = s.from; i < s.to;)
            {
                const t = !open[i] && !open[i + 1];
                let e = i + 1;
                while (e < s.to && (!open[e] && !open[e + 1]) === t) e++;
                out.push({ ...s, kind: t && e - i >= 2 ? "tunnel" : "ground", from: i, to: e });
                i = e;
            }
        }
        r.spans = out.reduce<Span[]>((o, s) => { const p = o[o.length - 1]; if (p && p.kind === s.kind && p.to >= s.from) p.to = Math.max(p.to, s.to); else o.push({ ...s }); return o; }, []);
    }
}
