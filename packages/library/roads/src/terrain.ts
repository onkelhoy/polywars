import { Roads } from "./roads";
import type { Ground, Network, RoadsOptions, Site, Span } from "./types";

/**
 * Lays the network into a ground grid (in place): across each road (not on bridges / in tunnels) the ground goes to
 * the bed height, full under half the width, blended back over the shoulder (cut / fill banks).
 * Returns `hard` (n², 0..1): where erosion should leave the ground alone.
 */
export function carve(roads: Roads, g: Ground): Float32Array {
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
    for (let k = 0; k < n * n; k++) if (weight[k] > 0) height[k] += (target[k] - height[k]) * weight[k];
    return weight;
}

type Wet = { n: number; size: number; height: Float32Array; water: Uint8Array; surface: Float32Array };

/**
 * After lakes and rivers exist: ground stretches over water become bridges (a little past the banks), held at least
 * `clearance` m over the water surface.
 */
export function bridgeWater(network: Network, g: Wet, clearance = 2) {
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
    features: (raw: Ground & { cities: { x: number; z: number; y: number; radius: number; score: number }[] }) => { hard: Float32Array };
    fix: (data: Wet) => void;
    /** the latest built roads and the sites they connect */
    roads?: Roads;
    sites: Site[];
};

/**
 * Terrain hooks (`@polywar/terrain` `TerrainHooks`): on the raw map pick sites (`sitesOf`), build and carve the
 * network before erosion; after rivers turn water crossings into bridges. `key` = these options (+ `extraKey`).
 */
export function roadHooks(sitesOf: (raw: Ground & { cities: any[] }) => Site[], options: Partial<RoadsOptions> = {}, extraKey = ""): RoadHooks {
    const h: RoadHooks = {
        key: JSON.stringify(options) + extraKey,
        sites: [],
        features: raw => {
            h.sites = sitesOf(raw);
            h.roads = new Roads(raw, options);
            h.roads.build(h.sites);
            return { hard: carve(h.roads, raw) };
        },
        fix: data => { if (h.roads) { bridgeWater(h.roads.network, data); h.roads.load(h.roads.network); } },
    };
    return h;
}

/** metres from (x, z) to the nearest road edge (<= 0 on the road); `far` when none within it */
export const roadEdge = (roads: Roads, far = 30) => (x: number, z: number) => {
    const r = roads.nearest(x, z, far);
    return r ? r.distance - r.road.width / 2 : far;
};
