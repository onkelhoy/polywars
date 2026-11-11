import { Random } from "@papit/random";
import { PIECES, type PieceName } from "./catalog";
import { CHANCE } from "./settings";
import type { Building, Placement, Range, Settings, Tri } from "./types";

type V = [number, number];
type Wing = { x: number; z: number; w: number; d: number; floors: number };

// outward normal -> rotation (local +X faces outward); run = local +Z after rotation
const DIRS: { n: V; deg: number }[] = [
    { n: [1, 0], deg: 0 }, { n: [0, -1], deg: 90 }, { n: [-1, 0], deg: 180 }, { n: [0, 1], deg: 270 },
];
const runOf = (deg: number): V => {
    const r = deg * Math.PI / 180;
    return [Math.round(Math.sin(r)), Math.round(Math.cos(r))];
};
/** rotation that turns local +Z toward `n` (railings, ridge, ...) */
const zToward = (n: V) => n[1] === 1 ? 0 : n[0] === 1 ? 90 : n[1] === -1 ? 180 : 270;
const key = (x: number, z: number) => `${x},${z}`;

export function matrix(x: number, y: number, z: number, deg = 0, mirror = false): number[] {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), m = mirror ? -1 : 1;
    return [c, 0, -s, 0, 0, 1, 0, 0, s * m, 0, c * m, 0, x, y, z, 1];
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * One medieval building from the Modular Village kit, same settings + seed = same building.
 * Grid cells are 1 m, centre of cell (x, z) at (x, z). Walls are placed in the outside cell
 * (kit pieces sit on their cell's -X edge and face +X).
 */
export function building(settings: Settings, seed: number): Building {
    const rng = new Random(seed);
    const out: Placement[] = [];
    const put = (piece: PieceName, x: number, y: number, z: number, deg = 0, mirror = false) => out.push({ piece, matrix: matrix(x, y, z, deg, mirror) });
    const range = ([a, b]: Range) => rng.int(Math.min(a, b), Math.max(a, b) + 1);
    const want = (name: keyof typeof CHANCE | Tri, tri?: Tri) => {
        const t = tri ?? name as Tri;
        return t === "on" || (t === "random" && rng.chance(CHANCE[name as keyof typeof CHANCE] ?? .5));
    };
    const is = (k: Exclude<keyof Settings, "width" | "depth" | "floors" | "shape" | "roof">) => want(k as any, settings[k]);

    // ---- decisions (fixed order keeps codes stable) ----
    const shape = settings.shape === "random" ? rng.pick(["rect", "rect", "L", "T"] as const)! : settings.shape;
    const profile = settings.roof === "random" ? rng.pick(["Straight", "Convex", "Concave"] as const)! : settings.roof;
    const f = { tunnel: is("tunnel"), windmill: is("windmill"), waterwheel: is("waterwheel"), balcony: is("balcony"), chimney: is("chimney"), bay: is("bay"), timber: is("timber"), awning: is("awning"), props: is("props"), ground: is("ground") };
    let floors = Math.max(1, range(settings.floors));
    if (f.windmill || f.balcony) floors = Math.max(2, floors);
    const W = even(range(settings.width)), D = even(range(settings.depth));
    const family = rng.pick(["Single", "Double", "Rounded"] as const)!;
    const G = f.tunnel ? 3 : 2; // ground floor height
    const levelY = (fl: number) => fl === 0 ? 0 : G + (fl - 1) * 2;
    const top = levelY(floors);

    const wings: Wing[] = [{ x: 0, z: 0, w: W, d: D, floors }];
    if (shape !== "rect")
    {
        const w2 = even(Math.min(W, range([2, Math.max(2, W / 2)])));
        const d2 = even(range([2, 4]));
        const x2 = shape === "L" ? (rng.chance(.5) ? 0 : W - w2) : even(W / 2 - w2 / 2);
        wings.push({ x: Math.max(0, Math.min(W - w2, x2)), z: D, w: w2, d: d2, floors: Math.max(1, floors - rng.int(0, 2)) });
    }
    const tz = f.tunnel ? rng.int(0, D - 1) : -1; // tunnel rows tz, tz+1 run along X through the main wing

    const cellsAt = (fl: number) => {
        const s = new Set<string>();
        for (const w of wings) if (fl < w.floors)
            for (let x = w.x; x < w.x + w.w; x++)
                for (let z = w.z; z < w.z + w.d; z++)
                    if (!(fl === 0 && w === wings[0] && (z === tz || z === tz + 1))) s.add(key(x, z));
        return s;
    };

    // ---- balcony + feature faces ----
    const balcony = new Set<string>(); // "fl|x,z|deg"
    let balconyFloor = -1;
    if (f.balcony)
    {
        balconyFloor = rng.int(1, floors);
        const len = Math.min(W, rng.int(2, 4)), x0 = rng.int(0, W - len + 1);
        for (let x = x0; x < x0 + len; x++) balcony.add(`${balconyFloor}|${key(x, 0)}|90`);
        // floor, railing, supports in the outside cells (z = -1)
        const y = levelY(balconyFloor);
        for (let x = x0; x < x0 + len; x++)
        {
            put("Wood_Floor_Straight_1", x, y, -1);
            put("Wood_Railing_Straight", x, y, -1, zToward([0, -1]));
            put("Stucco_Prop_Support_Angled_Small", x, y - .6, -1, 90);
        }
        put("Wood_Railing_Straight", x0, y, -1, zToward([-1, 0]));
        put("Wood_Railing_Straight", x0 + len - 1, y, -1, zToward([1, 0]));
    }

    // ---- walls per floor ----
    const doorFace = rng.int(0, W - 1);
    for (let fl = 0; fl < floors; fl++)
    {
        const cells = cellsAt(fl);
        const y = levelY(fl), h = fl === 0 ? G : 2;
        for (const { n, deg } of DIRS)
        {
            const run = runOf(deg);
            for (const c of cells)
            {
                const [x, z] = c.split(",").map(Number);
                if (cells.has(key(x + n[0], z + n[1]))) continue;
                if (cells.has(key(x - run[0], z - run[1])) && !cells.has(key(x - run[0] + n[0], z - run[1] + n[1]))) continue; // not a run start
                // walk the run
                const faces: V[] = [];
                for (let cx = x, cz = z; cells.has(key(cx, cz)) && !cells.has(key(cx + n[0], cz + n[1])); cx += run[0], cz += run[1]) faces.push([cx, cz]);
                facade(fl, y, h, n, deg, run, faces);
            }
        }
    }

    function facade(fl: number, y: number, h: number, n: V, deg: number, run: V, faces: V[]) {
        const at = (i: number): [number, number] => [faces[i][0] + n[0], faces[i][1] + n[1]];
        const front = n[1] === -1 && faces.some(([fx, fz]) => fz === 0);
        let doorDone = false;
        for (let i = 0; i < faces.length;)
        {
            const [ox, oz] = at(i);
            const two = i + 1 < faces.length;
            const face = `${fl}|${key(...faces[i])}|${deg}`;
            if (fl === 0)
            {
                const isDoor = front && !doorDone && (faces[i][0] === doorFace || faces[i][0] === doorFace + 1 || i === faces.length - 1);
                if (isDoor)
                {
                    doorDone = true;
                    const wide = two && rng.chance(.5);
                    put(wide ? rng.pick(["Stone_Doorway_Wide_Tall_1", "Stone_Doorway_Wide_Tall_2"] as const)! : rng.pick(["Stone_Doorway_Narrow_Tall_1", "Stone_Doorway_Narrow_Tall_2"] as const)!, ox, y, oz, deg);
                    if (!wide) put(rng.chance(.5) ? "Wall_Prop_Door_Simple" : "Wall_Prop_Door_Ornate", ox, y, oz, deg);
                    for (let k = 0; k < (wide ? 2 : 1); k++)
                    {
                        const [ax, az] = at(i + k);
                        for (let yy = 2; yy < h; yy++) put("Stone_Wall_1", ax, y + yy, az, deg);
                        if (f.awning) put("Canopy_Side", ax, 2, az, deg);
                    }
                    if (i + (wide ? 2 : 1) < faces.length) { const [lx, lz] = at(i + (wide ? 2 : 1)); put("Wall_Prop_Lamp", lx, y + .8, lz, deg); }
                    i += wide ? 2 : 1;
                    continue;
                }
                for (let yy = 0; yy < h; yy++) put(rng.pick(["Stone_Wall_1", "Stone_Wall_2", "Stone_Wall_3", "Stone_Wall_4", "Stone_Wall_5"] as const)!, ox, y + yy, oz, deg);
                if (front && rng.chance(.15)) put("Wall_Prop_Sign_1", ox, y + 1, oz, deg);
                i++;
                continue;
            }
            // upper floors: balcony doors, bay windows, windows, blanks
            if (balcony.has(face))
            {
                put("Stucco_Doorway_Narrow_Tall", ox, y, oz, deg);
                i++;
                continue;
            }
            if (f.bay && fl === floors - 1 && two && rng.chance(.3))
            {
                put("Kit_Window_Upper_Straight", ox, y, oz, deg);
                i += 2;
                continue;
            }
            const r = rng.next();
            if (two && r < .35)
            {
                put(`Stucco_Window_${family}_Wide_Tall` as PieceName, ox, y, oz, deg);
                i += 2;
            }
            else if (r < .7)
            {
                put(`Stucco_Window_${family}_Narrow_Tall` as PieceName, ox, y, oz, deg);
                i++;
            }
            else
            {
                const [cx, cz] = faces[i];
                put("Stucco_Block", cx, y, cz);
                put("Stucco_Block", cx, y + 1, cz);
                if (f.timber)
                {
                    // X brace over the blank panel
                    put("Stucco_Prop_Support_Angled_Large", ox, y + .1, oz, deg);
                    put("Stucco_Prop_Support_Angled_Large", ox, y + .1, oz, deg, true);
                }
                i++;
            }
        }
        if (fl > 0 && f.timber)
        {
            // half-timber frame: beam at floor line and under the eave, post at every cell edge
            const last = fl === floors - 1;
            for (let k = 0; k < faces.length; k++)
            {
                const [bx, bz] = at(k);
                put("Stucco_Prop_Support_Beam_1", bx, y, bz, deg);
                if (last) put("Stucco_Prop_Support_Beam_2", bx, y + 2, bz, deg);
                for (let yy = 0; yy < 2; yy++) put("Stucco_Prop_Support_Pillar_1", bx, y + yy, bz, deg);
            }
            const [sx, sz] = at(0);
            for (let yy = 0; yy < 2; yy++) put("Stucco_Prop_Support_Pillar_1", sx - run[0], y + yy, sz - run[1], deg);
        }
    }

    // ---- tunnel arches + ceiling ----
    if (f.tunnel)
    {
        put("Stone_Arch_Outer", -1, 0, tz + 1, 180);
        put("Stone_Arch_Outer", W, 0, tz, 0);
        for (let x = 0; x < W; x++) for (const z of [tz, tz + 1]) put("Stone_Floor_1", x, G, z);
    }

    // ---- roofs (hip rings, rise from the profile) ----
    const rise = PIECES[`Roof_${profile}_Side`][4];
    let chimneyDone = !f.chimney;
    for (const w of wings)
    {
        const base = levelY(w.floors);
        for (let k = 0; k * 2 < Math.min(w.w, w.d); k++)
        {
            const x0 = w.x + k, z0 = w.z + k, x1 = w.x + w.w - 1 - k, z1 = w.z + w.d - 1 - k, y = base + k * rise;
            const eave = k === 0 ? "_Eave" : "";
            put(`Roof_${profile}_Corner_Outer${eave}` as PieceName, x1, y, z0, 0);
            put(`Roof_${profile}_Corner_Outer${eave}` as PieceName, x0, y, z0, 90);
            put(`Roof_${profile}_Corner_Outer${eave}` as PieceName, x0, y, z1, 180);
            put(`Roof_${profile}_Corner_Outer${eave}` as PieceName, x1, y, z1, 270);
            const side = `Roof_${profile}_Side${eave}` as PieceName;
            for (let x = x0 + 1; x < x1; x++) { put(side, x, y, z0, 90); put(side, x, y, z1, 270); }
            for (let z = z0 + 1; z < z1; z++) { put(side, x0, y, z, 180); put(side, x1, y, z, 0); }
            if (!chimneyDone && k === 1)
            {
                chimneyDone = true;
                put(rng.chance(.7) ? "Roof_Prop_Chimney_Stone" : "Roof_Prop_Chimney_Pipe", x0 + rng.int(0, Math.max(1, x1 - x0)), y, z0);
            }
            if ((k + 1) * 2 >= Math.min(w.w, w.d) && x1 - x0 > 1)
                for (let x = x0; x < x1; x++) put("Roof_Accent_Ridge", x + .5, y + rise - .3, z0, 0);
        }
        if (!chimneyDone) { chimneyDone = true; put("Roof_Prop_Chimney_Stone", w.x, base, w.z); }
    }

    // ---- windmill on the +X gable, waterwheel on the back ----
    if (f.windmill) put("Wall_Prop_Windmill_1", W + .1, Math.max(3.8, top - 1), D / 2, 0);
    if (f.waterwheel)
    {
        const zw = D + (wings[1]?.d ?? 0) + 1.2, xw = W / 2, hub = 1.6;
        put("Waterwheel_1", xw, hub, zw, 270);
        for (let k = 0; k < 4; k++) put(k === 3 ? "Waterwheel_Flume_End" : "Waterwheel_Flume_Straight", xw - .5 - k, hub + 2.3, zw, 180);
        put("Waterwheel_Flume_Support_Pillar", xw - 3, 0, zw);
    }

    // ---- ground + props ----
    const minX = -2, maxX = W + 2, minZ = -2, maxZ = D + (wings[1]?.d ?? 0) + (f.waterwheel ? 3 : 2);
    const solid = cellsAt(0);
    if (f.ground)
        for (let x = minX; x < maxX; x += 2)
            for (let z = minZ; z < maxZ; z += 2)
                if (![[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, b]) => solid.has(key(x + a, z + b)))) put("Cobblestone_Floor_1", x + 1, 0, z);
    if (f.props)
    {
        const used = new Set(solid);
        if (f.tunnel) for (let x = minX; x < maxX; x++) { used.add(key(x, tz)); used.add(key(x, tz + 1)); }
        const items: PieceName[] = ["Prop_Barrel_1", "Prop_Barrel_2", "Prop_Barrel_1_Open", "Prop_Crate_1", "Prop_Crate_1_Open", "Prop_Hay_1", "Prop_Lamp_Street", "Prop_Broom", "Prop_Cart_1", "Prop_Cart_1_Hay", "Prop_Cart_1_Barrels", "Prop_Well_1"];
        let well = false;
        for (let n = rng.int(3, 9); n > 0; n--)
        {
            const x = rng.int(minX, maxX), z = rng.int(minZ, maxZ);
            if (used.has(key(x, z)) || (z === -1 && balconyFloor > 0)) continue;
            let piece = rng.pick(items)!;
            if (piece === "Prop_Well_1") { if (well) continue; well = true; }
            const big = piece.startsWith("Prop_Cart") || piece === "Prop_Well_1";
            if (big && [[1, 0], [0, 1], [0, 2], [-1, 0]].some(([a, b]) => used.has(key(x + a, z + b)))) piece = "Prop_Barrel_1";
            used.add(key(x, z));
            if (big) for (const [a, b] of [[1, 0], [0, 1], [0, 2], [-1, 0], [1, 1], [-1, 1]]) used.add(key(x + a, z + b));
            put(piece, x, 0, z, rng.pick([0, 90, 180, 270])!);
        }
    }

    // centre on the origin
    const cx = (W - 1) / 2, cz = (D + (wings[1]?.d ?? 0) - 1) / 2;
    for (const p of out) { p.matrix[12] -= cx; p.matrix[14] -= cz; }

    return { seed, pieces: out, features: { shape, roof: profile, floors, width: W, depth: D, windows: family, ...f } };
}
