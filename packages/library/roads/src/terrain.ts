import { Roads, TUNNEL_HEIGHT } from "./roads";
import type { Ground, Network, RoadsOptions, Site, Span } from "./types";

/**
 * Lays the network into a ground grid (in place): across each road (not on bridges / in tunnels) the ground goes to
 * the bed height, full under half the width, blended back over the shoulder (cut / fill banks).
 * Returns `hard` (n², 0..1): where erosion should leave the ground alone.
 */
export function carve(roads: Roads, g: Ground): Float32Array {
    const water = g.water;
    const { n, size, height } = g, cell = size / (n - 1), weight = new Float32Array(n * n), target = new Float32Array(n * n);
    for (const r of roads.network.roads)
    {
        const c = roads.o.classes[r.class], inner = c.width / 2 + cell * .5, outer = inner + c.shoulder + cell * 1.5;
        const ground = (s: number) => r.spans.some(p => p.kind === "ground" && s >= p.from && s < p.to);
        for (let s = 0; s < r.points.length - 1; s++)
        {
            if (!ground(s)) continue;
            const [ax, ay, az] = r.points[s], [bx, by, bz] = r.points[s + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
            const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - outer + size / 2) / cell)), i1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + outer + size / 2) / cell));
            const j0 = Math.max(0, Math.floor((Math.min(az, bz) - outer + size / 2) / cell)), j1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + outer + size / 2) / cell));
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
            {
                const x = i * cell - size / 2, z = j * cell - size / 2, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
                const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
                if (d >= outer) continue;
                const f = d <= inner ? 1 : 1 - (d - inner) / (outer - inner), w = f * f * (3 - 2 * f), k = j * n + i;
                if (w > weight[k]) { weight[k] = w; target[k] = ay + (by - ay) * t; }
            }
        }
    }
    // never into lakes / rivers / sea, and never cuts a lake's rim: the nodes beside a lake (8 neighbours) stay (water keeps its bank)
    const rim = (k: number) => {
        if (!water) return false;
        const i = k % n, j = (k / n) | 0;
        for (let b = Math.max(0, j - 1); b <= Math.min(n - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(n - 1, i + 1); a++) if (water[b * n + a] === 2) return true;
        return false;
    };
    for (let k = 0; k < n * n; k++) if (weight[k] > 0 && !water?.[k] && !(target[k] < height[k] && rim(k))) height[k] += (target[k] - height[k]) * weight[k];
    return weight;
}

type Wet = { n: number; cell: number; size: number; height: Float32Array; water: Uint8Array; surface: Float32Array; seaLevel: number };

/**
 * After lakes and rivers exist: ground stretches over water become bridges (a little past the banks), held at least
 * `clearance` m over the water surface.
 */
export function bridgeWater(network: Network, g: Wet, clearance = 2, maxLength = 60) {
    const { n, size } = g, node = (x: number, z: number) => Math.round((z / size + .5) * (n - 1)) * n + Math.round((x / size + .5) * (n - 1));
    for (const r of network.roads)
    {
        const wet = r.points.map(p => { const k = node(p[0], p[2]); return k >= 0 && k < n * n && g.water[k] > 0 && g.water[k] !== 1 ? k : -1; });
        if (!wet.some(k => k >= 0)) continue;
        const spans: Span[] = [];
        for (const s of r.spans)
        {
            if (s.kind !== "ground") { spans.push(s); continue; }
            let i = s.from;
            while (i <= s.to)
            {
                if (wet[i] < 0) { let e = i; while (e + 1 <= s.to && wet[e + 1] < 0) e++; spans.push({ kind: "ground", from: i, to: e }); i = e + 1; continue; }
                let e = i; while (e + 1 <= s.to && wet[e + 1] >= 0) e++;
                // only short straight crossings become bridges (routing on the final water leaves just narrow misses)
                const len = Math.hypot(r.points[e][0] - r.points[i][0], r.points[e][2] - r.points[i][2]);
                if (len > maxLength) { spans.push({ kind: "ground", from: i, to: e }); i = e + 1; continue; }
                const a = Math.max(s.from, i - 2), b = Math.min(s.to, e + 2);
                // fold into the ground stretch before
                const last = spans[spans.length - 1];
                if (last && last.kind === "ground" && last.to >= a) last.to = a;
                let top = -Infinity;
                for (let q = i; q <= e; q++) top = Math.max(top, g.surface[wet[q]] + clearance);
                for (let q = a + 1; q < b; q++) r.points[q][1] = Math.max(r.points[q][1], top);
                spans.push({ kind: "bridge", from: a, to: b });
                i = b + 1;
                if (i <= s.to) spans.push({ kind: "ground", from: b, to: b });
            }
        }
        r.spans = spans.filter(s => s.to > s.from || s.kind === "ground").reduce<Span[]>((out, s) => {
            const p = out[out.length - 1];
            if (p && p.kind === s.kind && p.to >= s.from) p.to = Math.max(p.to, s.to); else out.push({ ...s });
            return out;
        }, []).filter(s => s.to > s.from);
    }
}

export type RoadHooks = {
    key: string;
    features: (raw: Ground & { cities: { x: number; z: number; y: number; radius: number; score: number }[] }) => void;
    fix: (data: Wet) => void;
    /** the latest built roads and the sites they connect */
    roads?: Roads;
    sites: Site[];
};

/**
 * Terrain hooks (`@polywar/terrain` `TerrainHooks`): on the raw map pick sites (`sitesOf`); after erosion, lakes and
 * rivers build the network on the final ground + water (so it never runs along a river or into a lake, crossings are
 * straight bridges), carve it, bridge leftover narrow water. `key` = these options (+ `extraKey`).
 */
export function roadHooks(sitesOf: (raw: Ground & { cities: any[] }) => Site[], options: Partial<RoadsOptions> = {}, extraKey = ""): RoadHooks {
    const h: RoadHooks = {
        key: JSON.stringify(options) + extraKey,
        sites: [],
        features: raw => { h.sites = sitesOf(raw); },
        fix: data => {
            const g = { ...data, water: data.water.map(w => w === 2 || w === 3 || w === 1 ? w : 0) };
            h.roads = new Roads(g, options);
            h.roads.build(h.sites);
            carve(h.roads, g);
            bridgeWater(h.roads.network, data);
            tunnelHoles(h.roads.network, data);
            h.roads.load(h.roads.network);
        },
    };
    return h;
}

/** metres from (x, z) to the nearest road edge (<= 0 on the road); `far` when none within it */
export const roadEdge = (roads: Roads, far = 30) => (x: number, z: number) => {
    const r = roads.nearest(x, z, far);
    return r ? r.distance - r.road.width / 2 : far;
};


/**
 * Ground around tunnels (after erosion, in place): over the whole tube the ground is raised to cover it (`cover` m over
 * the vault, nothing pokes in), in front of each mouth it is cut to road level (forecourt), and the nodes right behind
 * each face become holes in the drawn terrain (`data.holes`: the terrain drops every triangle touching one), the ground
 * around them sits at the portal hood's top (`TUNNEL_HEIGHT` + `cover`): the hood covers the opening, the ground meets it.
 */
export function tunnelHoles(network: Network, g: { n: number; size: number; height: Float32Array; water?: Uint8Array; holes?: Uint8Array }, cover = 2) {
    const { n, size } = g, cell = size / (n - 1), node = (x: number) => (x / size + .5) * (n - 1);
    const holes = (g.holes ??= new Uint8Array(n * n));
    for (const r of network.roads) for (const s of r.spans)
    {
        if (s.kind !== "tunnel" || s.to - s.from < 1) continue;
        const P = r.points.slice(s.from, s.to + 1), top = TUNNEL_HEIGHT[r.class] ?? 6;
        // half widths: the tube (portal opening + wall), the face wall
        const tube = Math.max(r.width + 2, 6) / 2 + 1, face = tube + 1.5, raise = tube + cell * 2;
        // along-length of each point
        const at = [0];
        for (let i = 1; i < P.length; i++) at.push(at[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]));
        const L = at[at.length - 1];
        // raise over the tube: nearest segment, along + across
        for (let i = 0; i < P.length - 1; i++)
        {
            const [ax, ay, az] = P[i], [bx, by, bz] = P[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
            const i0 = Math.max(0, Math.floor(node(Math.min(ax, bx) - raise))), i1 = Math.min(n - 1, Math.ceil(node(Math.max(ax, bx) + raise)));
            const j0 = Math.max(0, Math.floor(node(Math.min(az, bz) - raise))), j1 = Math.min(n - 1, Math.ceil(node(Math.max(az, bz) + raise)));
            for (let j = j0; j <= j1; j++) for (let q = i0; q <= i1; q++)
            {
                const x = q * cell - size / 2, z = j * cell - size / 2, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
                const d = Math.hypot(x - ax - dx * t, z - az - dz * t), along = at[i] + (at[i + 1] - at[i]) * t, k = j * n + q;
                if (d > raise || along < cell * .5 || along > L - cell * .5 || g.water?.[k]) continue;
                const need = ay + (by - ay) * t + top + cover, w = d <= tube + cell * .5 ? 1 : 1 - (d - tube - cell * .5) / (raise - tube - cell * .5);
                if (g.height[k] < need) g.height[k] += (need - g.height[k]) * w;
            }
        }
        // each mouth out in the open (not an end meeting another tunnel underground): forecourt cut in front, holes behind the face
        for (const [a, b] of [[P[0], P[1]], [P[P.length - 1], P[P.length - 2]]])
        {
            if (!isMouth(network.roads, r, a)) continue;
            const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1, ux = (b[0] - a[0]) / l, uz = (b[2] - a[2]) / l;
            const r0 = Math.ceil((face + cell * 6) / cell), ci = Math.round(node(a[0])), cj = Math.round(node(a[2]));
            for (let j = cj - r0; j <= cj + r0; j++) for (let q = ci - r0; q <= ci + r0; q++)
            {
                if (q < 0 || j < 0 || q >= n || j >= n) continue;
                const x = q * cell - size / 2 - a[0], z = j * cell - size / 2 - a[2], d = x * ux + z * uz, across = Math.abs(-x * uz + z * ux), k = j * n + q;
                if (g.water?.[k]) continue;
                // hole nodes at road level: the ground in front (what the approach road reads) stays low up to the face
                if (d >= -.01 && d <= cell * 1.2 && across <= Math.max(tube - .5, face - cell)) { holes[k] = 1; g.height[k] = a[1] - .3; }
                // right behind the face: exactly the portal hood's top, so the ground meets it
                // first row behind the face still at road level (the climb happens behind the face wall, never in front)
                else if (d >= -.01 && d < cell && across <= face + cell) g.height[k] = Math.min(g.height[k], a[1] - .3);
                else if (d >= cell && d <= cell * 2.2 && across <= face + cell) g.height[k] = a[1] + top + cover;
                // forecourt: flat at road level in front of the face, banks rising 1:1 beside and ahead (a cutting, no cliff)
                else if (d < 0 && d > -cell * 5 && across <= face + cell * 5) g.height[k] = Math.min(g.height[k], a[1] - .3 + Math.max(0, across - face) + Math.max(0, -d - cell * 2));
            }
        }
    }
}

/**
 * A tunnel end `p` of road `r` is a real mouth (out in the open) unless another way's tunnel also ends right there
 * (the tunnel goes on underground through a junction).
 */
export function isMouth(roads: { points: number[][]; spans: Span[] }[], r: { points: number[][] }, p: number[]) {
    for (const o of roads)
    {
        if (o === r) continue;
        for (const s of o.spans) if (s.kind === "tunnel") for (const i of [s.from, s.to])
        {
            const q = o.points[i];
            if (q && Math.hypot(q[0] - p[0], q[2] - p[2]) < .5) return false;
        }
    }
    return true;
}
