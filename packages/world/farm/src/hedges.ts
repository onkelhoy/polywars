import type { Random } from "@papit/random";
import type { FarmLayout, FarmOptions, Line } from "./types";

/** tree lines on some field borders (field / field, field / pasture), tree spots on hedges and river banks */
export function hedges(layout: FarmLayout, banks: number[], o: FarmOptions, rnd: Random) {
    const { cells, neighbours: nb } = layout;
    const fieldOf = new Int32Array(cells.length).fill(-1);
    layout.fields.forEach((f, i) => { for (const c of f.cells) fieldOf[c] = i; });
    layout.pastures.forEach((p, i) => { for (const c of p.cells) fieldOf[c] = 1000 + i; });
    const pick = new Map<string, boolean>(), lines = new Map<string, Line[]>();
    for (const c of cells) {
        const a = fieldOf[c.id]; if (a < 0 || a >= 1000) continue;
        for (let i = 0; i < 4; i++) {
            const n = nb[c.id * 4 + i], b = n >= 0 ? fieldOf[n] : -1;
            if (b < 0 || b === a) continue;
            // pasture borders already have a fence; a hedge only sometimes
            const key = Math.min(a, b) + "-" + Math.max(a, b);
            if (!pick.has(key)) pick.set(key, rnd.chance(b >= 1000 ? o.hedge.chance * .4 : o.hedge.chance));
            if (!pick.get(key) || (b < 1000 && c.id > n)) continue;
            (lines.get(key) ?? lines.set(key, []).get(key)!).push([c.corners[i], c.corners[(i + 1) % 4]]);
        }
    }
    for (const segs of lines.values()) for (const s of segs) {
        layout.hedges.push(s);
        const [[x0, z0], [x1, z1]] = s, d = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.round(d / o.hedge.spacing));
        for (let t = 0; t < k; t++) {
            const u = (t + rnd.float(.2, .8)) / k;
            layout.trees.push({ x: x0 + (x1 - x0) * u + rnd.float(-.8, .8), z: z0 + (z1 - z0) * u + rnd.float(-.8, .8), kind: "hedge" });
        }
    }
    // banks: a loose scatter over each bank cell
    for (const id of banks) {
        const c = cells[id], area = 196, n = Math.max(1, Math.round(area / (o.bank.spacing * o.bank.spacing) * rnd.float(.5, 1)));
        const [a, b, , d] = c.corners;
        for (let k = 0; k < n; k++) {
            const u = rnd.float(.1, .9), v = rnd.float(.1, .9);
            // inside the quad, roughly (parallelogram from corner a)
            layout.trees.push({ x: a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v, z: a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v, kind: "bank" });
        }
    }
    // no grass under tree trunks is the ecosystem's job; hedges get a strip of no field paint
}
