import { roofOf } from "../roof";
import type { Feature } from "./index";

/** stone chimney on the back slope of the main roof */
export const chimney: Feature = {
    name: "chimney", key: "chimney",
    build(ctx, rng) {
        const box = ctx.boxes[0], r = roofOf(ctx, box);
        ctx.put("Roof_Prop_Chimney_Stone", rng.int(1, Math.max(2, box.w - 1)), r.peak - 1.1, r.rows + .1);
    },
};
