import { Random } from "@papit/random";
import { carveBeds, carveValleys, fillPits, limitErosion } from "./carve";
import { digLakes, fillLakes } from "./lakes";
import { plan, type Path } from "./network";
import { lakeKinds, swamps } from "./wetlands";
import { resolve } from "./presets";
import type { Ground, HydrologyOptions, Network, Wet } from "./types";

export type HydrologyHooks = {
    key: string;
    features: (raw: Ground) => { hard: Float32Array };
    fix: (data: Wet & { rivers: { points: [number, number, number, number][] }[] }) => void;
    /** the latest network (after `fix`) */
    network: Network;
    /** the planned paths (before carving) */
    paths: Path[];
};

/**
 * Terrain hooks (`@polywar/terrain` `TerrainHooks`): before erosion dig highland lakes, plan the streams on the raw map
 * and carve their valleys; after erosion fill the highland lakes, carve the exact beds and add river water.
 * River lines go into the terrain's `rivers` list too.
 */
export function hydrologyHooks(options: Partial<HydrologyOptions> = {}): HydrologyHooks {
    const o = resolve(options);
    let shape: Float32Array | undefined;
    const h: HydrologyHooks = {
        key: JSON.stringify(o),
        network: { streams: [], lakes: [] },
        paths: [],
        features: raw => {
            const rng = new Random(o.seed), hard = new Float32Array(raw.n * raw.n), wet = new Uint8Array(raw.n * raw.n);
            const lakes = digLakes(raw, o, rng, hard, wet);
            h.paths = plan(raw, o, lakes, rng);
            shape = carveValleys(h.paths, raw, o, hard, wet);
            // later hooks (roads) see the sea, lakes and river channels as water: they bridge them
            for (let k = 0; k < wet.length; k++) if (!wet[k] && raw.height[k] < raw.seaLevel) wet[k] = 1;
            raw.water = wet;
            h.network = { streams: [], lakes };
            return { hard };
        },
        fix: data => {
            if (shape && shape.length === data.height.length) limitErosion(data.height, shape);
            h.network.lakes = fillLakes(h.network.lakes, data);
            h.network.streams = carveBeds(h.paths, data, o);
            fillPits(data);
            if (data.waterKind)
            {
                const wet = { ...data, waterKind: data.waterKind };
                swamps(h.network.streams, wet, o, new Random(o.seed + 7));
                lakeKinds(wet, o);
            }
            for (const s of h.network.streams) data.rivers.push({ points: s.points });
        },
    };
    return h;
}
