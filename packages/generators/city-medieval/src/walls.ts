import type { PieceName } from "./catalog";
import { STOREY, faceOf, hidden, key, type Ctx, type Face } from "./core";

/** faces of every box with their window bays, and the front door */
export function plan(ctx: Ctx) {
    const rng = ctx.rng.fork("bays");
    for (const box of ctx.boxes) for (let side = 0; side < 4; side++)
    {
        const face = faceOf(box, side);
        face.bays = new Array(face.length).fill(0);
        for (let i = 1; i < face.length - 1;)
        {
            const wide = i + 1 < face.length - 1 && rng.chance(.35);
            face.bays[i] = wide ? 2 : 1;
            i += wide ? 3 : 2;
        }
        ctx.faces.push(face);
    }
    const front = ctx.faces[1];
    ctx.door = { face: front, i: Math.max(1, Math.min(front.length - 3, rng.int(1, front.length - 2))) };
}

/** a window bay piece name */
export const windowPiece = (ctx: Ctx, bay: number, tall: boolean) => `Stucco_Window_${ctx.family}_${bay === 2 ? "Wide" : "Narrow"}${tall ? "_Tall" : ""}` as PieceName;

/** clear a bay so a feature can use the cells */
export function unbay(face: Face, i: number) {
    if (face.bays[i - 1] === 2) i--;
    const wide = face.bays[i] === 2;
    face.bays[i] = 0;
    return wide ? [i, i + 1] : [i];
}

/** stone base + stucco walls with windows and the timber frame */
export function walls(ctx: Ctx) {
    const rng = ctx.rng.fork("walls"), { put, filled, bare } = ctx;
    const take = (x: number, y: number, z: number) => filled.has(key(x, y, z)) ? false : (filled.add(key(x, y, z)), true);

    // front door: wide doorway, stone below, the door leaf in the middle of the two cells
    const { face: df, i: di } = ctx.door;
    for (const i of [di, di + 1]) { const [x, z] = df.at(i); for (const y of [0, 1]) { filled.add(key(x, y, z)); bare.add(key(x, y, z)); } }
    {
        const [x, z] = df.at(di);
        put(ctx.stone ? `Stone_to_Stucco_Doorway_Wide_Tall_${rng.int(1, 3)}` as PieceName : "Stucco_Doorway_Wide_Tall", x, 0, z, df.deg);
        put(ctx.features.ornate ? "Wall_Prop_Door_Ornate" : "Wall_Prop_Door_Simple", x + df.run[0] * .5, 0, z + df.run[1] * .5, df.deg);
    }

    for (const face of ctx.faces)
    {
        const box = face.box, isFront = face === df;
        const next = ctx.faces.find(f => f.box === box && f.side === (face.side + 1) % 4)!, prev = ctx.faces.find(f => f.box === box && f.side === (face.side + 3) % 4)!;
        for (let s = 0; s < box.floors; s++)
        {
            const y = s * STOREY, sh = s > 0 ? face.shift : 0;
            for (let i = 0; i < face.length; i++)
            {
                if (s < hidden(ctx, face, i)) continue;
                const [cx, cz] = face.at(i);
                const x = cx + face.n[0] * sh, z = cz + face.n[1] * sh, ox = x + face.n[0], oz = z + face.n[1];
                const covered = face.bays[i - 1] === 2;
                // a wide bay that would run into the door gets narrow
                const bay = s === 0 && isFront && i + 1 === di && face.bays[i] === 2 ? 1 : face.bays[i];
                const wall = (yy: number) => { if (take(cx, yy, cz)) put("Stucco_Block", x, yy, z); };
                const window = (yy: number, tall: boolean) => {
                    if (!take(cx, yy, cz)) return;
                    if (tall) filled.add(key(cx, yy + 1, cz));
                    put(windowPiece(ctx, bay, tall), x, yy, z, face.deg);
                };
                if (s === 0)
                {
                    wall(0);
                    if (ctx.stone && !bare.has(key(cx, 0, cz))) put(`Stone_Wall_${rng.int(1, 6)}` as PieceName, ox, 0, oz, face.deg);
                    if (covered) filled.add(key(cx, 1, cz));
                    else if (bay) window(1, false);
                    else wall(1);
                }
                else if (covered) { filled.add(key(cx, y, cz)); filled.add(key(cx, y + 1, cz)); }
                else if (bay) window(y, true);
                else { wall(y); wall(y + 1); }

                if (!ctx.timber || bare.has(key(cx, y, cz)) || bare.has(key(cx, y + 1, cz))) continue;
                // beams on the storey lines, posts at the corners and beside the windows
                for (const by of s === 0 ? (ctx.stone ? [1, STOREY] : [STOREY]) : [y + STOREY]) put(`Stucco_Prop_Support_Beam_${rng.int(1, 4)}` as PieceName, ox, by, oz, face.deg);
                const post = i === face.length - 1 || !!face.bays[i] !== !!face.bays[i + 1] || (face.bays[i] === 1 && face.bays[i + 1] > 0);
                // a jetty on the next / previous face: posts and beams reach its corner
                const end = s > 0 && i === face.length - 1 ? next.shift : 0, start = s > 0 && i === 0 ? prev.shift : 0;
                if (post && face.bays[i] !== 2) for (let py = s === 0 && ctx.stone ? 1 : y; py < y + STOREY; py++) put(`Stucco_Prop_Support_Pillar_${rng.int(1, 4)}` as PieceName, ox + face.run[0] * end, py, oz + face.run[1] * end, face.deg);
                for (const d of [end, -start]) if (d)
                {
                    const m = put(`Stucco_Prop_Support_Beam_${rng.int(1, 4)}` as PieceName, ox + face.run[0] * (d / 2 + Math.sign(d) * .5), y + STOREY, oz + face.run[1] * (d / 2 + Math.sign(d) * .5), face.deg).matrix;
                    for (let c = 8; c < 11; c++) m[c] *= Math.abs(d);
                }
            }
        }
    }
}
