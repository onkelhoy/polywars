import type { Item, TrailOptions, TrailWorld, Vec3 } from "./types";

export const DEFAULTS: TrailOptions = {
    seed: 1,
    assets: {
        bench: "props/village/bench", lamp: "props/village/lantern", streetLamp: "props/village/street-lamp", signpost: "props/village/signpost",
        fence: "props/village/fence", log: "props/village/log", woodpile: "props/village/woodpile",
        rocks: ["nature/Rock_1", "nature/Rock_2", "nature/Rock_3", "nature/Rock_4", "nature/Rock_5"],
    },
    trails: ["path", "lane"],
    restEvery: 180,
    view: 10,
    fence: { drop: 4, reach: 5, length: 2.5 },
    lampEvery: 28,
    rocks: 6,
};

/** model +x along (dx, dz) */
const yawAlong = (dx: number, dz: number) => Math.atan2(-dz, dx);
/** model +z (front) facing (dx, dz) */
const yawFacing = (dx: number, dz: number) => Math.atan2(dx, dz);

/** walk a polyline every `step` m: point, unit direction */
function walk(points: Vec3[], step: number, start = 0) {
    const out: { p: Vec3; d: [number, number]; at: number }[] = [];
    let total = 0, next = start;
    for (let i = 0; i < points.length - 1; i++)
    {
        const a = points[i], b = points[i + 1], l = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (l < 1e-6) continue;
        while (next <= total + l)
        {
            const t = (next - total) / l;
            out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], d: [(b[0] - a[0]) / l, (b[2] - a[2]) / l], at: next });
            next += step;
        }
        total += l;
    }
    return out;
}

/**
 * Trail furniture by rules: benches (+ lantern, log or woodpile) at views and clearings along trails and at landmark trail ends,
 * signposts where trails leave bigger roads, fences along trail edges above drops, street lamps on roads inside villages and cities,
 * rocks around tunnel mouths. Pure: returns items; the caller records them (`@polywar/placements`).
 */
export function furnish(world: TrailWorld, options: Partial<TrailOptions> = {}): { items: Item[]; fences: Vec3[][] } {
    const o = { ...DEFAULTS, ...options, assets: { ...DEFAULTS.assets, ...options.assets }, fence: { ...DEFAULTS.fence, ...options.fence } };
    let s = (o.seed * 2654435761) >>> 0 || 1;
    const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296);
    const out: Item[] = [], fences: Vec3[][] = [], g = world.ground;
    // never on a way (its own or any other): a prop needs `free` m to the nearest edge
    const free = (x: number, z: number, m = .8) => !world.clear || world.clear(x, z) >= m;
    const put = (kind: string, x: number, z: number, yaw: number, scale = 1) => { if (free(x, z, kind === o.assets.bench ? 1.2 : .8)) out.push({ kind, x, y: g(x, z), z, yaw, scale }); };
    // how much a spot looks out: its height over the mean of a ring around it
    const view = (x: number, z: number) => { const h = g(x, z); let m = 0; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; m += g(x + Math.cos(a) * 40, z + Math.sin(a) * 40); } return h - m / 8; };
    const onBridge = (w: TrailWorld["ways"][0], i: number) => w.spans?.some(sp => sp.kind !== "ground" && i >= sp.from && i <= sp.to);

    for (const w of world.ways)
    {
        const pts = w.points as Vec3[];
        if (pts.length < 2) continue;
        const trail = o.trails.includes(w.class), half = w.width / 2;
        // index of the nearest original point (to skip bridges / tunnels)
        const index = (p: Vec3) => { let b = 0, bd = Infinity; for (let i = 0; i < pts.length; i += 2) { const d = Math.hypot(pts[i][0] - p[0], pts[i][2] - p[2]); if (d < bd) { bd = d; b = i; } } return b; };

        if (trail)
        {
            // rest spots: best view (or clearing) in each stretch of `restEvery` m
            const samples = walk(pts, 15, 10);
            for (let k = 0; k < samples.length; k += Math.round(o.restEvery / 15))
            {
                let best: typeof samples[0] | undefined, side = 1, score = -Infinity;
                for (const c of samples.slice(k, k + Math.round(o.restEvery / 15)))
                {
                    if (onBridge(w, index(c.p))) continue;
                    for (const f of [-1, 1])
                    {
                        const ox = -c.d[1] * f, oz = c.d[0] * f, x = c.p[0] + ox * (half + 1.5), z = c.p[2] + oz * (half + 1.5);
                        if (Math.abs(g(x, z) - c.p[1]) > 1.2) continue;
                        const v = view(x + ox * 6, z + oz * 6), open = world.open?.(x, z) ?? 0;
                        const sc = Math.max(v / o.view, open);
                        if (sc > score) { score = sc; best = c; side = f; }
                    }
                }
                if (!best || score < 1) continue;
                const ox = -best.d[1] * side, oz = best.d[0] * side, x = best.p[0] + ox * (half + 1.3), z = best.p[2] + oz * (half + 1.3);
                put(o.assets.bench, x, z, yawFacing(ox, oz));
                const r = rnd(), ax = x + best.d[0] * 1.6, az = z + best.d[1] * 1.6;
                if (r < .4) put(o.assets.lamp, ax, az, rnd() * 6.28);
                else if (r < .6) put(o.assets.log, x + best.d[0] * -2.5 + ox, z + best.d[1] * -2.5 + oz, yawAlong(best.d[0], best.d[1]));
                else if (r < .7) put(o.assets.woodpile, ax + ox, az + oz, rnd() * 6.28);
                if (rnd() < .35) put(o.assets.signpost, best.p[0] - ox * (half + .8), best.p[2] - oz * (half + .8), yawAlong(ox, oz));
            }
            // fences above drops: one side only (the drop side; none on a ridge with drops both ways), posts on the ground
            {
                let run: Vec3[] = [], runSide = 0;
                const flush = () => { if (run.length >= 3) fences.push(run); run = []; runSide = 0; };
                for (const c of walk(pts, o.fence.length, 0))
                {
                    const y = g(c.p[0], c.p[2]), drop = (f: number) => y - g(c.p[0] - c.d[1] * f * (half + o.fence.reach), c.p[2] + c.d[0] * f * (half + o.fence.reach));
                    const l = drop(-1), r = drop(1), f = l > r ? -1 : 1, big = Math.max(l, r), small = Math.min(l, r);
                    const side = big > o.fence.drop && small < o.fence.drop * .4 && !onBridge(w, index(c.p)) ? f : 0;
                    if (!side || (runSide && side !== runSide)) { flush(); if (!side) continue; }
                    runSide = side;
                    const ex = c.p[0] - c.d[1] * side * (half + .7), ez = c.p[2] + c.d[0] * side * (half + .7);
                    if (!free(ex, ez, .3) || (world.mouths ?? []).some(m => Math.hypot(m.x - ex, m.z - ez) < 16)) { flush(); continue; }
                    run.push([ex, g(ex, ez), ez]);
                }
                flush();
            }
        }

        // street lamps on roads inside villages / cities
        if (!trail && w.class !== "rail")
        {
            let alt = 1;
            for (const c of walk(pts, o.lampEvery, o.lampEvery / 2))
            {
                const town = world.spots.find(sp => (sp.kind === "village" || sp.kind === "city") && Math.hypot(sp.x - c.p[0], sp.z - c.p[2]) < sp.radius);
                if (!town || onBridge(w, index(c.p))) continue;
                alt = -alt;
                const ox = -c.d[1] * alt, oz = c.d[0] * alt;
                put(o.assets.streetLamp, c.p[0] + ox * (half + 1), c.p[2] + oz * (half + 1), yawAlong(c.d[0], c.d[1]));
            }
        }
    }

    // signposts where a trail starts at a bigger road: trail ends near another way's line
    for (const w of world.ways)
    {
        if (!o.trails.includes(w.class)) continue;
        const pts = w.points as Vec3[];
        for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]])
        {
            if (!p || !q) continue;
            const d = [q[0] - p[0], q[2] - p[2]], l = Math.hypot(d[0], d[1]) || 1, ox = -d[1] / l, oz = d[0] / l;
            put(o.assets.signpost, p[0] + d[0] / l * 4 + ox * (w.width / 2 + .8), p[2] + d[1] / l * 4 + oz * (w.width / 2 + .8), yawAlong(d[0] / l, d[1] / l));
        }
    }

    // landmarks at trail ends: a bench looking out
    for (const sp of world.spots)
    {
        if (!["viewpoint", "peak", "lake", "beach"].includes(sp.kind)) continue;
        const a = rnd() * Math.PI * 2, r = Math.min(sp.radius, 12);
        put(o.assets.bench, sp.x + Math.cos(a) * r, sp.z + Math.sin(a) * r, yawFacing(Math.cos(a), Math.sin(a)));
        if (rnd() < .5) put(o.assets.lamp, sp.x + Math.cos(a + .3) * r, sp.z + Math.sin(a + .3) * r, 0);
    }

    // tunnel mouths: rocks on both sides, nature taking the edges back
    for (const m of world.mouths ?? [])
    {
        const l = Math.hypot(m.dx, m.dz) || 1, fx = m.dx / l, fz = m.dz / l;
        for (let i = 0; i < o.rocks; i++)
        {
            const side = i % 2 ? 1 : -1, across = 7 + rnd() * 8, back = -2 - rnd() * 8;
            const x = m.x - fz * across * side + fx * back, z = m.z + fx * across * side + fz * back;
            put(o.assets.rocks[(rnd() * o.assets.rocks.length) | 0], x, z, rnd() * 6.28, .8 + rnd() * 1.2);
        }
    }
    return { items: out, fences };
}
