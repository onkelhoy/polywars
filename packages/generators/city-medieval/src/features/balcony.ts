import { STOREY, hidden, key, type Face } from "../core";
import type { PieceName } from "../catalog";
import type { Feature } from "./index";

/** wooden balcony on an upper storey: a doorway replaces a window bay, floor + railing on brackets in front */
export const balcony: Feature = {
    name: "balcony", key: "balcony",
    fits: ctx => ctx.boxes[0].floors >= 2,
    plan(ctx, rng) {
        const box = ctx.boxes[0], options: [Face, number][] = [];
        for (const face of [1, 0, 2].map(s => ctx.faces[s])) if (!face.taken && !face.shift)
            for (let i = 2; i < face.length - 2; i++) if (face.bays[i] && !hidden(ctx, face, i - 1) && !hidden(ctx, face, i + 1)) options.push([face, i]);
        const spot = rng.pick(options);
        if (!spot) return;
        const [face, i] = spot, s = rng.int(1, box.floors), y = s * STOREY;
        face.taken = "balcony";
        for (const c of face.bays[i] === 2 ? [i, i + 1] : [i]) { const [x, z] = face.at(c); ctx.filled.add(key(x, y, z)); ctx.filled.add(key(x, y + 1, z)); }
        ctx.features.balconyAt = `${face.side},${i},${s}`;
    },
    build(ctx, rng) {
        const [side, i, s] = String(ctx.features.balconyAt ?? "").split(",").map(Number), face = ctx.faces[side];
        if (!face) return;
        const y = s * STOREY, [x, z] = face.at(i);
        ctx.put("Stucco_Doorway_Narrow_Tall", x, y, z, face.deg);
        if (face.bays[i] === 2) { const [bx, bz] = face.at(i + 1); ctx.put("Stucco_Block", bx, y, bz); ctx.put("Stucco_Block", bx, y + 1, bz); }
        for (const c of [i - 1, i, i + 1])
        {
            const [ox, oz] = face.out(c);
            ctx.put(`Wood_Floor_Straight_${rng.int(1, 5)}` as PieceName, ox, y, oz, face.deg);
            ctx.put("Wood_Railing_Straight", ox, y, oz, face.deg + 90);
            if (c !== i) ctx.put("Wood_Railing_Straight", ox, y, oz, face.deg, c < i);
            if (c !== i) { const [wx, wz] = face.at(c); ctx.put("Stucco_Prop_Support_Angled_Small", wx + face.n[0] * .5, y - .6, wz + face.n[1] * .5, face.deg + 90); }
        }
    },
};
