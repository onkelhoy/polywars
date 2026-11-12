import { hidden } from "../core";
import type { Feature } from "./index";

/** water wheel against a gable (or the back), axle at 1.5 m, a flume on posts brings the water from away */
export const waterwheel: Feature = {
    name: "waterwheel", key: "waterwheel",
    fits: ctx => ctx.boxes[0].d >= 4,
    build(ctx, rng) {
        const faces = [0, 2, 3].map(s => ctx.faces[s]).filter(f => !f.taken && !hidden(ctx, f, f.length >> 1));
        const face = rng.pick(faces);
        if (!face) return;
        face.taken = "waterwheel";
        const [cx, cz] = face.at(face.length >> 1), [nx, nz] = face.n, at = (d: number) => [cx + nx * d, cz + nz * d] as const;
        const axle = 1.5, flume = axle + 2.3;
        ctx.put("Waterwheel_1", ...xyz(at(1.5), axle), face.deg);
        ctx.put("Waterwheel_Flume_End", ...xyz(at(1.5), flume), face.deg + 180);
        for (let d = 2.5; d < 6; d++)
        {
            ctx.put("Waterwheel_Flume_Straight", ...xyz(at(d), flume), face.deg);
            ctx.put("Waterwheel_Flume_Support_Pillar", ...xyz(at(d), 0), face.deg).matrix[5] = flume;
        }
    },
};
const xyz = ([x, z]: readonly [number, number], y: number) => [x, y, z] as const;
