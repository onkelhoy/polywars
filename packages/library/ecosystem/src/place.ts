import { Random } from "@papit/random";
import { fbm, simplex } from "@polywar/noise";
import type { Cover } from "./cover";
import { GRASS_MODE, PropHash } from "./hash";
import { bilinear, near, sample, smoothstep } from "./sample";
import { STRIDE, type Batch, type EcosystemOptions, type Family, type Ground, type Group, type NatureList } from "./types";

/** ground a prop hides, times its radius, by kind (a tree only its trunk) */
const SOLID: Record<string, number> = { tree: .18, rock: .85, cactus: .5, bush: .6, deadwood: .5, plant: .4, flower: .3, grass: .3, water: .5, crop: .3 };

export type Placed = { batches: Batch[]; hash: PropHash; counts: Record<string, number> };

/** families a group picks */
export function select(list: NatureList, group: Group): Family[] {
    const { kind, tags, not } = group.select, kinds = kind === undefined ? null : [kind].flat();
    return list.families.filter(f => (!kinds || kinds.includes(f.kind)) && (!tags || tags.some(t => f.tags.includes(t))) && !(not ?? []).some(t => f.tags.includes(t)));
}

/**
 * Seeded placement, group by group (layer order): a jittered grid as fine as the densest spot, each point kept with
 * the chance the cover map gives (times clumping noise), then the family's slope, water and the room of props placed before.
 */
export function place(g: Ground, c: Cover, list: NatureList, o: EcosystemOptions): Placed {
    const hash = new PropHash(6), batches = new Map<string, { b: Batch; list: number[] }>(), counts: Record<string, number> = {};
    const root = new Random(o.seed);
    const autumn = simplex(root.fork("autumn").uint());
    const rockSlope = g.rockSlope ?? .55;
    const names = Object.keys(o.groups).sort((a, b) => o.groups[a].layer - o.groups[b].layer);
    names.forEach(name => {
        const gr = o.groups[name], map = c.groups[name], families = select(list, gr);
        counts[name] = 0;
        let top = 0;
        for (const v of map) top = Math.max(top, v);
        const boost = Math.max(1, gr.core?.density ?? 1), dmax = top * o.density / 1e4 * boost;
        if (dmax <= 0 || !families.length) return;
        const gi = names.indexOf(name), rng = root.fork(name), clump = simplex(rng.uint());
        const step = 1 / Math.sqrt(dmax), n = Math.ceil(g.size / step), half = g.size / 2;
        let placed = 0;
        outer: for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
        {
            // always 9 draws per cell, so one rejection never shifts the others
            const x = -half + (i + rng.next()) * step, z = -half + (j + rng.next()) * step;
            const accept = rng.next(), pick = rng.next(), which = rng.next(), size = rng.next(), yaw = rng.next(), shade = rng.next(), vary = rng.next();
            if (x > half || z > half) continue;
            const deep = gr.core ? bilinear(c.core, c.m, c.size, x, z) : 0, mix = (to = 1) => 1 + (to - 1) * deep;
            const d = bilinear(map, c.m, c.size, x, z) * o.density / 1e4 / dmax * mix(gr.core?.density);
            if (d <= 0) continue;
            const k = gr.cluster.amount, cl = 1 + k * (smoothstep(-.35, .35, fbm(clump, x / gr.cluster.scale, z / gr.cluster.scale, { octaves: 2 })) * 2 - 1);
            if (accept >= d * cl) continue;

            const water = near(g, g.water, x, z);
            if (gr.floats ? (water !== 2 && water !== 3) : water !== 0) continue;
            if (gr.floats && (sample(g, g.surface, x, z) - sample(g, g.height, x, z) > 1.5 || sample(g, g.toLand, x, z) > 14)) continue;

            const biome = g.biomes[near(g, g.biome, x, z)];
            const fits = families.filter(f => f.biomes.includes(biome));
            const pool = fits.length ? fits : families.filter(f => f.biomes.length);
            if (!pool.length) continue;
            const f = pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))];
            const slope = sample(g, g.slope, x, z);
            if (!gr.floats && slope > f.slope) continue;

            const s = (f.scale[0] + (f.scale[1] - f.scale[0]) * Math.pow(size, gr.small ?? 1)) * (gr.scale ?? 1) * mix(gr.core?.scale);
            const radius = f.radius * s, solid = radius * (gr.solid ?? SOLID[f.kind] ?? .5), space = radius * gr.spacing * mix(gr.core?.spacing);
            if (!gr.floats && sample(g, g.toWater, x, z) < solid) continue;
            const blocked = hash.near(x, z, space + hash.reach, (id, dist) => hash.group[id] === gi
                ? dist < (space + hash.space[id]) / 2
                : dist < solid + hash.solid[id]);
            if (blocked) continue;

            // variant: snow when cold or on the snow cap, autumn in patches, moss where damp
            const y0 = gr.floats ? sample(g, g.surface, x, z) : g.groundAt ? g.groundAt(x, z) : sample(g, g.height, x, z);
            const t = sample(g, g.temperature, x, z), mo = sample(g, g.moisture, x, z);
            let variant: string | undefined;
            if (t < o.season.snow + (vary - .5) * .06 || (g.snowHeight !== undefined && y0 > g.snowHeight - vary * 30)) variant = "snow";
            // autumn: about `season.autumn` of the broadleaf trees, in patches (twice as likely in a patch, none between)
            else if (f.kind === "tree" && !f.tags.includes("conifer") && vary < o.season.autumn * 2 * smoothstep(-.25, .25, fbm(autumn, x / 350, z / 350, { octaves: 2 }))) variant = "autumn";
            else if ((f.kind === "rock" || f.kind === "deadwood") && (mo > .55 || biome === "forest") && vary < .7) variant = "moss";
            const models = (variant && f.variants?.[variant]) || f.models;
            const model = models[Math.min(models.length - 1, Math.floor(which * models.length))];

            // sink into slopes so the low side doesn't float
            const y = gr.floats ? y0 + .02 : y0 - Math.min(slope, rockSlope + .2) * radius * .5;
            const mode = GRASS_MODE[f.grass] ?? 0;
            hash.add(x, z, solid, space, radius, gi, mode, mode === 2 && shade < o.around.bare);

            let entry = batches.get(model);
            if (!entry) batches.set(model, entry = { b: { model, family: f.name, kind: f.kind, group: name, layer: gr.layer, data: new Float32Array(0), count: 0, radius: f.radius, height: f.height }, list: [] });
            entry.list.push(x, y, z, s, yaw * Math.PI * 2, .88 + shade * .24, f.sway, solid);
            counts[name] = ++placed;
            if (placed >= gr.max) break outer;
        }
    });
    const out: Batch[] = [];
    for (const { b, list } of batches.values()) out.push({ ...b, data: new Float32Array(list), count: list.length / STRIDE });
    return { batches: out, hash, counts };
}
