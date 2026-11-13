import type { HydrologyOptions } from "./types";

export const DEFAULTS: HydrologyOptions = {
    seed: 1,
    catchment: 60000,
    spring: 600,
    length: 300,
    width: 4,
    maxWidth: 40,
    depth: 2,
    meander: .7,
    valley: .35,
    canyon: 2.2,
    cut: 45,
    fall: 4,
    lakes: { count: 3, radius: [50, 120], depth: 20, height: .2 },
    swamps: { count: 4, width: 5, height: 60, flat: 8, radius: [60, 160] },
    muddy: { height: 30, depth: 4 },
    delta: { width: 14, branches: 4, length: 260 },
};

export const resolve = (o: Partial<HydrologyOptions> = {}): HydrologyOptions => ({ ...DEFAULTS, ...o, lakes: { ...DEFAULTS.lakes, ...o.lakes }, delta: { ...DEFAULTS.delta, ...o.delta }, swamps: { ...DEFAULTS.swamps, ...o.swamps }, muddy: { ...DEFAULTS.muddy, ...o.muddy } });
