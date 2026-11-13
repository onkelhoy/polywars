import { merge, sweep, type Profile } from "@polywar/sweep";
import { track } from "@polywar/rail";
import { PORTAL, bridge, bridgeFor, fence, logSteps, portal, tunnel } from "@polywar/bridges";
import { junctionPads, trimAtPads } from "./junctions";
import type { ClassStyle, Mesh, Structure, Vec3, WaysInput, WaysResult } from "./types";

/** paths steeper than this (rise / run, over a few metres) get log steps; only such hot spots, never near roads */
export const STEEP = .55;
/** metres a trail must stay steep to get steps */
const STEEP_RUN = 8;
/** surface + a skirt down each side (reads as a bank on fills, hidden in the ground on cuts) */
const strip = (top: [number, number, number], side: [number, number, number], edge = 1.35): Profile => ({ points: [[-edge, -1.2], [-1, 0], [1, 0], [edge, -1.2]], colors: [side, top, side] });

/** surface per class (1940s): concrete slabs on highways, gravel roads, dirt lanes; paths have no surface (ground only) */
export const STYLES: Record<string, ClassStyle> = {
    highway: { profile: strip([.62, .61, .58], [.42, .4, .36]), step: 4, lift: .15, bands: { every: 6, shade: .08 } },
    road: { profile: strip([.55, .5, .43], [.4, .36, .3]), step: 4, lift: .12 },
    lane: { profile: strip([.47, .38, .28], [.38, .31, .23]), step: 3, lift: .1 },
    path: { profile: null, step: 2, lift: 0 },
    rail: { profile: null, step: 4, lift: 0 },
};

/**
 * Roads of one chain (`chain` id, consecutive, each starting where the last ended) joined into one way, so a road
 * going on through junctions is one sweep (no seams, no overlapping ends).
 */
export function chains<W extends WaysInput["roads"][0]>(roads: W[]): W[] {
    const out: W[] = [];
    for (const r of roads)
    {
        const last = out[out.length - 1], a = last?.points[last.points.length - 1], b = r.points[0];
        if (last && last.chain !== undefined && last.chain === r.chain && last.class === r.class && Math.hypot(a[0] - b[0], a[2] - b[2]) < .01)
        {
            const off = last.points.length - 1;
            last.points = [...last.points, ...r.points.slice(1)];
            const spans = last.spans.length ? last.spans : [{ kind: "ground", from: 0, to: off }];
            last.spans = [...spans, ...(r.spans.length ? r.spans : [{ kind: "ground", from: 0, to: r.points.length - 1 }]).map(s => ({ ...s, from: s.from + off, to: s.to + off }))]
                .reduce<W["spans"]>((o, s) => { const p = o[o.length - 1]; if (p && p.kind === s.kind && p.to >= s.from) p.to = Math.max(p.to, s.to); else o.push({ ...s }); return o; }, []);
            continue;
        }
        out.push({ ...r, points: r.points.slice(), spans: r.spans.map(s => ({ ...s })) });
    }
    return out;
}

/**
 * A road network to meshes: surfaces per class (sweeps), rail tracks (ballast + rails, sleepers as instances),
 * bridges on bridge spans, portals at tunnel mouths, boardwalks where trails cross wet ground. Pure: one merged mesh.
 */
export function buildWays(input: WaysInput, styles: Record<string, ClassStyle> = STYLES): WaysResult {
    const meshes: Mesh[] = [], sleepers: { data: Float32Array; count: number }[] = [], structures: Structure[] = [], ground = input.ground;
    // other ways (not trails): no steps next to them (their banks make the ground look steep)
    const B = 16, near = new Set<number>(), key = (x: number, z: number) => (Math.floor(x / B) + 4096) * 8192 + Math.floor(z / B) + 4096;
    for (const r of input.roads) if (r.class !== "path") for (const p of r.points) near.add(key(p[0], p[2]));
    const byRoad = (x: number, z: number) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (near.has(key(x + a * B, z + b * B))) return true; return false; };
    // paths have no surface; only very steep stretches get log steps
    const stairs = (part: Vec3[], width: number) => {
        const pts = part.map(([x, , z]) => [x, ground(x, z), z] as Vec3), n = pts.length;
        const len = (i: number) => Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]) || 1;
        const steep = pts.map((_, i) => i > 0 && Math.abs(pts[i][1] - pts[i - 1][1]) / len(i) > STEEP && !byRoad(pts[i][0], pts[i][2]));
        for (let i = 1; i < n;)
        {
            if (!steep[i]) { i++; continue; }
            let e = i;
            while (e + 1 < n && steep[e + 1]) e++;
            const a = i - 1, run = pts.slice(a, e + 1);
            let l = 0; for (let k = a + 1; k <= e; k++) l += len(k);
            i = e + 1;
            if (l < STEEP_RUN) continue;
            meshes.push(logSteps(run, ground, Math.max(1.2, width)));
            // railings over drops come from the trail furniture (`@polywar/trails` fences), one side only
            structures.push({ kind: "steps", road: road.id, x: run[0][0], y: run[0][1], z: run[0][2], to: run[run.length - 1] });
        }
    };
    let road!: WaysInput["roads"][0];
    // junctions out on bridge decks: ways joining from the side open the parapet / truss there
    const wayById = new Map(input.roads.map(r => [r.id, r]));
    const bridged = (r: WaysInput["roads"][0], j: { x: number; z: number }) => {
        const P = r.points, start = Math.hypot(P[0][0] - j.x, P[0][2] - j.z) < .5, end = Math.hypot(P[P.length - 1][0] - j.x, P[P.length - 1][2] - j.z) < .5;
        return (start && r.spans.some(s => s.kind === "bridge" && s.from === 0)) || (end && r.spans.some(s => s.kind === "bridge" && s.to === P.length - 1));
    };
    const deckJunctions = (input.junctions ?? []).map(j => ({ j, decks: j.roads.map(a => wayById.get(a.road)!).filter(r => r && bridged(r, j)) })).filter(x => x.decks.length);
    /** another chain's deck through a junction at (x, z): its half width (+ parapet), else 0 */
    const deckAt = (x: number, z: number, chain?: number) => {
        for (const { j, decks } of deckJunctions) if (Math.hypot(j.x - x, j.z - z) < .5)
        {
            const through = decks.filter(r => chain === undefined || r.chain !== chain);
            if (through.length >= 2) return Math.max(...through.map(r => r.width)) / 2 + .6;
        }
        return 0;
    };
    const joins = (deck: Vec3[], chain?: number) => {
        const gaps: { from: number; to: number; side: -1 | 1 }[] = [];
        let d = 0;
        for (let i = 1; i < deck.length - 1; i++)
        {
            d += Math.hypot(deck[i][0] - deck[i - 1][0], deck[i][2] - deck[i - 1][2]);
            for (const j of input.junctions ?? [])
            {
                if (Math.hypot(j.x - deck[i][0], j.z - deck[i][2]) > .5) continue;
                const l = Math.hypot(deck[i + 1][0] - deck[i - 1][0], deck[i + 1][2] - deck[i - 1][2]) || 1, fx = (deck[i + 1][0] - deck[i - 1][0]) / l, fz = (deck[i + 1][2] - deck[i - 1][2]) / l;
                for (const a of j.roads)
                {
                    const r = wayById.get(a.road);
                    if (!r || (chain !== undefined && r.chain === chain)) continue;
                    const ux = Math.cos(a.angle), uz = Math.sin(a.angle), along = ux * fx + uz * fz, across = -ux * fz + uz * fx;
                    if (Math.abs(along) > .9) continue;
                    const half = (r.width / 2 + 1.5) / Math.max(.4, Math.abs(across));
                    gaps.push({ from: d - half, to: d + half, side: across > 0 ? 1 : -1 });
                }
            }
        }
        return gaps;
    };
    // tunnel mouths out in the open (x, z): a tunnel end where no other way's tunnel ends too
    const mouths: [number, number][] = [];
    for (const r of input.roads) for (const sp of r.spans) if (sp.kind === "tunnel") for (const i of [sp.from, sp.to])
    {
        const p = r.points[i];
        if (!input.roads.some(o => o !== r && o.spans.some(t => t.kind === "tunnel" && [t.from, t.to].some(k => Math.hypot(o.points[k][0] - p[0], o.points[k][2] - p[2]) < .5)))) mouths.push([p[0], p[2]]);
    }
    const lay = (pts: Vec3[]) => { const t = track(pts); meshes.push(t.lods[0]); sleepers.push(t.sleepers); };
    for (road of chains(input.junctions ? trimAtPads(input.junctions, input.roads, styles) : input.roads))
    {
        const style = styles[road.class] ?? styles.road, rail = road.class === "rail", trail = road.class === "path" || road.class === "lane";
        const spans = road.spans.length ? road.spans : [{ kind: "ground", from: 0, to: road.points.length - 1 }];
        for (const span of spans)
        {
            if (span.to - span.from < 1) continue;
            const raw = road.points.slice(span.from, span.to + 1).map(p => [p[0], p[1], p[2]] as Vec3);
            if (span.kind === "bridge")
            {
                // deck top = the road surface it continues (same lift), so road and deck meet flush
                let deck = raw.map(([x, y, z], i) => [x, (i === 0 || i === raw.length - 1 ? Math.max(y, ground(x, z)) : y) + style.lift, z] as Vec3);
                // a deck starting on another bridge's deck (junction out on a bridge): starts at that deck's edge
                for (const end of [0, 1])
                {
                    const p = end ? deck[deck.length - 1] : deck[0], other = deckAt(p[0], p[2], road.chain);
                    if (!other || deck.length < 3) continue;
                    const list = end ? deck.slice().reverse() : deck;
                    let i = 1;
                    while (i < list.length - 1 && Math.hypot(list[i][0] - p[0], list[i][2] - p[2]) < other) i++;
                    const kept = list.slice(i - 1);
                    deck = end ? kept.reverse() : kept;
                }
                const b = bridgeFor(road.class, deck, { width: road.width, ground, use: rail ? "rail" : road.class === "path" ? "path" : "road", gaps: joins(deck, road.chain) });
                meshes.push(b.mesh);
                structures.push({ kind: `bridge-${b.type}`, road: road.id, x: raw[0][0], y: raw[0][1], z: raw[0][2], to: raw[raw.length - 1] });
                if (rail) lay(raw);
                continue;
            }
            if (span.kind === "tunnel")
            {
                const size = PORTAL[rail ? "rail" : road.class === "highway" || road.class === "road" ? "road" : "lane"];
                for (const [a, b] of [[raw[0], raw[1]], [raw[raw.length - 1], raw[raw.length - 2]]])
                {
                    // face + hood top meet the ground the terrain hook (`tunnelHoles`, cover 2 m) set behind the face
                    const w = Math.max(size.width, road.width + 2);
                    // an end meeting another tunnel underground (through a junction): no portal
                    if (!mouths.some(m => Math.hypot(m[0] - a[0], m[1] - a[2]) < .5)) continue;
                    meshes.push(portal(a, [b[0] - a[0], b[2] - a[2]], { ...size, width: w, depth: 0, apron: 4, hood: 8, top: size.height + 1.8 }));
                    structures.push({ kind: "portal", road: road.id, x: a[0], y: a[1], z: a[2], to: b });
                }
                // the tube all the way through, the road (or track) on its floor
                meshes.push(tunnel(raw, { width: Math.max(size.width, road.width + 2), height: size.height, walkway: road.class === "path" ? .4 : .8 }));
                const floor = raw.map(([x, y, z]) => [x, y + style.lift, z] as Vec3);
                if (rail) lay(raw);
                else if (style.profile) meshes.push(sweep(floor, { width: road.width, profile: style.profile, bank: { max: 0, gain: 0 }, step: style.step, bands: style.bands }));
                continue;
            }
            const surface = (part: Vec3[]) => {
                if (part.length < 2) return;
                // on the graded line, lifted over the ground only away from tunnel mouths (the hill right over a mouth
                // would pull the approach up into the opening)
                const pts = part.map(([x, y, z]) => [x, (mouths.some(m => Math.hypot(m[0] - x, m[1] - z) < 16) ? y : Math.max(y, ground(x, z))) + style.lift, z] as Vec3);
                if (rail) lay(pts);
                else if (!style.profile && road.class === "path") stairs(part, road.width);
                else if (style.profile) meshes.push(sweep(pts, { width: road.width, profile: style.profile, bank: { max: .015, gain: 4 }, step: style.step, bands: style.bands, caps: true }));
            };
            if (!trail || !input.wet) { surface(raw); continue; }
            // trails over wet ground: boardwalk runs
            const wet = raw.map(([x, , z]) => input.wet!(x, z));
            let a = 0;
            for (let i = 0; i <= raw.length; i++)
            {
                if (i < raw.length && wet[i] === wet[a]) continue;
                const part = raw.slice(Math.max(0, a - 1), Math.min(raw.length, i + 1));
                if (wet[a] && part.length >= 3)
                {
                    const deck = part.map(([x, y, z]) => [x, Math.max(y, input.wet!(x, z) ? (input.surface?.(x, z) ?? ground(x, z)) + .5 : ground(x, z) + .3), z] as Vec3);
                    meshes.push(bridge("foot-wood", deck, { width: Math.max(1.6, road.width), ground, use: "path" }));
                    structures.push({ kind: "boardwalk", road: road.id, x: deck[0][0], y: deck[0][1], z: deck[0][2], to: deck[deck.length - 1] });
                }
                else surface(part);
                a = i;
            }
        }
    }
    if (input.junctions) { const pads = junctionPads(input.junctions, input.roads, ground, styles); if (pads) meshes.push(pads); }
    const count = sleepers.reduce((n, s) => n + s.count, 0), data = new Float32Array(count * 8);
    let at = 0;
    for (const s of sleepers) { data.set(s.data.subarray(0, s.count * 8), at); at += s.count * 8; }
    return { mesh: meshes.length ? merge(meshes) : undefined, sleepers: { data, count }, structures };
}
