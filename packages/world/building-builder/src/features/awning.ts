import { hidden } from "../core";
import type { PieceName } from "../catalog";
import type { Feature } from "./index";

/** cloth awning over the door or a ground window run (shop front) */
export const awning: Feature = {
    name: "awning", key: "awning",
    build(ctx, rng) {
        const face = ctx.door.face, door = ctx.door.i, options: [number, number][] = [[door, 2]];
        for (let i = 1; i < face.length - 1; i++) if (face.bays[i] && i + 1 < door || i > door + 1 && face.bays[i]) options.push([i, face.bays[i]]);
        const [i, n] = rng.pick(options)!;
        const cells = [...Array(Math.min(n + 1, face.length - i)).keys()].map(k => i + k - (n === 1 ? 1 : 0)).filter(c => c >= 0 && c < face.length && !hidden(ctx, face, c));
        cells.forEach((c, k) => {
            const [ox, oz] = face.out(c), y = 1.1;
            const end = k === 0 || k === cells.length - 1;
            const piece = (cells.length === 1 ? "Canopy_Ramp_Full" : end ? "Canopy_Ramp_Corner" : "Canopy_Ramp_Mid") as PieceName;
            ctx.put(piece, ox, y, oz, face.deg, k > 0 && k === cells.length - 1);
        });
    },
};
