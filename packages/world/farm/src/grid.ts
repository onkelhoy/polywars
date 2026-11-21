import { IrregularGrid } from "@papit/irregular-grid";
import type { FarmArea, FarmCell, FarmGround, FarmOptions } from "./types";

/** irregular quad grid over the area, sampled on the ground */
export function farmGrid(area: FarmArea, ground: FarmGround, o: FarmOptions): { cells: FarmCell[]; neighbours: Int32Array } {
    // triangle edge = 2 cells, hex radius in edges covers the area
    const size = o.cell * 2, radius = Math.max(1, Math.ceil(area.radius / size));
    const g = IrregularGrid.hex({ radius, seed: o.seed, size, relax: o.relax });
    const cells: FarmCell[] = [];
    for (let c = 0; c < g.cellCount; c++) {
        const corners: [number, number][] = [];
        for (const v of g.cornersOf(c)) corners.push([area.x + g.positions[v * 2], area.z + g.positions[v * 2 + 1]]);
        const ctr = g.center(c), x = area.x + ctr.x, z = area.z + ctr.y, y = ground.height(x, z);
        let slope = 0;
        for (const [cx, cz] of corners) {
            const run = Math.hypot(cx - x, cz - z) || 1;
            slope = Math.max(slope, Math.abs(ground.height(cx, cz) - y) / run);
        }
        const inside = Math.hypot(x - area.x, z - area.z) <= area.radius;
        cells.push({ id: c, corners, x, z, y, slope, water: ground.water?.(x, z) ?? false, inside, zone: "none" });
    }
    return { cells, neighbours: Int32Array.from(g.cellNeighbours) };
}
