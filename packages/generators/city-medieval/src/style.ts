import { Random } from "@papit/random";
import { building } from "./building";
import type { PieceName } from "./catalog";
import { compose, type PieceSource } from "./compose";
import { matrix } from "./core";
import { DEFAULTS } from "./settings";
import type { Placement, Settings } from "./types";

const moved = (p: Placement, dx: number, dz: number): Placement => { const m = p.matrix.slice(); m[12] += dx; m[14] += dz; return { piece: p.piece, matrix: m }; };
const put = (out: Placement[], piece: PieceName, x: number, y: number, z: number, deg = 0) => out.push({ piece, matrix: matrix(x, y, z, deg) });

/** cobblestone (2x2 tiles, centre at local -.5, .5) over a rectangle centred on the origin */
function cobbles(out: Placement[], length: number, width: number, x0: number) {
    const across = Math.max(1, Math.ceil(width / 2)), along = Math.max(1, Math.ceil(length / 2));
    for (let a = 0; a < along; a++) for (let b = 0; b < across; b++)
        put(out, "Cobblestone_Floor_1", x0 + a * 2 + 1 + .5, 0, (b - (across - 1) / 2) * 2 - .5);
}

/**
 * City style (matches `CityStyle` of @polywar/city without importing it).
 * Lot: house front on the lot's +Z edge (the street), centred along X. Streets: cobbles, curbs, a lamp. Squares: cobbles + well.
 */
export function medievalStyle(source: PieceSource, settings: Partial<Settings> = {}) {
    const base: Settings = { ...DEFAULTS, ground: "off", ...settings };
    return {
        name: "medieval",
        build(lot: { width: number; depth: number }, seed: number) {
            const w = Math.max(4, lot.width - 1), d = Math.max(4, lot.depth - 1);
            const shape = d >= 8 ? base.shape : "rect";
            const depth = Math.min(shape === "rect" ? Math.min(d, 8) : Math.floor(d / 2), w);
            const b = building({ ...base, shape, width: [Math.max(4, w - 2), w], depth: [Math.max(4, depth - 2), depth] }, seed);
            const f = b.features, width = f.width as number, main = f.depth as number;
            return b.pieces.map(p => moved(p, -(width - 1) / 2, lot.depth / 2 - 1 - (main - .5)));
        },
        street(length: number, width: number, seed: number) {
            const rng = new Random(seed), out: Placement[] = [];
            cobbles(out, length, width, 0);
            const edge = Math.max(1, Math.ceil(width / 2)) + .1;
            // curbs on both edges, clear of the crossings
            for (let u = width + .35; u < length - width; u += .7) for (const side of [1, -1])
                put(out, `Stone_Curb_${rng.int(1, 5)}` as PieceName, u, 0, side * (edge - .5), side > 0 ? 90 : 270);
            if (length > 8) { const side = rng.chance(.5) ? 1 : -1; put(out, "Prop_Lamp_Street", length / 2, 0, side * (edge + .3), side > 0 ? 270 : 90); }
            return out;
        },
        square(lot: { width: number; depth: number }, seed: number) {
            const rng = new Random(seed), out: Placement[] = [];
            const size = Math.min(lot.width, lot.depth);
            cobbles(out, size, size, -size / 2);
            put(out, "Prop_Well_Cobblestone", 0, .02, 0);
            put(out, "Prop_Well_1", 0, .02, 0, 90 * rng.int(0, 4));
            if (rng.chance(.6)) put(out, rng.pick(["Prop_Cart_1", "Prop_Cart_1_Hay", "Prop_Cart_1_Barrels"] as const)!, size / 2 - 2, 0, -size / 4, 90 * rng.int(0, 4));
            for (const [x, z] of [[1, 1], [-1, -1]]) put(out, "Prop_Lamp_Street", x * (size / 2 - 1), 0, z * (size / 2 - 1));
            return out;
        },
        render: (pieces: { piece: string; matrix: number[] }[]) => compose(pieces as Placement[], source),
    };
}
