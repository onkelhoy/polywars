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
                const deck = raw.map(([x, y, z], i) => [x, (i === 0 || i === raw.length - 1 ? Math.max(y, ground(x, z)) : y) + style.lift, z] as Vec3);
                const b = bridgeFor(road.class, deck, { width: road.width, ground, use: rail ? "rail" : road.class === "path" ? "path" : "road" });
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
                    // a mouth deep under the hill (the tunnel goes on through a junction underground): no portal
                    if (ground(a[0], a[2]) - a[1] > size.height + 6) continue;
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
                const pts = part.map(([x, y, z]) => [x, Math.max(y, ground(x, z)) + style.lift, z] as Vec3);
                if (rail) lay(pts);
                else if (!style.profile && road.class === "path") stairs(part, road.width);
                else if (style.profile) meshes.push(sweep(pts, { width: road.width, profile: style.profile, bank: { max: .015, gain: 4 }, step: style.step, bands: style.bands }));
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
