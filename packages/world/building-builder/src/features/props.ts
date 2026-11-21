import { hidden, matrix, type Face } from "../core";
import type { PieceName } from "../catalog";
import type { Feature } from "./index";

/** barrels, crates, hay, broom, ladder against free ground wall cells; lamp + sign at the door; sometimes a cart. Never in front of the door or tunnel */
export const props: Feature = {
    name: "props", key: "props",
    build(ctx, rng) {
        const { face: df, i: di } = ctx.door, tunnel = ctx.features.tunnelAt as number | undefined;
        const put = (piece: PieceName, x: number, y: number, z: number, deg: number, s = 1, mirror = false) => {
            const m = matrix(x, y, z, deg, mirror);
            for (let c = 0; c < 11; c++) if (c % 4 !== 3) m[c] *= s;
            ctx.pieces.push({ piece, matrix: m });
        };
        // door: lamp on one side, sign on the other
        const side = (i: number) => i >= 0 && i < df.length && !hidden(ctx, df, i);
        const lamp = rng.chance(.5) ? di - 1 : di + 2, sign = lamp === di - 1 ? di + 2 : di - 1;
        if (side(lamp) && rng.chance(.7)) { const [x, z] = df.out(lamp); put("Wall_Prop_Lamp", x, .9, z, df.deg); }
        if (side(sign) && rng.chance(.4)) { const [x, z] = df.out(sign); put("Wall_Prop_Sign_1", x, 1.6, z, df.deg); }

        const free: [Face, number][] = [];
        for (const face of ctx.faces) if (face.side !== 3 && face.taken !== "waterwheel")
            for (let i = 0; i < face.length; i++)
            {
                if (hidden(ctx, face, i)) continue;
                if (face === df && (i >= di - 1 && i <= di + 2 || i === lamp || i === sign)) continue;
                if (face === ctx.faces[1] && tunnel !== undefined && i >= tunnel - 1 && i <= tunnel + 2) continue;
                free.push([face, i]);
            }
        const count = Math.min(free.length, rng.int(0, 6));
        let ladder = ctx.boxes[0].floors >= 2;
        for (const [face, i] of rng.shuffle(free).slice(0, count))
        {
            const [ox, oz] = face.out(i), j = () => rng.float(-.15, .15), deg = face.deg + 90 * rng.int(0, 4);
            const x = ox - face.n[0] * .2 + j() * Math.abs(face.run[0]), z = oz - face.n[1] * .2 + j() * Math.abs(face.run[1]);
            const kind = rng.int(0, ladder ? 6 : 5);
            if (kind === 0) { put(rng.pick(["Prop_Barrel_1", "Prop_Barrel_1_Open", "Prop_Barrel_2"] as const)!, x, 0, z, deg); if (rng.chance(.5)) put("Prop_Barrel_1", x + face.run[0] * .5, 0, z + face.run[1] * .5, deg); }
            else if (kind === 1) { put(rng.pick(["Prop_Crate_1", "Prop_Crate_1_Open"] as const)!, x, 0, z, face.deg, .55); if (rng.chance(.4)) put("Prop_Crate_1", x, .55, z, face.deg + 90, .45); }
            else if (kind === 2) put("Prop_Hay_1", x, 0, z, face.deg + 90 * rng.int(0, 2));
            else if (kind === 3) { const [ax, az] = face.out(i); put("Prop_Broom", ax, 0, az, face.deg); }
            else if (kind === 4) put(rng.pick(["Prop_Barrel_2", "Prop_Crate_1"] as const)!, x, 0, z, deg, kind === 4 ? .55 : 1);
            else { const [ax, az] = face.out(i); put("Prop_Ladder_1", ax + face.n[0] * .3, 0, az + face.n[1] * .3, face.deg); ladder = false; }
        }
        // a cart beside a gable
        const gable = [0, 2].map(s => ctx.faces[s]).find(f => !f.taken);
        if (gable && rng.chance(.3))
        {
            const [ox, oz] = gable.out(gable.length >> 1);
            put(rng.pick(["Prop_Cart_1", "Prop_Cart_1_Hay", "Prop_Cart_1_Barrels"] as const)!, ox + gable.n[0] * 1.2, 0, oz + gable.n[1] * 1.2, gable.deg + 90);
        }
    },
};
