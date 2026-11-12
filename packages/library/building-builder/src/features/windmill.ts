import { top } from "../core";
import { roofOf } from "../roof";
import { unbay } from "../walls";
import type { Feature } from "./index";

/** windmill sails on a gable end of a tall house (massing makes it a tower when on), hub centred under the gable */
export const windmill: Feature = {
    name: "windmill", key: "windmill",
    fits: ctx => ctx.boxes[0].floors >= 2,
    plan(ctx, rng) {
        const face = ctx.faces[rng.pick([0, 2])!], r = roofOf(ctx, face.box);
        face.taken = "windmill";
        // no window under the hub
        for (const i of [r.rows - 1, r.rows]) unbay(face, i);
    },
    build(ctx) {
        const face = ctx.faces.find(f => f.taken === "windmill")!, r = roofOf(ctx, face.box);
        const [x, z] = face.at(r.rows - 1), y = top(face.box) + .6;
        ctx.put("Wall_Prop_Windmill_1", x + face.run[0] * .5 + face.n[0] * 1.1, y, z + face.run[1] * .5 + face.n[1] * 1.1, face.deg);
    },
};
