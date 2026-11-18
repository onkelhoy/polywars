import { castBox, castGround, nearest, type Cast, type Hit } from "@polywar/ballistics";
import type { RangeData, Solid, Stand, Target, Vec3 } from "./types";

const CELL = 4;
const key = (i: number, j: number) => i * 65536 + j;

/**
 * The shooting range as data: ground height, solid boxes (mover colliders, a grid lookup) and a bullet `cast`
 * (ground + every box, hits carry the surface and the scored target). Drawing the model is the host's: `model` is its url.
 */
export class ShootingRange {
    readonly solids: Solid[];
    readonly targets: Target[];
    readonly stands: Stand[];
    readonly spawn: Vec3;
    /** solids per CELL x CELL column */
    private grid = new Map<number, Solid[]>();
    private targetOf = new Map<string, Target>();

    /** loads `range.json` from `base` (default the package asset `/shooting-range/`); the model is `${base}model.glb` */
    static async load(base = "/shooting-range/") {
        const data: RangeData = await (await fetch(`${base}range.json`)).json();
        return new ShootingRange(data, `${base}model.glb`);
    }

    constructor(readonly data: RangeData, readonly model = "") {
        this.solids = data.solids.map(s => ({ kind: "box", ...s }));
        this.targets = data.targets;
        this.stands = data.stands;
        this.spawn = data.spawn;
        for (const t of this.targets) this.targetOf.set(t.name, t);
        for (const tri of data.ground)
        {
            const xs = tri.map(p => p[0]), zs = tri.map(p => p[2]);
            for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++)
                for (let j = Math.floor(Math.min(...zs) / CELL); j <= Math.floor(Math.max(...zs) / CELL); j++)
                {
                    const k = key(i, j);
                    if (!this.groundGrid.has(k)) this.groundGrid.set(k, []);
                    this.groundGrid.get(k)!.push(tri);
                }
        }
        for (const s of this.solids)
            for (let i = Math.floor(s.min[0] / CELL); i <= Math.floor(s.max[0] / CELL); i++)
                for (let j = Math.floor(s.min[2] / CELL); j <= Math.floor(s.max[2] / CELL); j++)
                {
                    const k = key(i, j);
                    if (!this.grid.has(k)) this.grid.set(k, []);
                    this.grid.get(k)!.push(s);
                }
    }

    /** ground triangles per cell (the ground is a big mesh) */
    private groundGrid = new Map<number, [Vec3, Vec3, Vec3][]>();

    /** the ground's height at x / z (highest triangle there), 0 off it */
    ground = (x: number, z: number) => {
        let best = -Infinity;
        for (const [a, b, c] of this.groundGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [])
        {
            const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
            if (Math.abs(d) < 1e-9) continue;
            const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
            const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
            if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
            best = Math.max(best, u * a[1] + v * b[1] + (1 - u - v) * c[1]);
        }
        return best === -Infinity ? 0 : best;
    };

    /** solids near x / z (the mover's `colliders`) */
    colliders = (x: number, z: number): Solid[] => this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];

    /** solids whose cells the segment's box touches */
    private near(from: Vec3, to: Vec3) {
        const i0 = Math.floor(Math.min(from[0], to[0]) / CELL), i1 = Math.floor(Math.max(from[0], to[0]) / CELL);
        const j0 = Math.floor(Math.min(from[2], to[2]) / CELL), j1 = Math.floor(Math.max(from[2], to[2]) / CELL);
        if ((i1 - i0 + 1) * (j1 - j0 + 1) > 256) return this.solids;
        const out = new Set<Solid>();
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const s of this.grid.get(key(i, j)) ?? []) out.add(s);
        return out;
    }

    /** bullets: the ground and every solid; `hit.target` is the scored `Target` when a target's box was hit */
    cast: Cast = nearest(
        (from, to) => castGround(this.ground, from, to, 1.5, "dirt"),
        (from, to) => {
            let best: Hit | null = null;
            for (const s of this.near(from, to))
            {
                const hit = castBox(s.min, s.max, from, to);
                if (!hit || (best && hit.t >= best.t)) continue;
                hit.surface = s.surface;
                hit.target = this.targetOf.get(s.name);
                best = hit;
            }
            return best;
        },
    );

    /** what a case lands on at a point: the box under it, else the ground */
    surface = ([x, y, z]: Vec3) => {
        const s = this.colliders(x, z).find(s => x >= s.min[0] - .05 && x <= s.max[0] + .05 && z >= s.min[2] - .05 && z <= s.max[2] + .05 && y >= s.max[1] - .1 && y <= s.max[1] + .3);
        return s ? (s.surface === "flesh" ? "dirt" : s.surface) : "stone";
    };

    /** the nearest stand within `reach` of x / z, or -1 */
    standNear(x: number, z: number, reach = 1.6) {
        let best = -1, d = reach;
        this.stands.forEach((s, i) => { const e = Math.hypot(s.at[0] - x, s.at[2] - z); if (e < d) { d = e; best = i; } });
        return best;
    }
}
