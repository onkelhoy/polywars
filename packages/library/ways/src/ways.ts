import { merge, sweep, type Profile } from "@polywar/sweep";
import { track } from "@polywar/rail";
import { PORTAL, bridge, bridgeFor, fence, portal, steps } from "@polywar/bridges";
import { junctionPads } from "./junctions";
import type { ClassStyle, Mesh, Structure, Vec3, WaysInput, WaysResult } from "./types";

/** paths steeper than this (rise / run) get steps */
export const STEEP = .3;
const strip = (top: [number, number, number], side: [number, number, number], edge = 1.12): Profile => ({ points: [[-edge, -.3], [-1, 0], [1, 0], [edge, -.3]], colors: [side, top, side] });

/** surface per class (1940s): concrete slabs on highways, gravel roads, dirt lanes; paths have no surface (ground only) */
export const STYLES: Record<string, ClassStyle> = {
    highway: { profile: strip([.62, .61, .58], [.42, .4, .36]), step: 4, lift: .15, bands: { every: 6, shade: .08 } },
    road: { profile: strip([.55, .5, .43], [.4, .36, .3]), step: 4, lift: .12 },
    lane: { profile: strip([.47, .38, .28], [.38, .31, .23]), step: 3, lift: .1 },
    path: { profile: null, step: 2, lift: 0 },
    rail: { profile: null, step: 4, lift: 0 },
};

/**
 * A road network to meshes: surfaces per class (sweeps), rail tracks (ballast + rails, sleepers as instances),
 * bridges on bridge spans, portals at tunnel mouths, boardwalks where trails cross wet ground. Pure: one merged mesh.
 */
export function buildWays(input: WaysInput, styles: Record<string, ClassStyle> = STYLES): WaysResult {
    const meshes: Mesh[] = [], sleepers: { data: Float32Array; count: number }[] = [], structures: Structure[] = [], ground = input.ground;
    // paths have no surface; only where they get very steep: stone steps + a railing on one side
    const stairs = (part: Vec3[], width: number) => {
        const pts = part.map(([x, , z]) => [x, ground(x, z), z] as Vec3);
        let a = -1;
        for (let i = 1; i <= pts.length; i++)
        {
            const steep = i < pts.length && Math.abs(pts[i][1] - pts[i - 1][1]) / (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]) || 1) > STEEP;
            if (steep) { if (a < 0) a = i - 1; continue; }
            if (a >= 0 && i - a >= 2)
            {
                const run = pts.slice(a, i);
                meshes.push(steps(run, Math.max(1.2, width)));
                const d = (k: number) => { const p = run[Math.min(k + 1, run.length - 1)], q = run[Math.max(0, k - 1)], l = Math.hypot(p[0] - q[0], p[2] - q[2]) || 1; return [-(p[2] - q[2]) / l, (p[0] - q[0]) / l]; };
                meshes.push(fence(run.map((p, k) => { const [ox, oz] = d(k), x = p[0] + ox * (width / 2 + .4), z = p[2] + oz * (width / 2 + .4); return [x, ground(x, z), z] as Vec3; })));
                structures.push({ kind: "steps", road: road.id, x: run[0][0], y: run[0][1], z: run[0][2], to: run[run.length - 1] });
            }
            a = -1;
        }
    };
    let road!: WaysInput["roads"][0];
    const lay = (pts: Vec3[]) => { const t = track(pts); meshes.push(t.lods[0]); sleepers.push(t.sleepers); };
    for (road of input.roads)
    {
        const style = styles[road.class] ?? styles.road, rail = road.class === "rail", trail = road.class === "path" || road.class === "lane";
        const spans = road.spans.length ? road.spans : [{ kind: "ground", from: 0, to: road.points.length - 1 }];
        for (const span of spans)
        {
            if (span.to - span.from < 1) continue;
            const raw = road.points.slice(span.from, span.to + 1).map(p => [p[0], p[1], p[2]] as Vec3);
            if (span.kind === "bridge")
            {
                const b = bridgeFor(road.class, raw, { width: road.width, ground, use: rail ? "rail" : road.class === "path" ? "path" : "road" });
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
                    meshes.push(portal(a, [b[0] - a[0], b[2] - a[2]], { ...size, width: Math.max(size.width, road.width + 2) }));
                    structures.push({ kind: "portal", road: road.id, x: a[0], y: a[1], z: a[2], to: b });
                }
                if (rail) lay(raw);
                continue;
            }
            const surface = (part: Vec3[]) => {
                if (part.length < 2) return;
                const pts = part.map(([x, y, z]) => [x, Math.max(y, ground(x, z)) + style.lift, z] as Vec3);
                if (rail) lay(pts);
                else if (!style.profile && road.class === "path") stairs(part, road.width);
                else if (style.profile) meshes.push(sweep(pts, { width: road.width, profile: style.profile, bank: { max: .04, gain: 4 }, step: style.step, bands: style.bands }));
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
