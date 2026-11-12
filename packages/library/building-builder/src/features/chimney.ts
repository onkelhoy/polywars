import { top } from "../core";
import { roofOf } from "../roof";
import type { Feature } from "./index";

/** stone chimney on the back slope of the main roof; small houses get a stove pipe out of a gable wall */
export const chimney: Feature = {
    name: "chimney", key: "chimney",
    build(ctx, rng) {
        const box = ctx.boxes[0], r = roofOf(ctx, box);
        if (box.floors > 1 || box.w > 5)
        {
            ctx.put("Roof_Prop_Chimney_Stone", rng.int(1, Math.max(2, box.w - 1)), r.peak - 1.1, r.rows + .1);
            return;
        }
        // a blank cell of a free gable
        const blank = (f: typeof ctx.faces[0]) => [...f.bays.keys()].find(i => i > 0 && i < f.length - 1 && !f.bays[i] && f.bays[i - 1] !== 2);
        const face = [0, 2].map(s => ctx.faces[s]).find(f => !f.taken && blank(f) !== undefined);
        if (!face) return;
        const [ox, oz] = face.out(blank(face)!);
        ctx.put("Roof_Prop_Chimney_Pipe", ox + face.n[0] * face.shift, top(box) - .6, oz + face.n[1] * face.shift, face.deg);
    },
};
