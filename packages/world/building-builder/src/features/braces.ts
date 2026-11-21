import { STOREY, hidden, key } from "../core";
import type { Feature } from "./index";

/** diagonal timber braces on blank upper wall cells next to the corners, leaning toward the corner */
export const braces: Feature = {
    name: "braces",
    fits: ctx => ctx.timber,
    build(ctx) {
        for (const face of ctx.faces) for (let s = 1; s < face.box.floors; s++) for (const i of [1, face.length - 2])
        {
            if (face.length < 4 || face.bays[i] || face.bays[i - 1] === 2 || s < hidden(ctx, face, i)) continue;
            const [cx, cz] = face.at(i), y = s * STOREY;
            if (ctx.bare.has(key(cx, y, cz))) continue;
            const sh = face.shift, [ox, oz] = face.out(i);
            ctx.put("Stucco_Prop_Support_Angled_Large", ox + face.n[0] * sh, y + .15, oz + face.n[1] * sh, face.deg, i !== 1).matrix[5] = 1.5;
        }
    },
};
