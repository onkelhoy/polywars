import { merge, resample, sweep, type Profile } from "@polywar/sweep";
import type { RailOptions, Sleepers, Track, Vec3 } from "./types";

/** the sleeper cut from `RailwayTrack_Straight` (`tools/blender/cut_rail.py`) */
export const SLEEPER_MODEL = "transport/train/rail-sleeper";
/** asset numbers: sleeper spacing, rail centres, sleeper height, how far the sleeper sits under its origin */
const ASSET = { spacing: 1.176, gauge: .88, top: .035, below: .071 };

export const DEFAULTS: RailOptions = {
    scale: 1.7,
    spacing: ASSET.spacing * 1.7,
    gauge: ASSET.gauge * 1.7,
    rail: { width: .12, height: .16 },
    sleeperTop: ASSET.top * 1.7,
    ballast: { width: 3.2, height: .35, slope: .7 },
    step: 2,
};

const STEEL: [number, number, number] = [.42, .4, .38], BALLAST: [number, number, number] = [.45, .42, .38], BALLAST_SIDE: [number, number, number] = [.36, .33, .3];

/** cross section of the ballast bed, in half widths of `width` */
function ballastProfile(o: RailOptions): Profile {
    const w = o.ballast.width / 2, s = (w + o.ballast.slope) / w, h = o.ballast.height;
    return { points: [[-s, -h * .2], [-1, h], [1, h], [s, -h * .2]], colors: [BALLAST_SIDE, BALLAST, BALLAST_SIDE] };
}

/** both rails as one profile (width = gauge): the bridge between them sits under the ballast top, unseen */
function railProfile(o: RailOptions): Profile {
    const r = o.rail.width / o.gauge, y0 = o.ballast.height + o.sleeperTop, y1 = y0 + o.rail.height, hide = o.ballast.height - .05;
    const pts: [number, number][] = [[-1 - r, y0], [-1 - r, y1], [-1 + r, y1], [-1 + r, y0], [-1 + r, hide], [1 - r, hide], [1 - r, y0], [1 - r, y1], [1 + r, y1], [1 + r, y0]];
    return { points: pts, colors: pts.slice(1).map(() => STEEL) };
}

/** sleeper instances every `spacing` m, yaw along the path, standing on the ballast top */
export function sleepers(path: Vec3[], options: Partial<RailOptions> = {}): Sleepers {
    const o = { ...DEFAULTS, ...options };
    const pts = resample(path, o.spacing).points, n = pts.length, data = new Float32Array(n * 8);
    for (let i = 0; i < n; i++)
    {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        data.set([pts[i][0], pts[i][1] + o.ballast.height + ASSET.below * o.scale, pts[i][2], o.scale, Math.atan2(-(b[2] - a[2]), b[0] - a[0]), 1, 0, 1], i * 8);
    }
    return { data, count: n };
}

/** a track along `path` (x y z = bed height): sleepers + 3 LOD meshes */
export function track(path: Vec3[], options: Partial<RailOptions> = {}): Track {
    const o = { ...DEFAULTS, ...options };
    const bank = { max: .03, gain: 3 };
    const bed = (step: number, bands?: { every: number; shade: number }) => sweep(path, { width: o.ballast.width, profile: ballastProfile(o), bank, step, bands });
    const rails = (step: number) => sweep(path, { width: o.gauge, profile: railProfile(o), bank, step });
    return {
        sleepers: sleepers(path, o),
        lods: [merge([bed(o.step), rails(o.step)]), merge([bed(o.step * 3, { every: o.spacing / 2, shade: .25 }), rails(o.step * 3)]), bed(o.step * 8)],
    };
}

/** height of the rail tops over the bed `path` y (ballast + sleeper + rail) */
export function railTop(options: Partial<RailOptions> = {}) { const o = { ...DEFAULTS, ...options }; return o.ballast.height + o.sleeperTop + o.rail.height; }

/** rails only, set into a road surface (level crossings): `path` y = the rail tops; no ballast, no sleepers */
export function inlaid(path: Vec3[], options: Partial<RailOptions> = {}) {
    const o = { ...DEFAULTS, ...options }, down = railTop(o);
    return sweep(path.map(([x, y, z]) => [x, y - down, z] as Vec3), { width: o.gauge, profile: railProfile(o), bank: { max: .03, gain: 3 }, step: o.step });
}

/** instances baked into one mesh (views, short tracks): `mesh` turned by yaw, scaled, moved (8 float instances) */
export function bake(mesh: { positions: Float32Array; normals: Float32Array; colors?: Float32Array; indices?: ArrayLike<number> }, instances: Sleepers) {
    const idx = mesh.indices ?? Array.from({ length: mesh.positions.length / 3 }, (_, i) => i), n = idx.length;
    const positions = new Float32Array(n * 3 * instances.count), normals = new Float32Array(positions.length), colors = new Float32Array(n * 4 * instances.count);
    let v = 0;
    for (let k = 0; k < instances.count; k++)
    {
        const d = instances.data, x = d[k * 8], y = d[k * 8 + 1], z = d[k * 8 + 2], s = d[k * 8 + 3], c = Math.cos(d[k * 8 + 4]), sn = Math.sin(d[k * 8 + 4]);
        for (let t = 0; t < n; t++, v++)
        {
            const i = idx[t], px = mesh.positions[i * 3], py = mesh.positions[i * 3 + 1], pz = mesh.positions[i * 3 + 2];
            const nx = mesh.normals[i * 3], ny = mesh.normals[i * 3 + 1], nz = mesh.normals[i * 3 + 2];
            positions.set([x + (px * c + pz * sn) * s, y + py * s, z + (-px * sn + pz * c) * s], v * 3);
            normals.set([nx * c + nz * sn, ny, -nx * sn + nz * c], v * 3);
            colors.set(mesh.colors ? mesh.colors.subarray(i * 4, i * 4 + 4) : [1, 1, 1, 1], v * 4);
        }
    }
    return { positions, normals, colors, bounds: boundsOf(positions) };
}

function boundsOf(p: Float32Array) {
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let i = 0; i < p.length; i += 3) { min.x = Math.min(min.x, p[i]); min.y = Math.min(min.y, p[i + 1]); min.z = Math.min(min.z, p[i + 2]); max.x = Math.max(max.x, p[i]); max.y = Math.max(max.y, p[i + 1]); max.z = Math.max(max.z, p[i + 2]); }
    return { min, max, radius: Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2 };
}
