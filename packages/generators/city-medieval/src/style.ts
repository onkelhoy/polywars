import { building } from "./building";
import { compose, type PieceSource } from "./compose";
import { DEFAULTS } from "./settings";
import type { Placement, Settings } from "./types";

/**
 * City style (matches `CityStyle` of @polywar/city without importing it).
 * The lot clamps the footprint, everything else comes from `settings`.
 */
export function medievalStyle(source: PieceSource, settings: Partial<Settings> = {}) {
    const base: Settings = { ...DEFAULTS, ground: "off", ...settings };
    return {
        name: "medieval",
        build(lot: { width: number; depth: number }, seed: number) {
            const w = Math.max(2, lot.width - 2), d = Math.max(2, lot.depth - 2);
            const shape = d >= 8 ? base.shape : "rect";
            const depth = shape === "rect" ? d : d - 4;
            return building({ ...base, shape, width: [Math.min(4, w), w], depth: [Math.min(4, depth), depth] }, seed).pieces;
        },
        render: (pieces: { piece: string; matrix: number[] }[]) => compose(pieces as Placement[], source),
    };
}
