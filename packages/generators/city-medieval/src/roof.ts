import type { PieceName } from "./catalog";
import { FOOT, RISE, frame, top, type Box, type Ctx } from "./core";

/** the roof shape of a box: rows per slope, rise per row, ridge height */
export function roofOf(ctx: Ctx, box: Box) {
    const f = frame(box), rows = f.D / 2, rise = RISE[ctx.profile];
    return { ...f, rows, rise, base: top(box), peak: top(box) + rows * rise + FOOT };
}

/** two slopes meeting on a ridge, rakes on the gable ends, gables filled with stucco */
export function roof(ctx: Ctx, box: Box) {
    const r = roofOf(ctx, box), { L, D, rows, rise, base } = r;
    const u0 = box.join === "start" ? -(box.extend ?? 0) : 0, u1 = box.join === "end" ? L - 1 + (box.extend ?? 0) : L - 1;
    const gable = (u: number) => (u === 0 && box.join !== "start") || (u === L - 1 && box.join !== "end");
    const push = (piece: PieceName, m: number[]) => { ctx.pieces.push({ piece, matrix: m }); };
    for (let k = 0; k < rows; k++) for (let u = u0; u <= u1; u++)
    {
        const edge = gable(u) && (u === 0 || u === L - 1);
        const name = `Roof_${ctx.profile}_Side${k === 0 ? "_Eave" : ""}${edge ? "_Edge" : ""}` as PieceName;
        // the edge overhang is on local -Z: mirror it on the other gable
        for (const [v, deg, mirror] of [[D - 1 - k, 270, u === 0], [k, 90, u === L - 1]] as const)
        {
            const [x, z] = r.world(u, v);
            if (k === 0 && ctx.noRoof.has(`${x},${z}`)) continue;
            push(name, r.matrix(u, base + k * rise, v, deg, mirror));
        }
    }
    for (let u = u0; u <= u1; u++) push("Roof_Accent_Ridge", r.matrix(u, r.peak - .2, rows - 1));
    // gable walls under the upper roof rows, with a king post
    for (const u of [0, L - 1]) if (gable(u)) for (let k = 1; k < rows; k++) for (const v of [k, D - 1 - k])
    {
        const m = r.matrix(u, base, v);
        m[5] = k * rise;
        push("Stucco_Block", m);
    }
    if (ctx.timber && rows > 1) for (const u of [-1, L]) if (gable(u < 0 ? 0 : L - 1))
    {
        const m = r.matrix(u, base, u < 0 ? D / 2 : D / 2 - 1, u < 0 ? 180 : 0);
        m[5] = (rows - 1) * rise + FOOT;
        push("Stucco_Prop_Support_Pillar_1", m);
    }
}
