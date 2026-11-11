import { hidden, top } from "../core";
import type { Feature } from "./index";

/** dormers (`bay`): little gabled window fronts on the eave row of the main roof's long sides, above window bays */
export const dormer: Feature = {
    name: "dormer", key: "bay",
    fits: ctx => ctx.boxes[0].w >= 5,
    plan(ctx, rng) {
        const box = ctx.boxes[0], y = top(box);
        for (const face of ctx.faces.filter(f => f.box === box && !f.gable))
        {
            // window bays with a free neighbour cell, away from the gables and other boxes
            const spots: number[] = [];
            for (let i = 1; i + 1 < face.length - 1; i++)
                if (face.bays[i] && !face.bays[i + 1] && !hidden(ctx, face, i) && !hidden(ctx, face, i + 1) || face.bays[i] === 2 && !hidden(ctx, face, i + 1)) spots.push(i);
            let last = -9, count = 0;
            for (const i of spots)
            {
                if (i - last < 3 || count >= Math.max(1, Math.floor(face.length / 4)) || !rng.chance(.7)) continue;
                last = i; count++;
                for (const c of [i, i + 1]) { const [x, z] = face.at(c); ctx.noRoof.add(`${x},${z}`); }
                const [x, z] = face.at(i);
                ctx.put(ctx.profile === "Straight" ? "Kit_Window_Upper_Straight" : "Kit_Window_Upper_Convex", x, y, z, face.deg);
            }
        }
    },
};
