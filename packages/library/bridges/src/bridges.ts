import { sweep, merge, type Profile } from "@polywar/sweep";
import { Soup, along, length } from "./geometry";
import type { BridgeOptions, BridgeType, Mesh, RGB, Vec3 } from "./types";

const STONE: RGB = [.55, .52, .47], STONE_DARK: RGB = [.42, .4, .36], WOOD: RGB = [.42, .3, .2], WOOD_DARK: RGB = [.3, .21, .14], STEEL: RGB = [.3, .32, .33], CONCRETE: RGB = [.6, .59, .56];

export const DEFAULTS: BridgeOptions = { width: 6, ground: () => 0, use: "road" };

/** what bridge fits: class of the road / rail, span (m) and height over the ground (m) */
export function pick(cls: string, span: number, height: number): BridgeType {
    if (cls === "path") return span > 40 ? "trestle-wood" : "foot-wood";
    if (cls === "rail") return span > 160 || height > 35 ? "girder" : span < 70 && height > 4 ? "arch-stone" : "trestle-wood";
    if (cls === "lane") return height < 4 ? "slab-stone" : span > 60 ? "trestle-wood" : "arch-stone";
    if (span > 140 || height > 30) return "girder";
    return height < 4 ? "slab-stone" : "arch-stone";
}

/** deck with parapets (`rail` m high, `railR` on the right when different), closed underneath, `thick` m deep; y in metres, x in half widths */
function deckProfile(thick: number, rail: number, side: RGB, top: RGB, edge = 1.12, railR = rail): Profile {
    const pts: [number, number][] = [[-edge, -thick], [-edge, rail], [-1, rail], [-1, 0], [1, 0], [1, railR], [edge, railR], [edge, -thick], [-edge, -thick]];
    return { points: pts, colors: [side, side, side, top, side, side, side, STONE_DARK] };
}

/** `path` from `a` to `b` m along it (horizontal), cut points interpolated */
function cut(path: Vec3[], a: number, b: number): Vec3[] {
    const out: Vec3[] = [];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++)
    {
        const p = path[i], q = path[i + 1], l = Math.hypot(q[0] - p[0], q[2] - p[2]), lerp = (t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
        if (l > 1e-6)
        {
            if (!out.length && total + l >= a) out.push(lerp((a - total) / l));
            if (out.length && total + l >= b) { out.push(lerp((b - total) / l)); return out; }
            if (out.length && total + l > a) out.push(q);
        }
        total += l;
    }
    return out;
}

/** deck sweep with the parapet open in `o.gaps` (rail .05 there, per side) */
function deck(path: Vec3[], o: BridgeOptions, thick: number, rail: number, side: RGB, top: RGB, edge: number, opts: { step: number; bands?: { every: number; shade: number } }) {
    const sw = (pts: Vec3[], l: number, r: number) => sweep(pts, { width: o.width, profile: deckProfile(thick, l, side, top, edge, r), bank: "flat", caps: true, ...opts });
    const gaps = rail > .05 ? (o.gaps ?? []) : [];
    if (!gaps.length) return sw(path, rail, rail);
    const L = length(path), cuts = [...new Set([0, L, ...gaps.flatMap(g => [Math.max(0, g.from), Math.min(L, g.to)])])].sort((a, b) => a - b), parts = [];
    for (let i = 0; i < cuts.length - 1; i++)
    {
        const a = cuts[i], b = cuts[i + 1], m = (a + b) / 2;
        if (b - a < .05) continue;
        const open = (k: number) => gaps.some(g => g.side === k && m > g.from && m < g.to);
        const pts = cut(path, a, b);
        if (pts.length >= 2) parts.push(sw(pts, open(-1) ? .05 : rail, open(1) ? .05 : rail));
    }
    return merge(parts);
}

/** height of the deck over the ground: highest point */
const clearance = (path: Vec3[], ground: BridgeOptions["ground"]) => Math.max(0, ...along(path, 2).map(a => a.p[1] - ground(a.p[0], a.p[2])));

/** A bridge along `path` (deck line x y z; supports reach down to `ground`). */
export function bridge(type: BridgeType, path: Vec3[], options: Partial<BridgeOptions> = {}): Mesh {
    const o = { ...DEFAULTS, ...options };
    return BUILD[type](path, o);
}

/** the bridge for a road class (picks the type) */
export function bridgeFor(cls: string, path: Vec3[], options: Partial<BridgeOptions> = {}): { type: BridgeType; mesh: Mesh } {
    const o = { ...DEFAULTS, ...options }, type = pick(cls, length(path), clearance(path, o.ground));
    return { type, mesh: bridge(type, path, o) };
}

const BUILD: Record<BridgeType, (path: Vec3[], o: BridgeOptions) => Mesh> = {
    "foot-wood": (path, o) => {
        const s = new Soup(), w = o.width / 2;
        for (const a of along(path, 2))
        {
            for (const k of [-1, 1])
            {
                const x = a.p[0] + a.side[0] * w * k, z = a.p[2] + a.side[1] * w * k;
                s.beam([x, a.p[1] - .1, z], [x, a.p[1] + 1, z], .1, .1, WOOD_DARK);
                if (a.d % 4 < 1e-6) s.beam([x, o.ground(x, z) - .5, z], [x, a.p[1] - .1, z], .16, .16, WOOD_DARK);
            }
        }
        for (const k of [-1, 1]) for (let i = 0; i < path.length - 1; i++)
        {
            const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1, sx = -(b[2] - a[2]) / l * w * k, sz = (b[0] - a[0]) / l * w * k;
            s.beam([a[0] + sx, a[1] + 1, a[2] + sz], [b[0] + sx, b[1] + 1, b[2] + sz], .08, .08, WOOD);
        }
        const deck = sweep(path, { width: o.width, profile: deckProfile(.15, 0, WOOD_DARK, WOOD, 1.05), bank: "flat", step: 1, bands: { every: .5, shade: .15 } });
        return merge([deck, s.mesh()]);
    },
    "slab-stone": (path, o) => {
        const s = new Soup(), L = length(path), n = Math.max(1, Math.round(L / 7));
        for (const a of along(path, L / n).slice(1, -1)) pier(s, a, o, o.width * 1.15, 1.2, STONE_DARK);
        return merge([deck(path, o, .6, .5, STONE, STONE_DARK, 1.12, { step: 2, bands: { every: 2.5, shade: .08 } }), s.mesh()]);
    },
    "arch-stone": (path, o) => {
        const s = new Soup(), L = length(path), h = clearance(path, o.ground);
        const bays = Math.max(1, Math.round(L / Math.max(8, Math.min(24, h * 1.1)))), bay = L / bays, pierW = Math.max(1.2, bay * .14);
        const stations = along(path, bay);
        const w = o.width / 2 * 1.12, thick = .6;
        // piers (not at the ends: abutments sit in the bank)
        for (const a of stations.slice(1, -1)) pier(s, a, o, o.width * 1.12, pierW, STONE_DARK);
        // per bay: spandrel walls on both faces + the arch underside
        for (let b = 0; b < bays; b++)
        {
            const a0 = stations[b], a1 = stations[Math.min(b + 1, stations.length - 1)] ?? a0;
            const u0 = b ? pierW / 2 : 0, u1 = bay - (b < bays - 1 ? pierW / 2 : 0), r = (u1 - u0) / 2;
            const top0 = a0.p[1] - thick, top1 = a1.p[1] - thick, top = (u: number) => top0 + (top1 - top0) * (u / bay);
            const crown = Math.min(top0, top1) - .5, spring = crown - r, N = 10;
            const at = (u: number, y: number, k: number): Vec3 => [a0.p[0] + a0.dir[0] * u + a0.side[0] * w * k, y, a0.p[2] + a0.dir[1] * u + a0.side[1] * w * k];
            const arch = Array.from({ length: N + 1 }, (_, i) => { const t = Math.PI - i / N * Math.PI; return [u0 + r + Math.cos(t) * r, spring + Math.sin(t) * r] as [number, number]; });
            for (let i = 0; i < N; i++)
            {
                const [ua, ya] = arch[i], [ub, yb] = arch[i + 1];
                for (const k of [-1, 1])
                {
                    const q: Vec3[] = [at(ua, ya, k), at(ub, yb, k), at(ub, top(ub), k), at(ua, top(ua), k)];
                    if (k > 0) s.quad(q[0], q[1], q[2], q[3], STONE); else s.quad(q[3], q[2], q[1], q[0], STONE);
                }
                s.quad(at(ua, ya, 1), at(ua, ya, -1), at(ub, yb, -1), at(ub, yb, 1), STONE_DARK);
            }
            // pier walls below the springing down to the ground (both bay ends)
            for (const [u, k0] of [[u0, 1], [u1, -1]] as const) for (const k of [-1, 1])
            {
                const p = at(u, spring, k), g = o.ground(p[0], p[2]) - 1;
                if (g >= spring) continue;
                s.quad2(at(u, g, -1), at(u, g, 1), at(u, spring, 1), at(u, spring, -1), STONE_DARK);
                void k0;
            }
        }
        return merge([deck(path, o, thick, o.use === "rail" ? .6 : .9, STONE, STONE_DARK, 1.12, { step: 2 }), s.mesh()]);
    },
    "trestle-wood": (path, o) => {
        const s = new Soup(), w = o.width / 2, deckY = .5;
        for (const a of along(path, 5))
        {
            const top = a.p[1] - deckY, ground = Math.min(...[-1, 1].map(k => o.ground(a.p[0] + a.side[0] * w * k, a.p[2] + a.side[1] * w * k))) - .5;
            const h = Math.max(0, top - ground);
            if (h < .3) continue;
            const spread = (y: number) => w * .9 + (top - y) * .12;
            const post = (k: number, y: number): Vec3 => [a.p[0] + a.side[0] * spread(y) * k, y, a.p[2] + a.side[1] * spread(y) * k];
            const inner = (k: number, y: number): Vec3 => [a.p[0] + a.side[0] * w * .35 * k, y, a.p[2] + a.side[1] * w * .35 * k];
            for (const k of [-1, 1]) { s.beam(post(k, ground), post(k, top), .25, .25, WOOD_DARK); s.beam(inner(k, ground), inner(k, top), .25, .25, WOOD_DARK); }
            // tiers: a cap + an X between the outer posts
            const tiers = Math.max(1, Math.round(h / 5));
            for (let t = 0; t < tiers; t++)
            {
                const y0 = top - h * t / tiers, y1 = top - h * (t + 1) / tiers;
                s.beam(post(-1, y0), post(1, y0), .2, .2, WOOD);
                s.beam(post(-1, y0), post(1, y1), .12, .12, WOOD);
                s.beam(post(1, y0), post(-1, y1), .12, .12, WOOD);
            }
        }
        return merge([deck(path, o, deckY, o.use === "rail" ? .2 : .9, WOOD_DARK, WOOD, 1.08, { step: 2, bands: { every: .6, shade: .12 } }), s.mesh()]);
    },
    girder: (path, o) => {
        const s = new Soup(), L = length(path), H = Math.max(4, Math.min(9, L / 12)), w = o.width / 2 * 1.04;
        const piers = Math.max(1, Math.round(L / 55));
        for (const a of along(path, L / piers).slice(1, -1)) pier(s, a, o, o.width * 1.3, 3, CONCRETE);
        // two trusses: chords + verticals + diagonals every panel; shorter panels on a bend, sides mitred so the
        // chords follow the deck edge
        let turn = 0;
        for (let i = 1; i < path.length - 1; i++) { const a = Math.atan2(path[i][2] - path[i - 1][2], path[i][0] - path[i - 1][0]), b = Math.atan2(path[i + 1][2] - path[i][2], path[i + 1][0] - path[i][0]); let d = Math.abs(b - a); d = Math.min(d, Math.PI * 2 - d); turn += d; }
        const raw = along(path, L / Math.max(2, Math.round(L / (turn / L * 6 > .05 ? 3 : 6))));
        const panels = raw.map((a, i) => {
            const p = raw[Math.max(0, i - 1)].p, q = raw[Math.min(raw.length - 1, i + 1)].p, l = Math.hypot(q[0] - p[0], q[2] - p[2]) || 1;
            return { ...a, side: [-(q[2] - p[2]) / l, (q[0] - p[0]) / l] as [number, number] };
        });
        const gap = (k: number, d0: number, d1: number) => (o.gaps ?? []).some(g => g.side === k && d1 > g.from && d0 < g.to);
        for (const k of [-1, 1])
        {
            const at = (a: typeof panels[0], y: number): Vec3 => [a.p[0] + a.side[0] * w * k, a.p[1] + y, a.p[2] + a.side[1] * w * k];
            for (let i = 0; i < panels.length; i++)
            {
                const a = panels[i];
                if (!gap(k, a.d - .5, a.d + .5)) s.beam(at(a, 0), at(a, H), .3, .3, STEEL);
                if (i === panels.length - 1) break;
                const b = panels[i + 1];
                if (gap(k, a.d, b.d)) continue;
                s.beam(at(a, 0), at(b, 0), .5, .5, STEEL);
                s.beam(at(a, H), at(b, H), .4, .4, STEEL);
                if (i % 2) s.beam(at(a, 0), at(b, H), .2, .2, STEEL); else s.beam(at(a, H), at(b, 0), .2, .2, STEEL);
            }
        }
        // top ties across
        for (const a of panels) s.beam([a.p[0] - a.side[0] * w, a.p[1] + H, a.p[2] - a.side[1] * w], [a.p[0] + a.side[0] * w, a.p[1] + H, a.p[2] + a.side[1] * w], .2, .2, STEEL);
        return merge([deck(path, o, .8, 0, CONCRETE, STONE, 1.05, { step: 3 }), s.mesh()]);
    },
};

/** pier from the ground (a bit under) to the deck bottom */
function pier(s: Soup, a: { p: Vec3; dir: [number, number] }, o: BridgeOptions, across: number, alongSize: number, col: RGB) {
    const g = o.ground(a.p[0], a.p[2]) - 1, top = a.p[1] - .5;
    if (top - g < .3) return;
    s.block([a.p[0], g, a.p[2]], a.dir, [alongSize, top - g, across], col);
}
