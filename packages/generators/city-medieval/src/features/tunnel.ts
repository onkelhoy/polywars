import { hidden, key } from "../core";
import { unbay } from "../walls";
import type { PieceName } from "../catalog";
import type { Feature } from "./index";

/** first front cell (face index) of each tunnel spot: 2 cells wide, clear of other boxes at the back */
function spots(ctx: Parameters<NonNullable<Feature["fits"]>>[0]) {
    const front = ctx.faces[1], back = ctx.faces[3], w = ctx.boxes[0].w, out: number[] = [];
    for (let i = 1; i + 1 < front.length - 1; i++)
    {
        const b = w - 2 - i;
        if (!hidden(ctx, back, b) && !hidden(ctx, back, b + 1) && (i - 2 >= 1 || i + 3 < front.length - 1)) out.push(i);
    }
    return out;
}

/** passage through the house: stone arches front and back, a vault between, the door moves beside it */
export const tunnel: Feature = {
    name: "tunnel", key: "tunnel",
    fits: ctx => ctx.boxes[0].floors >= 2 && ctx.boxes[0].w >= 6 && spots(ctx).length > 0,
    plan(ctx, rng) {
        const box = ctx.boxes[0], front = ctx.faces[1], back = ctx.faces[3];
        const ti = rng.pick(spots(ctx))!, bi = box.w - 2 - ti;
        ctx.features.tunnelAt = ti;
        for (const [face, i] of [[front, ti], [back, bi]] as const) for (const c of [i, i + 1])
        {
            unbay(face, c);
            const [x, z] = face.at(c);
            for (const y of [0, 1, 2]) ctx.filled.add(key(x, y, z));
            for (const y of [0, 1, 2]) ctx.bare.add(key(x, y, z));
        }
        // door: two cells, not on the tunnel
        const doors: number[] = [];
        for (let i = 1; i < front.length - 2; i++) if (i + 1 < ti || i > ti + 2) doors.push(i);
        ctx.door.i = rng.pick(doors) ?? ctx.door.i;
    },
    build(ctx, rng) {
        const box = ctx.boxes[0], front = ctx.faces[1], back = ctx.faces[3], ti = ctx.features.tunnelAt as number, bi = box.w - 2 - ti;
        for (const [face, i] of [[front, ti], [back, bi]] as const) { const [x, z] = face.at(i); ctx.put("Stone_Arch_Outer", x, 0, z, face.deg); }
        const [x0] = front.at(ti);
        for (let z = 1; z < box.d - 1; z++)
        {
            ctx.put("Stone_Arch", x0, 0, z, front.deg);
            // passage walls, stone at the foot, facing into the passage
            for (const [x, deg] of [[x0 + 1, 180], [x0 - 2, 0]] as const)
            {
                for (const y of [0, 1, 2]) ctx.put("Stucco_Block", x, y, z);
                if (ctx.stone) ctx.put(`Stone_Wall_${rng.int(1, 6)}` as PieceName, x + (deg ? -1 : 1), 0, z, deg);
            }
        }
    },
};
