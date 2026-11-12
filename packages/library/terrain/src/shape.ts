import { Random } from "@papit/random";
import { fbm, ridged, simplex, warp } from "@polywar/noise";
import type { Pace } from "./pace";
import type { Resolved } from "./presets";

export type Shape = { h: Float32Array; plateau: Float32Array };

/** fbm * .5 + .5 mostly sits in .2 .. .8: coverage 0..1 to a mask threshold there */
const threshold = (coverage: number) => .8 - coverage * .6;
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };

/**
 * Raw heights 0..1 (below 0 under the sea edge) on `n`² nodes: warped base, hills, ridged ranges,
 * plateaus, then the edge fade into ocean or far fields.
 */
export async function shape(o: Resolved, n: number, pace: Pace): Promise<Shape> {
    const rng = new Random(o.seed);
    const noise = (key: string) => simplex(rng.fork(key).uint());
    const nBase = noise("base"), nWarp = noise("warp"), nHills = noise("hills"), nMask = noise("mountain-mask"),
        nRidge = noise("ridge"), nPlateau = noise("plateau"), nEdge = noise("edge");
    const { base, hills, mountains: m, plateaus: p, edge, size } = o;
    const h = new Float32Array(n * n), plateau = new Float32Array(n * n);
    const dir = edge.direction * Math.PI / 180, dx = Math.cos(dir), dz = Math.sin(dir);

    pace.begin("shape");
    for (let j = 0; j < n; j++)
    {
        await pace.tick(j / n);
        for (let i = 0; i < n; i++)
        {
            const u = i / (n - 1) * 2 - 1, v = j / (n - 1) * 2 - 1;
            const x = u * size / 2, z = v * size / 2;
            const [wx, wz] = warp(nWarp, x / base.scale, z / base.scale, base.warp, { octaves: 3 });
            let y = (fbm(nBase, wx, wz, base) * .5 + .5) * base.height;

            const mask = smoothstep(threshold(m.coverage) - .08, threshold(m.coverage) + .08, fbm(nMask, x / m.scale, z / m.scale, { octaves: 3 }) * .5 + .5);
            y += (fbm(nHills, x / hills.scale, z / hills.scale, { octaves: 4 }) * .5 + .5) * hills.height * (1 - mask * .6);
            if (mask > 0)
            {
                const rs = base.scale / m.ridge;
                y += mask * ridged(nRidge, wx * rs, wz * rs, { octaves: m.octaves, sharpness: m.sharpness }) * m.height;
            }

            if (p.coverage > 0)
            {
                const pm = smoothstep(threshold(p.coverage) - p.sharpness, threshold(p.coverage) + p.sharpness, fbm(nPlateau, x / p.scale + 31, z / p.scale, { octaves: 3 }) * .5 + .5);
                if (pm > 0)
                {
                    // flat top at `level` (a little of the ground shows through), or terraces `level / steps` apart
                    const top = p.steps > 0 ? Math.ceil(y / p.level * p.steps) / p.steps * p.level : Math.max(y, p.level + (y - base.height * .5) * .15);
                    y += (top - y) * pm;
                }
                plateau[j * n + i] = pm;
            }

            if (edge.type !== "none")
            {
                let d = edge.shape === "round" ? Math.hypot(u, v) : edge.shape === "square" ? Math.max(Math.abs(u), Math.abs(v)) : (u * dx + v * dz) * .5 + .5;
                d += fbm(nEdge, x / (size * .15), z / (size * .15), { octaves: 4 }) * edge.noise * .25;
                const f = smoothstep(1 - edge.width, 1, d);
                const target = edge.type === "ocean" ? -.12 : edge.level;
                y += (target - y) * f;
            }
            h[j * n + i] = y;
        }
    }
    return { h, plateau };
}
