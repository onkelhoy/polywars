import { Random } from "@papit/random";
import { farmGrid } from "./grid";
import { zone } from "./zones";
import { placeYard } from "./yard";
import { fences } from "./fences";
import { paths } from "./paths";
import type { FarmArea, FarmGround, FarmLayout, FarmOptions } from "./types";

const P = (asset: string, w: number, d: number) => ({ asset, w, d });
export const DEFAULTS: FarmOptions = {
    seed: 1, cell: 14, relax: 40,
    yard: {
        cells: 18, maxSlope: .25, gap: 3,
        pieces: [P("BigBarn", 8, 8.2), P("Barn", 8, 8.2), P("Silo_House", 5.4, 3.6), P("OpenBarn", 5.8, 6.3), P("SmallBarn", 4.6, 4.8), P("Silo", 3.7, 3.6), P("WaterTower", 2.6, 2.5), P("ChickenCoop", 2.4, 2.2), P("Well", 1.3, 1.6)],
    },
    landmark: [P("Windmill", 6.5, 2)],
    field: { size: [10, 30], maxSlope: .18, crops: ["wheat", "corn", "barley", "potato"] },
    pasture: { size: [10, 30], maxSlope: .35, animals: ["cow", "sheep", "horse", "pig"] },
    wood: { slope: .35, chance: .5 },
    fence: { asset: "Fence", length: 5.8 },
    path: { lane: 4, trail: 1.5, fields: 5 },
};

/** lay out a farm on the area */
export function generateFarm(area: FarmArea, ground: FarmGround, options: Partial<FarmOptions> = {}): FarmLayout {
    const o = { ...DEFAULTS, ...options };
    const rnd = new Random(o.seed);
    const { cells, neighbours } = farmGrid(area, ground, o);
    const z = zone(cells, neighbours, area, o, rnd.fork("zones"));
    const layout: FarmLayout = { area, cells, neighbours, buildings: [], fields: z.fields, pastures: z.pastures, fences: [], paths: [], edits: [], gates: [] };
    placeYard(layout, z.yard, ground, o, rnd.fork("yard"));
    const gates = fences(layout, o);
    paths(layout, z.yard, gates, o);
    // fields: soil, no grass
    for (const f of layout.fields) for (const c of f.cells) {
        const poly = cells[c].corners;
        layout.edits.push({ kind: "noGrass", poly }, { kind: "paint", paint: "soil", poly });
    }
    return layout;
}
