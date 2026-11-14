import { sweep, merge, type Profile } from "@polywar/sweep";
import { Soup, along, length } from "./geometry";
import type { BridgeOptions, BridgeType, Mesh, RGB, Vec3 } from "./types";

const STONE: RGB = [.55, .52, .47], STONE_DARK: RGB = [.42, .4, .36], WOOD: RGB = [.42, .3, .2], WOOD_DARK: RGB = [.3, .21, .14], STEEL: RGB = [.3, .32, .33], CONCRETE: RGB = [.6, .59, .56];

export const DEFAULTS: BridgeOptions = { width: 6, ground: () => 0, use: "road" };

/** what bridge fits: class of the road / rail, span (m) and height over the ground (m) */
export function pick(cls: string, span: number, height: number): BridgeType {
    // small ways: short and low (wood footbridges, stone slabs / arches), never tall timber trestles
    if (cls === "path") return height > 6 ? "arch-stone" : "foot-wood";
    // a truss needs length: short spans (a few metres at a junction, high up) are stone, never a lone truss frame
    if (cls === "rail") return height > 20 && span >= 50 && span <= 220 ? "arch-concrete" : span >= 30 && (span > 160 || height > 35) ? "girder" : span < 70 && height > 4 ? "arch-stone" : "trestle-wood";
    if (cls === "lane") return height < 4 ? "slab-stone" : "arch-stone";
    // tall crossings: one concrete arch under the deck (open spandrels), very long ones a girder
    if (height > 20 && span >= 50 && span <= 260) return "arch-concrete";
    if (span >= 30 && (span > 140 || height > 30)) return "girder";
    return height < 4 ? "slab-stone" : "arch-stone";
}

type Station = ReturnType<typeof along>[0];
/** a support `r` m round may stand at station `a` */
const free = (o: BridgeOptions, a: Station, r: number) => !o.free || o.free(a.p[0], a.p[2], r, a.p[1]);

/**
 * support stations every ~`every` m (not the ends); one that would stand on something (`o.free`) slides along the
 * deck to the nearest free spot (up to half a spacing) or is left out
 */
function supports(path: Vec3[], every: number, o: BridgeOptions, r: number): Station[] {
    const L = length(path), n = Math.max(1, Math.round(L / every)), st = along(path, L / n).slice(1, -1);
    if (!o.free) return st;
    return st.flatMap(a => {
        for (let k = 0; k <= L / n / 2; k++) for (const s of k ? [1, -1] : [1])
        {
            const d = a.d + k * s;
            if (d <= 1 || d >= L - 1) continue;
            const b = along(path, L, d)[0];
            if (b && free(o, b, r)) return [b];
        }
        return [];
    });
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
    return o.lod ? far(type, path, o) : BUILD[type](path, o);
}

/** the bridge for a road class (picks the type) */
export function bridgeFor(cls: string, path: Vec3[], options: Partial<BridgeOptions> = {}): { type: BridgeType; mesh: Mesh } {
    const o = { ...DEFAULTS, ...options }, type = pick(cls, length(path), clearance(path, o.ground));
    return { type, mesh: bridge(type, path, o) };
}

const BUILD: Record<BridgeType, (path: Vec3[], o: BridgeOptions) => Mesh> = {
    /**
     * One concrete arch springing from the valley sides (12% / 88% along), two ribs, posts up to the deck every ~6 m
     * (open spandrels), plain piers on the outer bits; deck with a low parapet.
     */
    "arch-concrete": (path, o) => {
        const s = new Soup(), L = length(path), st = along(path, Math.max(4, L / Math.round(L / 6)));
        const fa = .12, fb = .88, A = along(path, L, L * fa)[0], B = along(path, L, L * fb)[0];
        const ya = o.ground(A.p[0], A.p[2]) - 1, yb = o.ground(B.p[0], B.p[2]) - 1;
        const mid = along(path, L, L / 2)[0], apex = mid.p[1] - 1.4;
        const rib = (d: number) => { const t = (d / L - fa) / (fb - fa); return ya + (yb - ya) * t + (apex - (ya + yb) / 2) * 4 * t * (1 - t); };
        const w = o.width / 2 * .75, R = Math.max(.9, Math.min(1.8, L / 90));
        const on = (a: Station, k: number, y: number): Vec3 => [a.p[0] + a.side[0] * w * k, y, a.p[2] + a.side[1] * w * k];
        // ribs: segments along the parabola (finer than the posts)
        const fine = along(path, L / 24).filter(a => a.d >= L * fa - 1e-6 && a.d <= L * fb + 1e-6);
        for (const k of [-1, 1]) for (let i = 0; i < fine.length - 1; i++) s.beam(on(fine[i], k, rib(fine[i].d)), on(fine[i + 1], k, rib(fine[i + 1].d)), R, R * 1.3, CONCRETE);
        for (const a of st.slice(1, -1))
        {
            const inArch = a.d > L * fa && a.d < L * fb, foot = inArch ? rib(a.d) : o.ground(a.p[0], a.p[2]) - 1, top = a.p[1] - .5;
            if (top - foot < .4) continue;
            if (!inArch) { pier(s, a, o, o.width * 1.05, 1, STONE); continue; }
            for (const k of [-1, 1]) s.beam(on(a, k, foot), on(a, k, top), .5, .5, CONCRETE);
            s.beam(on(a, -1, top - .3), on(a, 1, top - .3), .4, .5, CONCRETE);
        }
        return merge([deck(path, o, .7, .9, CONCRETE, STONE, 1.08, { step: 2, bands: { every: 3, shade: .05 } }), s.mesh()]);
    },
    "foot-wood": (path, o) => {
        const s = new Soup(), w = o.width / 2;
        for (const a of along(path, 2))
        {
            for (const k of [-1, 1])
            {
                const x = a.p[0] + a.side[0] * w * k, z = a.p[2] + a.side[1] * w * k;
                s.beam([x, a.p[1] - .1, z], [x, a.p[1] + 1, z], .1, .1, WOOD_DARK);
                if (a.d % 4 < 1e-6 && (!o.free || o.free(x, z, .3, a.p[1]))) s.beam([x, o.ground(x, z) - .5, z], [x, a.p[1] - .1, z], .16, .16, WOOD_DARK);
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
        const s = new Soup();
        for (const a of supports(path, 7, o, o.width * .6)) pier(s, a, o, o.width * 1.15, 1.2, STONE_DARK);
        return merge([deck(path, o, .6, .5, STONE, STONE_DARK, 1.12, { step: 2, bands: { every: 2.5, shade: .08 } }), s.mesh()]);
    },
    "arch-stone": (path, o) => {
        const s = new Soup(), L = length(path), h = clearance(path, o.ground);
        // bays: the count nearest the ideal whose piers all stand free (none on another way), else one arch
        const ideal = Math.max(1, Math.round(L / Math.max(8, Math.min(24, h * 1.1))));
        const fits = (n: number) => along(path, L / n).slice(1, -1).every(a => free(o, a, o.width * .6 + Math.max(1.2, L / n * .14) / 2));
        let bays = 1;
        for (const d of [0, 1, -1, 2, -2, 3, -3]) if (ideal + d >= 1 && fits(ideal + d)) { bays = ideal + d; break; }
        const bay = L / bays, pierW = Math.max(1.2, bay * .14);
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
            if (!free(o, a, w * 1.3)) continue;
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
        for (const a of supports(path, 55, o, o.width * .7)) pier(s, a, o, o.width * 1.3, 3, CONCRETE);
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
            // panel i (to i + 1) drawn: not in a gap, and not a lone panel between two gaps (stray bars)
            const open = (i: number) => i < 0 || i >= panels.length - 1 || gap(k, panels[i].d, panels[i + 1].d);
            const drawn = (i: number) => !open(i) && !(open(i - 1) && open(i + 1) && (o.gaps ?? []).length > 0 && i > 0 && i < panels.length - 2);
            for (let i = 0; i < panels.length; i++)
            {
                const a = panels[i];
                if ((drawn(i - 1) || drawn(i)) && !gap(k, a.d - .5, a.d + .5)) s.beam(at(a, 0), at(a, H), .3, .3, STEEL);
                if (i === panels.length - 1) break;
                const b = panels[i + 1];
                if (!drawn(i)) continue;
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

/** far look: the deck (low parapet, few points) on plain piers; girders keep their two top chords */
function far(type: BridgeType, path: Vec3[], o: BridgeOptions): Mesh {
    const s = new Soup(), L = length(path), look: Record<BridgeType, [RGB, RGB, number, number]> = {
        "foot-wood": [WOOD_DARK, WOOD, .15, 4], "slab-stone": [STONE_DARK, STONE, .6, 7], "arch-stone": [STONE_DARK, STONE, .6, 14], "arch-concrete": [STONE, CONCRETE, .7, 12],
        "trestle-wood": [WOOD_DARK, WOOD, .5, 5], girder: [STONE, CONCRETE, .8, 55],
    };
    const [side, top, thick, every] = look[type];
    for (const a of supports(path, every, o, o.width * .6)) pier(s, a, o, o.width * 1.1, type === "girder" ? 3 : type.endsWith("wood") ? .4 : 1.2, side);
    if (type === "girder")
    {
        const H = Math.max(4, Math.min(9, L / 12)), w = o.width / 2 * 1.04, st = along(path, Math.max(8, L / 12));
        for (const k of [-1, 1]) for (let i = 0; i < st.length - 1; i++)
        {
            const a = st[i], b = st[i + 1], at = (q: typeof a): Vec3 => [q.p[0] + q.side[0] * w * k, q.p[1] + H, q.p[2] + q.side[1] * w * k];
            s.beam(at(a), at(b), .4, .4, STEEL);
        }
    }
    return merge([sweep(path, { width: o.width, profile: deckProfile(thick, type === "girder" ? 0 : .5, side, top, 1.08), bank: "flat", caps: true, step: 8 }), s.mesh()]);
}

/** pier from the ground (a bit under) to the deck bottom */
function pier(s: Soup, a: { p: Vec3; dir: [number, number] }, o: BridgeOptions, across: number, alongSize: number, col: RGB) {
    const g = o.ground(a.p[0], a.p[2]) - 1, top = a.p[1] - .5;
    if (top - g < .3) return;
    s.block([a.p[0], g, a.p[2]], a.dir, [alongSize, top - g, across], col);
}
