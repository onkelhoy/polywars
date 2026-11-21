import { Random } from "@papit/random";
import { flatness, grids, pos, spaced, type Grids } from "./grid";
import { resolve } from "./presets";
import type { Ground, Site, SiteKind, SitesOptions, Town } from "./types";

type Found = { x: number; z: number; y: number; score: number };

/**
 * Sites on a map: the terrain's towns (kind city), villages, farms round towns and villages, landmarks
 * (peak, beach, lake shore, pass, viewpoint). Same ground + towns + options = same sites.
 */
export function generateSites(ground: Ground, towns: Town[], options: Partial<SitesOptions> = {}): Site[] {
    const o = resolve(options), g = grids(ground), rng = new Random(o.seed);
    const out: Site[] = [];
    const add = (kind: SiteKind, list: Found[], radius: number) => {
        const max = Math.max(1e-6, ...list.map(f => f.score));
        for (const f of list) out.push({ id: out.length, kind, x: f.x, z: f.z, y: f.y, radius, weight: Math.max(0, Math.min(1, f.score / max)) });
    };
    for (const t of towns) out.push({ id: out.length, kind: "city", x: t.x, z: t.z, y: t.y, radius: t.radius, weight: 1 });

    const villages = villageSpots(g, o, rng.fork("village"), towns);
    add("village", villages, o.village.radius);
    out.forEach(s => { if (s.kind === "village") s.weight *= .5; });
    add("farm", farms(g, o, rng.fork("farm"), out.filter(s => s.kind === "city" || s.kind === "village")), o.farm.radius);
    out.forEach(s => { if (s.kind === "farm") s.weight *= .2; });

    const taken = () => out.map(s => ({ x: s.x, z: s.z }));
    const far = (d: number) => (a: { x: number; z: number }, b: Found) => Math.hypot(a.x - b.x, a.z - b.z) >= d;
    const marks: [SiteKind, Found[], number][] = [
        ["peak", spaced(peaks(g, o), o.peak.count, far(o.peak.spacing)), 10],
        ["pass", spaced(passes(g), o.pass.count, far(o.pass.spacing)), 10],
        ["viewpoint", spaced(views(g, o), o.viewpoint.count, far(o.viewpoint.spacing), taken()), 8],
        ["beach", spaced(beaches(g, o, rng.fork("beach")), o.beach.count, far(o.beach.spacing)), 20],
        ["lake", spaced(lakes(g, rng.fork("lake")), o.lake.count, far(o.lake.spacing)), 10],
    ];
    for (const [kind, list, r] of marks) { add(kind, list, r); }
    for (const s of out) if (!["city", "village", "farm"].includes(s.kind)) s.weight *= .1;
    return out;
}

function villageSpots(g: Grids, o: SitesOptions, rng: Random, towns: Town[]): Found[] {
    const { n, cell, height } = g, r = Math.max(1, Math.round(o.village.radius / cell)), stride = Math.max(1, r);
    const found: Found[] = [];
    for (let j = r; j < n - r; j += stride) for (let i = r; i < n - r; i += stride)
    {
        const f = flatness(g, i, j, r);
        if (f < 0 || f > o.village.maxSlope) continue;
        const k = j * n + i, [x, z] = pos(g, k), up = (height[k] - g.seaLevel) / (g.top - g.seaLevel);
        found.push({ x, z, y: height[k], score: (1 - f / o.village.maxSlope) * .5 - up * .3 + rng.float(0, .5) });
    }
    const keep = towns.map(t => ({ x: t.x, z: t.z }));
    return spaced(found, o.village.count, (a, b) => Math.hypot(a.x - b.x, a.z - b.z) >= o.village.spacing, keep);
}

function farms(g: Grids, o: SitesOptions, rng: Random, around: Site[]): Found[] {
    const { n, cell, height } = g, r = Math.max(1, Math.round(o.farm.radius / cell)), out: Found[] = [];
    const clear = (x: number, z: number) => around.every(s => Math.hypot(s.x - x, s.z - z) >= s.radius * 1.3) && out.every(f => Math.hypot(f.x - x, f.z - z) >= o.farm.radius * 5);
    for (const s of around)
    {
        const want = s.kind === "city" ? o.farm.perTown : o.farm.perVillage;
        let got = 0;
        for (let t = 0; t < want * 30 && got < want; t++)
        {
            const a = rng.float(0, Math.PI * 2), d = s.radius * rng.float(o.farm.near[0], o.farm.near[1]);
            const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
            const i = Math.round((x / g.size + .5) * (n - 1)), j = Math.round((z / g.size + .5) * (n - 1));
            const f = flatness(g, i, j, r);
            if (f < 0 || f > o.farm.maxSlope || !clear(x, z)) continue;
            out.push({ x, z, y: height[j * n + i], score: 1 - f / o.farm.maxSlope }); got++;
        }
    }
    return out;
}

/** local highs standing `prominence` metres over the ring round them */
function peaks(g: Grids, o: SitesOptions): Found[] {
    const { n, cell, height } = g, r = Math.max(2, Math.round(o.peak.spacing / 4 / cell)), stride = Math.max(1, r >> 2), out: Found[] = [];
    for (let j = r; j < n - r; j += stride) for (let i = r; i < n - r; i += stride)
    {
        const k = j * n + i, h = height[k];
        if (g.water[k]) continue;
        let top = true, low = h;
        for (let a = 0; a < 16 && top; a++) for (const f of [.15, .4, 1])
        {
            const m = (j + Math.round(Math.sin(a * Math.PI / 8) * r * f)) * n + i + Math.round(Math.cos(a * Math.PI / 8) * r * f);
            if (height[m] > h) { top = false; break; }
            if (f === 1) low = Math.min(low, height[m]);
        }
        if (top && h - low >= o.peak.prominence) { const [x, z] = pos(g, k); out.push({ x, z, y: h, score: h }); }
    }
    return out;
}

/** saddles: lowest along a ridge, highest across it, high up */
function passes(g: Grids): Found[] {
    const { n, cell, height } = g, d = Math.max(2, Math.round(60 / cell)), stride = Math.max(1, d >> 1), out: Found[] = [];
    const axes = [[1, 0], [1, 1], [0, 1], [-1, 1]];
    for (let j = d; j < n - d; j += stride) for (let i = d; i < n - d; i += stride)
    {
        const k = j * n + i, h = height[k], up = (h - g.seaLevel) / (g.top - g.seaLevel);
        if (g.water[k] || up < .35) continue;
        for (let a = 0; a < 4; a++)
        {
            const [ax, az] = axes[a], [bx, bz] = axes[(a + 2) % 4];
            const along = Math.min(height[k + (az * n + ax) * d], height[k - (az * n + ax) * d]) - h;
            const across = h - Math.max(height[k + (bz * n + bx) * d], height[k - (bz * n + bx) * d]);
            if (along > 8 && across > 8) { const [x, z] = pos(g, k); out.push({ x, z, y: h, score: Math.min(along, across) + up * 20 }); break; }
        }
    }
    return out;
}

/** flat spots at the edge of a drop */
function views(g: Grids, o: SitesOptions): Found[] {
    const { n, cell, height } = g, d = Math.max(2, Math.round(50 / cell)), stride = Math.max(1, d >> 1), out: Found[] = [];
    for (let j = d; j < n - d; j += stride) for (let i = d; i < n - d; i += stride)
    {
        const k = j * n + i, h = height[k];
        if (g.water[k] || g.slope[k] > .25) continue;
        let drop = 0;
        for (let a = 0; a < 8; a++) drop = Math.max(drop, h - height[(j + Math.round(Math.sin(a * Math.PI / 4) * d)) * n + i + Math.round(Math.cos(a * Math.PI / 4) * d)]);
        if (drop >= o.viewpoint.drop) { const [x, z] = pos(g, k); out.push({ x, z, y: h, score: drop + (h - g.seaLevel) * .1 }); }
    }
    return out;
}

/** low, gentle land right by the sea */
function beaches(g: Grids, o: SitesOptions, rng: Random): Found[] {
    const { n, height } = g, out: Found[] = [];
    for (let k = 0; k < n * n; k += 3)
    {
        if (g.water[k] || g.toSea[k] > o.beach.width || height[k] - g.seaLevel > 5 || g.slope[k] > .12) continue;
        const [x, z] = pos(g, k);
        out.push({ x, z, y: height[k], score: (1 - g.slope[k] / .12) + rng.float(0, .5) });
    }
    return out;
}

/** land touching a lake (only when the ground has lakes: water 2) */
function lakes(g: Grids, rng: Random): Found[] {
    const { n, height, water } = g, out: Found[] = [];
    for (let j = 1; j < n - 1; j += 2) for (let i = 1; i < n - 1; i += 2)
    {
        const k = j * n + i;
        if (water[k] || !(water[k - 1] === 2 || water[k + 1] === 2 || water[k - n] === 2 || water[k + n] === 2)) continue;
        const [x, z] = pos(g, k);
        out.push({ x, z, y: height[k], score: rng.float(0, 1) - g.slope[k] });
    }
    return out;
}
