import { Random } from "@papit/random";
import { farmGrid } from "./grid";
import { zone } from "./zones";
import { placeYard } from "./yard";
import { fences, yardFence, cutFences } from "./fences";
import { paths } from "./paths";
import { hedges } from "./hedges";
import { dress } from "./props";
import type { FarmArea, FarmGround, FarmLayout, FarmOptions, FarmPiece } from "./types";

const P = (asset: string, w: number, d: number, more: Partial<FarmPiece> = {}): FarmPiece => ({ asset, w, d, ...more });
const DOOR = Math.PI;
export const DEFAULTS: FarmOptions = {
    seed: 1, cell: 14, relax: 40,
    yard: {
        cells: 18, maxSlope: .25, gap: 3,
        pieces: [P("BigBarn", 8, 8.2, { front: DOOR }), P("Barn", 8, 8.2, { front: DOOR }), P("Silo_House", 5.4, 3.6, { front: DOOR }), P("OpenBarn", 5.8, 6.3, { front: DOOR }), P("SmallBarn", 4.6, 4.8, { front: DOOR }), P("Silo", 3.7, 3.6), P("WaterTower", 2.6, 2.5), P("ChickenCoop", 2.4, 2.2, { front: DOOR, run: { w: 10, d: 8, animal: "chicken" } }), P("Well", 1.3, 1.6)],
    },
    landmark: [P("Windmill", 6.5, 2)],
    field: { size: [10, 34], maxSlope: .32, crops: ["wheat", "corn"] },
    pasture: { size: [10, 30], maxSlope: .35, animals: ["cow", "sheep", "horse", "pig"], per: 120 },
    hedge: { chance: .55, spacing: 4.5 },
    bank: { chance: .75, spacing: 5 },
    wood: { slope: .35, chance: .5 },
    fence: { asset: "Fence", length: 5.8, gate: 0, styles: { pasture: ["1", "2"], field: ["poor"], run: ["simple"], yard: ["fancy"] }, fields: .35 },
    path: { lane: 4, trail: 1.5, fields: 5 },
    props: {
        door: ["props/village/barrel", "props/village/crate", "props/village/sack", "props/village/bucket"],
        stack: ["props/village/bale", "props/village/hay", "props/village/woodpile"],
        court: ["props/village/cart-hay", "props/village/cart-sacks", "props/village/washing-line"],
        well: ["props/village/bucket"],
        sign: "props/village/signpost", lamp: "props/village/street-lamp",
        view: { seat: "props/village/log", side: "nature/TreeStump", light: "props/village/lantern", fire: "props/village/firepit" },
        sheaf: "props/village/stook", feed: "props/village/bale",
        wood: ["props/village/woodpile", "nature/WoodLog"],
    },
};

/** lay out a farm on the area */
export function generateFarm(area: FarmArea, ground: FarmGround, options: Partial<FarmOptions> = {}): FarmLayout {
    const o = { ...DEFAULTS, ...options };
    const rnd = new Random(o.seed);
    const { cells, neighbours } = farmGrid(area, ground, o);
    const z = zone(cells, neighbours, area, o, rnd.fork("zones"));
    const layout: FarmLayout = { area, cells, neighbours, buildings: [], fields: z.fields, pastures: z.pastures, fences: [], paths: [], edits: [], gates: [], hedges: [], trees: [], props: [], fenceStyles: [] };
    placeYard(layout, z.yard, ground, o, rnd.fork("yard"));
    const gates = fences(layout, o, rnd.fork("fences"));
    hedges(layout, z.banks, o, rnd.fork("hedges"));
    yardFence(layout, z.yard, o);
    paths(layout, z.yard, gates, o);
    cutFences(layout, o);
    dress(layout, ground, o, rnd.fork("props"));
    // fields: soil, no grass
    for (const f of layout.fields) for (const c of f.cells) {
        const poly = cells[c].corners;
        layout.edits.push({ kind: "noGrass", poly }, { kind: "paint", paint: "soil", poly });
    }
    return layout;
}
