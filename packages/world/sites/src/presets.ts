import type { SitesOptions } from "./types";

export const DEFAULTS: SitesOptions = {
    seed: 1,
    village: { count: 14, radius: 35, spacing: 280, maxSlope: .32 },
    farm: { perTown: 4, perVillage: 2, near: [1.5, 4], radius: 18, maxSlope: .2 },
    peak: { count: 6, prominence: 40, spacing: 500 },
    beach: { count: 4, spacing: 500, width: 30 },
    lake: { count: 4, spacing: 300 },
    pass: { count: 4, spacing: 500 },
    viewpoint: { count: 5, spacing: 450, drop: 35 },
};

export function resolve(o: Partial<SitesOptions> = {}): SitesOptions {
    const out = structuredClone(DEFAULTS) as any;
    for (const [k, v] of Object.entries(o)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...out[k], ...v } : v;
    return out;
}
