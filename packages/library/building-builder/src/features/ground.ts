import { inside } from "../core";
import type { PieceName } from "../catalog";
import type { Feature } from "./index";

/** stone paving: a 1 m ring round the footprint, the tunnel floor and a path out of the door */
export const ground: Feature = {
    name: "ground", key: "ground",
    build(ctx, rng) {
        const cells = new Set<string>();
        for (const b of ctx.boxes) for (let x = b.x - 1; x <= b.x + b.w; x++) for (let z = b.z - 1; z <= b.z + b.d; z++)
            if (!ctx.boxes.some(o => inside(o, x, z))) cells.add(`${x},${z}`);
        const { face, i } = ctx.door;
        for (const c of [i, i + 1]) for (let d = 1; d <= 2; d++) { const [x, z] = face.out(c); cells.add(`${x + face.n[0] * d},${z + face.n[1] * d}`); }
        const t = ctx.features.tunnelAt as number | undefined;
        if (t !== undefined)
        {
            const [x0] = ctx.faces[1].at(t);
            for (let z = -1; z <= ctx.boxes[0].d; z++) for (const x of [x0, x0 - 1]) cells.add(`${x},${z}`);
        }
        for (const c of cells)
        {
            const [x, z] = c.split(",").map(Number);
            ctx.put(`Stone_Floor_${rng.int(1, 3)}` as PieceName, x, 0, z, 90 * rng.int(0, 4));
        }
    },
};
