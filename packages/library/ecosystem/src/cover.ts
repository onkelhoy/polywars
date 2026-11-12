import { band, clamp01, near, sample, smoothstep } from "./sample";
import type { EcosystemOptions, Ground } from "./types";

/**
 * Cover maps on an `m`² grid over the map (coarser than the terrain), biome borders blended.
 * Grass: density 0..1, height (times), dry 0..1, flowers 0..1. Groups: props per hectare (climate and water reach applied).
 */
export type Cover = {
    m: number;
    size: number;
    density: Float32Array;
    height: Float32Array;
    dry: Float32Array;
    flowers: Float32Array;
    /** share of open dry spots 0..1 */
    open: Float32Array;
    groups: Record<string, Float32Array>;
    /** every tree group summed, per hectare */
    trees: Float32Array;
    /** depth into a core biome 0 (border) .. 1 */
    core: Float32Array;
};

export function cover(g: Ground, o: EcosystemOptions): Cover {
    const m = Math.max(2, Math.min(g.n, Math.round(o.cover.resolution) + 1)), cell = g.size / (m - 1), count = m * m;
    const grass = { density: new Float32Array(count), height: new Float32Array(count), dry: new Float32Array(count), flowers: new Float32Array(count), open: new Float32Array(count) };
    const names = Object.keys(o.groups);
    const groups: Record<string, Float32Array> = Object.fromEntries(names.map(n => [n, new Float32Array(count)]));
    for (let j = 0, k = 0; j < m; j++) for (let i = 0; i < m; i++, k++)
    {
        const x = -g.size / 2 + i * cell, z = -g.size / 2 + j * cell;
        const biome = g.biomes[near(g, g.biome, x, z)], rule = o.biomes[biome];
        if (!rule) continue;
        const t = sample(g, g.temperature, x, z), mo = sample(g, g.moisture, x, z), flow = sample(g, g.flow, x, z), toWater = sample(g, g.toWater, x, z);
        grass.density[k] = rule.grass.density;
        grass.height[k] = rule.grass.height * (.75 + mo * .5) * (1 + Math.min(1, flow) * .6);
        grass.dry[k] = clamp01(rule.grass.dry + (.45 - mo) * .6);
        grass.flowers[k] = rule.grass.flowers;
        grass.open[k] = rule.open ?? 0;
        for (const name of names)
        {
            const per = rule.props[name];
            if (!per) continue;
            const gr = o.groups[name];
            const reach = gr.water ? 1 - smoothstep(gr.water * .3, gr.water, toWater) : 1;
            groups[name][k] = per * band(t, gr.temperature) * band(mo, gr.moisture) * reach;
        }
    }
    // core depth: core biome share blurred over `reach`, 0 at its border
    const core = new Float32Array(count), cores = new Set(o.core.biomes);
    for (let j = 0, k = 0; j < m; j++) for (let i = 0; i < m; i++, k++) core[k] = cores.has(g.biomes[near(g, g.biome, -g.size / 2 + i * cell, -g.size / 2 + j * cell)]) ? 1 : 0;
    blur(core, m, Math.max(0, Math.round(o.core.reach / cell / 2)));
    for (let k = 0; k < count; k++) core[k] = smoothstep(.5, .9, core[k]);

    const r = Math.max(0, Math.round(o.cover.blend / cell / 2));
    for (const map of [...Object.values(grass), ...Object.values(groups)]) blur(map, m, r);

    // towns: cleared of props, short sparse grass
    for (const c of g.cities)
    {
        const reach = c.radius * o.cities.clear * 1.3;
        const i0 = Math.max(0, Math.floor((c.x - reach + g.size / 2) / cell)), i1 = Math.min(m - 1, Math.ceil((c.x + reach + g.size / 2) / cell));
        const j0 = Math.max(0, Math.floor((c.z - reach + g.size / 2) / cell)), j1 = Math.min(m - 1, Math.ceil((c.z + reach + g.size / 2) / cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        {
            const k = j * m + i, d = Math.hypot(-g.size / 2 + i * cell - c.x, -g.size / 2 + j * cell - c.z);
            const f = smoothstep(c.radius * o.cities.clear * .7, reach, d);
            for (const name of names) groups[name][k] *= f;
            grass.density[k] *= o.cities.grass + (1 - o.cities.grass) * f;
            grass.height[k] *= o.cities.height + (1 - o.cities.height) * f;
            grass.flowers[k] *= f;
        }
    }

    const trees = new Float32Array(count);
    for (const name of names) if (o.groups[name].layer === 0) groups[name].forEach((v, k) => trees[k] += v);
    return { m, size: g.size, ...grass, groups, trees, core };
}

/** box blur of radius `r` nodes, twice (close to a gaussian), edges clamped */
function blur(map: Float32Array, m: number, r: number) {
    if (r < 1) return;
    const tmp = new Float32Array(m), w = 2 * r + 1;
    for (let pass = 0; pass < 2; pass++) for (let axis = 0; axis < 2; axis++) for (let line = 0; line < m; line++)
    {
        const at = (i: number) => axis === 0 ? line * m + Math.min(m - 1, Math.max(0, i)) : Math.min(m - 1, Math.max(0, i)) * m + line;
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += map[at(i)];
        for (let i = 0; i < m; i++)
        {
            tmp[i] = sum / w;
            sum += map[at(i + r + 1)] - map[at(i - r)];
        }
        for (let i = 0; i < m; i++) map[at(i)] = tmp[i];
    }
}
