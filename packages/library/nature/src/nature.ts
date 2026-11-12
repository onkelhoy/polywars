import type { Family, NatureList } from "./types";

/** where the list lives when the root `assets/` is served */
export const NATURE_URL = "/assets/models/nature/nature.json";

export async function loadNature(url = NATURE_URL): Promise<NatureList> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`nature list: ${res.status} ${url}`);
    return res.json();
}

/** Model name of a family: `index` wraps, a missing variant falls back to the plain model. */
export function modelName(family: Family, index: number, variant?: string): string {
    const list = (variant && family.variants?.[variant]) || family.models;
    return list[((index % list.length) + list.length) % list.length];
}

/** url of a model name in the list; `lod` > 0: its lower detail copy (`npm run assets` writes `<name>.lod<n>.glb`) */
export const modelUrl = (list: NatureList, name: string, lod = 0) => `${list.base}${name}${lod ? `.lod${lod}` : ""}.glb`;

/** every model name in the list (all variants), once */
export function allModels(list: NatureList): string[] {
    return [...new Set(list.families.flatMap(f => [...f.models, ...Object.values(f.variants ?? {}).flat()]))];
}

/** families matching kinds / tags / a biome (all given filters must match; a tag list matches any of its tags) */
export function find(list: NatureList, filter: { kind?: string | string[]; tags?: string[]; biome?: string } = {}): Family[] {
    const kinds = filter.kind === undefined ? null : [filter.kind].flat();
    return list.families.filter(f => (!kinds || kinds.includes(f.kind))
        && (!filter.tags || filter.tags.some(t => f.tags.includes(t)))
        && (!filter.biome || f.biomes.includes(filter.biome)));
}
