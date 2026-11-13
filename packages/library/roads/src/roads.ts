import type { GridResult } from "@polywar/pathfinding";
import { dry, routingGrid, sampler, toNode, toXZ, type Grid } from "./grid";
import { CLASSES, RANK, resolve } from "./presets";
import { Router } from "./route";
import { shapeRoute } from "./shape";
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
        const at = new Map<string, number>(), siteJunction = new Map<number, number>();
        const junction = (net: string, node: number, site?: number) => {
            if (site !== undefined && siteJunction.has(site)) return siteJunction.get(site)!;
            const key = net + ":" + node;
            if (site === undefined && at.has(key)) return at.get(key)!;
            const j = { id: junctions.length, node, site };
            junctions.push(j);
            if (site !== undefined) siteJunction.set(site, j.id); else at.set(key, j.id);
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
            const a = dry(grid, toNode(grid, link.a.x, link.a.z)), b = dry(grid, toNode(grid, link.b.x, link.b.z));
            if (a === b) continue;
            const r = router.route(a, b, c, rank, isRail);
            if (!r) continue;
            const own2 = owner[net], last = r.nodes.length - 1;
            // a site on an existing road: that road gets a junction there, the site's
            const siteAt = (node: number, site: number) => {
                if (siteJunction.has(site) || own2[node] < 0) return junction(net, node, site);
                const j = split(own2[node], node, net);
                if (junctions[j].site === undefined) { junctions[j].site = site; siteJunction.set(site, j); return j; }
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
        const roads: Road[] = raws.filter(r => r.nodes.length > 1).map((r, id) => {
            const c = o.classes[r.cls], s = shapeRoute(grid, r.nodes, r.tags, c, o.step, this.heightAt);
            return { id, class: r.cls, from: r.from, to: r.to, points: s.points, spans: s.spans, width: c.width, surface: c.surface };
        });
        const out: Junction[] = junctions.map(j => { const [x, z] = toXZ(grid, j.node); return { id: j.id, x, z, y: this.heightAt(x, z), site: j.site, roads: [] }; });
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
