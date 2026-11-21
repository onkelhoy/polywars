import type { Random } from "@papit/random";
import type { Animal, FarmArea, FarmCell, FarmOptions, Field, Pasture } from "./types";

const usable = (c: FarmCell) => c.inside && !c.water && !c.blocked && c.zone === "none";

/** grow a region from `start` over usable cells under `maxSlope`, up to `size` cells, flattest first */
function grow(cells: FarmCell[], nb: Int32Array, start: number, size: number, maxSlope: number, ok = usable): number[] {
    const out = [start], seen = new Set(out);
    const front: number[] = [];
    const push = (c: number) => { for (let i = 0; i < 4; i++) { const n = nb[c * 4 + i]; if (n >= 0 && !seen.has(n) && ok(cells[n]) && cells[n].slope <= maxSlope) { seen.add(n); front.push(n); } } };
    push(start);
    while (out.length < size && front.length) {
        // most neighbours in the region first: compact shapes
        let best = 0, bs = -1e9;
        for (let i = 0; i < front.length; i++) {
            const c = front[i]; let k = 0;
            for (let j = 0; j < 4; j++) if (seen.has(nb[c * 4 + j]) && out.includes(nb[c * 4 + j])) k++;
            const s = k - cells[c].slope * 4;
            if (s > bs) { bs = s; best = i; }
        }
        const c = front.splice(best, 1)[0];
        out.push(c); push(c);
    }
    return out;
}

export function zone(cells: FarmCell[], nb: Int32Array, area: FarmArea, o: FarmOptions, rnd: Random) {
    // yard: flat, dry, a bit in from the entry
    const entry = area.entry ?? { x: area.x, z: area.z };
    const goal = { x: area.x + (entry.x - area.x) * .45, z: area.z + (entry.z - area.z) * .45 };
    let start = -1, bs = Infinity;
    for (const c of cells) {
        if (!usable(c) || c.slope > o.yard.maxSlope) continue;
        let wet = 0; for (let i = 0; i < 4; i++) { const n = nb[c.id * 4 + i]; if (n >= 0 && cells[n].water) wet++; }
        const s = Math.hypot(c.x - goal.x, c.z - goal.z) / area.radius + c.slope * 6 + wet;
        if (s < bs) { bs = s; start = c.id; }
    }
    const yard = start < 0 ? [] : grow(cells, nb, start, o.yard.cells, o.yard.maxSlope);
    for (const c of yard) cells[c].zone = "yard";

    // river banks: a strip of trees / brush along the water
    const banks: number[] = [];
    for (const c of cells) {
        if (!usable(c)) continue;
        let wet = false; for (let i = 0; i < 4; i++) { const n = nb[c.id * 4 + i]; if (n >= 0 && cells[n].water) wet = true; }
        if (wet && rnd.chance(o.bank.chance)) { c.zone = "wood"; banks.push(c.id); }
    }
    // wood: steep cells, clumped
    for (const c of cells) if (usable(c) && c.slope > o.wood.slope && rnd.chance(o.wood.chance)) c.zone = "wood";

    // pastures next to the yard first, then fields over the flat rest
    const near = (c: FarmCell) => { let d = Infinity; for (const y of yard) d = Math.min(d, Math.hypot(c.x - cells[y].x, c.z - cells[y].z)); return d; };
    const order = cells.filter(usable).map(c => ({ c, d: near(c) })).sort((a, b) => a.d - b.d).map(e => e.c.id);
    const pastures: Pasture[] = [], fields: Field[] = [];
    const room = cells.filter(c => c.inside && !c.water && !c.blocked).length;
    const animals = o.pasture.animals.slice(0, Math.max(1, Math.min(o.pasture.animals.length, Math.round(room / o.pasture.per))));
    for (const id of order) {
        if (!usable(cells[id])) continue;
        const flat = cells[id].slope <= o.field.maxSlope;
        // a pasture ring around the yard (one per animal), fields further out where flat
        const wantPasture = animals.length > 0 && (!flat || pastures.length < 1 || rnd.chance(.2));
        if (wantPasture && cells[id].slope <= o.pasture.maxSlope) {
            const r = grow(cells, nb, id, rnd.int(o.pasture.size[0], o.pasture.size[1]), o.pasture.maxSlope);
            if (r.length < o.pasture.size[0] / 2) continue;
            for (const c of r) cells[c].zone = "pasture";
            pastures.push({ cells: r, animal: animals.shift() as Animal });
        } else if (flat) {
            const r = grow(cells, nb, id, rnd.int(o.field.size[0], o.field.size[1]), o.field.maxSlope);
            if (r.length < 4) continue;
            for (const c of r) cells[c].zone = "field";
            fields.push({ cells: r, crop: o.field.crops[rnd.int(0, o.field.crops.length)] });
        }
    }
    return { yard, fields, pastures, banks };
}
