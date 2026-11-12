import { STOREY } from "../core";
import type { Feature } from "./index";

/** jetty: the upper storeys of one gable end stand out .5 m on brackets, the roof runs on with them */
export const jetty: Feature = {
    name: "jetty", key: "jetty",
    fits: ctx => ctx.boxes[0].floors >= 2,
    plan(ctx, rng) {
        const box = ctx.boxes[0], free = [0, 2].filter(s => !ctx.faces[s].taken);
        if (!free.length) return;
        const side = rng.pick(free)!;
        ctx.faces[side].shift = .5;
        ctx.faces[side].taken = "jetty";
        box.jetty = side === 0 ? "end" : "start";
    },
    build(ctx) {
        const face = ctx.faces.find(f => f.shift)!;
        if (!face) return;
        for (let i = 1; i < face.length; i += 2)
        {
            const [x, z] = face.at(i);
            ctx.put("Stucco_Prop_Support_Angled_Small", x + face.n[0] * .5, STOREY - .6, z + face.n[1] * .5, face.deg + 90);
        }
    },
};
