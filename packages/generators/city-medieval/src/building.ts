import { Random } from "@papit/random";
import type { PieceName } from "./catalog";
import { CHANCE } from "./settings";
import type { Building, Placement, Range, Settings, Tri } from "./types";

type V = [number, number];

// the four faces, going round: outward normal, rotation (local +X faces outward), run (local +Z after rotation)
const FACES: { n: V; deg: number; run: V }[] = [
    { n: [1, 0], deg: 0, run: [0, 1] }, { n: [0, 1], deg: 270, run: [-1, 0] },
    { n: [-1, 0], deg: 180, run: [0, -1] }, { n: [0, -1], deg: 90, run: [1, 0] },
];
/** metres a roof row rises per cell */
const RISE = { Straight: 1, Convex: .5, Concave: .5 };
/** height of the roof pieces' foot, below the tiles */
const FOOT = .2;
/** storey height in cells */
const STOREY = 2;

export function matrix(x: number, y: number, z: number, deg = 0, mirror = false): number[] {
    const r = deg * Math.PI / 180, c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r)), m = mirror ? -1 : 1;
    return [c, 0, -s, 0, 0, 1, 0, 0, s * m, 0, c * m, 0, x, y, z, 1];
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * One medieval house from the Modular Village kit, same settings + seed = same house.
 * Cells are 1 m, centre of cell (x, z) at (x, z), the house fills x 0..width-1, z 0..depth-1, ridge along x.
 * Walls are 1 m blocks facing local +X; cladding and timber sit in the cell outside the wall.
 * Build: stone base (1 m), stucco + timber frame above, gable roof with rakes and ridge.
 */
export function building(settings: Settings, seed: number): Building {
    const rng = new Random(seed);
    const range = ([a, b]: Range) => rng.int(Math.min(a, b), Math.max(a, b) + 1);
    const on = (name: keyof Settings) => {
        const t = settings[name] as Tri;
        return t === "on" || (t === "random" && rng.chance(CHANCE[name as keyof typeof CHANCE] ?? .5));
    };
    const depth = even(range(settings.depth)), width = Math.max(depth, Math.round(range(settings.width)));
    const floors = Math.max(1, range(settings.floors));
    const profile = settings.roof === "random" ? rng.pick(["Straight", "Straight", "Convex", "Concave"] as const)! : settings.roof;
    const family = rng.pick(["Single", "Double", "Rounded"] as const)!;
    const timber = on("timber"), chimney = on("chimney");
    const pieces: Placement[] = [];
    const put = (piece: PieceName, x: number, y: number, z: number, deg = 0, mirror = false) => pieces.push({ piece, matrix: matrix(x, y, z, deg, mirror) });
    const top = floors * STOREY;

    // ---- walls ----
    const filled = new Set<string>();
    const block = (x: number, y: number, z: number) => {
        const k = `${x},${y},${z}`;
        if (!filled.has(k)) { filled.add(k); put("Stucco_Block", x, y, z); }
    };
    const start: V[] = [[width - 1, 0], [width - 1, depth - 1], [0, depth - 1], [0, 0]];
    const door = Math.max(1, Math.min(width - 3, rng.int(1, width - 2)));
    FACES.forEach((face, f) => {
        const length = f % 2 ? width : depth, front = f === 1;
        const at = (i: number): V => [start[f][0] + face.run[0] * i, start[f][1] + face.run[1] * i];
        const out = (i: number): V => { const [x, z] = at(i); return [x + face.n[0], z + face.n[1]]; };
        // window bays, the same on every storey so they line up: 1 = narrow, 2 = wide (two cells)
        const bays: number[] = new Array(length).fill(0);
        for (let i = 1; i < length - 1;)
        {
            const wide = i + 1 < length - 1 && rng.chance(.35);
            bays[i] = wide ? 2 : 1;
            i += wide ? 3 : 2;
        }
        // centre the pattern when a blank cell is left at the end
        for (let s = 0; s < floors; s++)
        {
            const y = s * STOREY;
            for (let i = 0; i < length; i++)
            {
                const [x, z] = at(i), [ox, oz] = out(i);
                const isDoor = s === 0 && front && (i === door || i === door + 1);
                if (isDoor)
                {
                    if (i === door) { put(`Stone_to_Stucco_Doorway_Wide_Tall_${rng.int(1, 3)}` as PieceName, x, y, z, face.deg); filled.add(`${x},${y},${z}`); filled.add(`${x},${y + 1},${z}`); put("Wall_Prop_Door_Simple", x + face.run[0] * .5, y, z + face.run[1] * .5, face.deg); }
                    else { filled.add(`${x},${y},${z}`); filled.add(`${x},${y + 1},${z}`); }
                    continue;
                }
                const covered = bays[i - 1] === 2;
                const bay = s === 0 && front && (i + 1 === door) && bays[i] === 2 ? 1 : bays[i];
                if (s === 0)
                {
                    // stone base, windows in the row above
                    block(x, y, z);
                    put(`Stone_Wall_${rng.int(1, 6)}` as PieceName, ox, y, oz, face.deg);
                    if (covered) filled.add(`${x},${y + 1},${z}`);
                    else if (bay) { put(`Stucco_Window_${family}_${bay === 2 ? "Wide" : "Narrow"}` as PieceName, x, y + 1, z, face.deg); filled.add(`${x},${y + 1},${z}`); }
                    else block(x, y + 1, z);
                }
                else if (covered) { filled.add(`${x},${y},${z}`); filled.add(`${x},${y + 1},${z}`); }
                else if (bay) { put(`Stucco_Window_${family}_${bay === 2 ? "Wide" : "Narrow"}_Tall` as PieceName, x, y, z, face.deg); filled.add(`${x},${y},${z}`); filled.add(`${x},${y + 1},${z}`); }
                else { block(x, y, z); block(x, y + 1, z); }

                if (!timber) continue;
                // beams on the storey lines, posts at the corners and beside the windows
                for (const by of s === 0 ? [1, STOREY] : [y + STOREY]) put(`Stucco_Prop_Support_Beam_${rng.int(1, 4)}` as PieceName, ox, by, oz, face.deg);
                const post = i === length - 1 || !!bays[i] !== !!bays[i + 1] || (bays[i] === 1 && bays[i + 1] > 0);
                if (post && bays[i] !== 2) for (let py = s === 0 ? 1 : y; py < y + STOREY; py++) put(`Stucco_Prop_Support_Pillar_${rng.int(1, 4)}` as PieceName, ox, py, oz, face.deg);
            }
        }
    });

    // ---- roof: two slopes meeting on a ridge along x ----
    const rows = depth / 2, rise = RISE[profile], peak = top + rows * rise + FOOT;
    for (let k = 0; k < rows; k++) for (let x = 0; x < width; x++)
    {
        const name = `Roof_${profile}_Side${k === 0 ? "_Eave" : ""}${x === 0 || x === width - 1 ? "_Edge" : ""}` as PieceName;
        // the edge overhang is on local -Z: mirror it on the other gable
        put(name, x, top + k * rise, depth - 1 - k, 270, x === 0);
        put(name, x, top + k * rise, k, 90, x === width - 1);
    }
    for (let x = 0; x < width; x++) put("Roof_Accent_Ridge", x, peak - .2, rows - 1, 0);
    // gable walls under the upper roof rows, with a king post
    for (const x of [0, width - 1]) for (let k = 1; k < rows; k++) for (const z of [k, depth - 1 - k])
    {
        const m = matrix(x, top, z);
        m[5] = k * rise;
        pieces.push({ piece: "Stucco_Block", matrix: m });
    }
    if (timber) for (const f of [0, 2])
    {
        const m = matrix(f ? -1 : width, top, f ? depth / 2 : depth / 2 - 1, FACES[f].deg);
        m[5] = (rows - 1) * rise + FOOT;
        if (rows > 1) pieces.push({ piece: "Stucco_Prop_Support_Pillar_1", matrix: m });
    }
    if (chimney) put("Roof_Prop_Chimney_Stone", rng.int(1, Math.max(2, width - 1)), peak - 1.1, rows + .1);

    return { seed, pieces, features: { width, depth, floors, roof: profile, windows: family, timber, chimney } };
}
