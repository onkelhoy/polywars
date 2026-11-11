import { hidden, key, type Face } from "../core";
import { roofOf } from "../roof";
import type { Feature } from "./index";
import type { PieceName } from "../catalog";

/** wide window in the gable triangle when it is tall enough, stucco above it */
export const gableWindow: Feature = {
    name: "gable",
    plan(ctx) {
        gables.clear();
        for (const face of ctx.faces)
        {
            const r = roofOf(ctx, face.box), height = (r.rows - 1) * r.rise;
            if (!face.gable || height < 1 || r.rows < 2) continue;
            // the two centre cells, first one along the run
            const cells = [r.rows - 1, r.rows];
            if (cells.some(i => hidden(ctx, face, i) > 0 || ctx.filled.has(key(...at(face, i, r.base))))) continue;
            for (const i of cells) ctx.filled.add(key(...at(face, i, r.base)));
            gables.set(face, { first: cells[0], height });
        }
    },
    build(ctx) {
        for (const [face, { first, height }] of gables)
        {
            const r = roofOf(ctx, face.box), sh = face.shift, [x, z] = face.at(first);
            ctx.put(`Stucco_Window_${ctx.family}_Wide` as PieceName, x + face.n[0] * sh, r.base, z + face.n[1] * sh, face.deg);
            if (height > 1) for (const i of [first, first + 1])
            {
                const [bx, bz] = face.at(i), p = ctx.put("Stucco_Block", bx + face.n[0] * sh, r.base + 1, bz + face.n[1] * sh);
                p.matrix[5] = height - 1;
            }
        }
        gables.clear();
    },
};
const at = (face: { at(i: number): [number, number] }, i: number, y: number): [number, number, number] => { const [x, z] = face.at(i); return [x, y, z]; };
const gables = new Map<Face, { first: number; height: number }>();
