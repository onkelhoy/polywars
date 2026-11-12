import { IrregularGrid } from "@papit/irregular-grid";
import { Random } from "@papit/random";
import type { City, CityLot, CityOptions, CityStyle, Placement } from "./types";

const styles = new Map<string, CityStyle<any>>();
export const registerStyle = (style: CityStyle<any>) => void styles.set(style.name, style);
export const getStyle = (name: string) => styles.get(name);
export const styleNames = () => [...styles.keys()];

export const CITY_DEFAULTS: Omit<CityOptions, "style"> = { seed: 1, radius: 2, block: 20, street: 3, empty: .15, lot: [5, 9] };

/** Y rotation + translation applied to a column-major matrix */
function place(m: number[], x: number, z: number, angle: number): number[] {
    const c = Math.cos(angle), s = Math.sin(angle), out = m.slice();
    for (const col of [0, 4, 8, 12])
    {
        const a = m[col], b = m[col + 2];
        out[col] = c * a + s * b;
        out[col + 2] = -s * a + c * b;
    }
    out[12] += x; out[14] += z;
    return out;
}

/**
 * Lots on the papit irregular grid: every quad cell is a block, streets run along the cell edges.
 * Each block gets the biggest rectangle that fits its inset quad, aligned to its longest edge,
 * cut into lots along its two long sides, every lot facing its street. Empty blocks become squares.
 */
export function city(options: Partial<CityOptions> & { style: string }): City {
    const o = { ...CITY_DEFAULTS, ...options };
    const style = styles.get(o.style);
    if (!style) throw new Error(`city style "${o.style}" is not registered`);
    const rng = new Random(o.seed);
    const grid = IrregularGrid.hex({ radius: o.radius, seed: o.seed, size: o.block * 2 });
    const P = grid.positions;
    const lots: CityLot[] = [], pieces: Placement[] = [];

    for (let cell = 0; cell < grid.cellCount; cell++)
    {
        const v = [0, 1, 2, 3].map(i => grid.cells[cell * 4 + i]);
        const pts = v.map(i => [P[i * 2], P[i * 2 + 1]]);
        const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cz = pts.reduce((a, p) => a + p[1], 0) / 4;
        // longest edge sets the angle
        let angle = 0, longest = 0;
        for (let i = 0; i < 4; i++)
        {
            const [a, b] = [pts[i], pts[(i + 1) % 4]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (len > longest) { longest = len; angle = -Math.atan2(b[1] - a[1], b[0] - a[0]); }
        }
        // half extents: shrink a rectangle until all corners are inside the quad minus the street
        const inside = (x: number, z: number) => {
            for (let i = 0; i < 4; i++)
            {
                const [a, b] = [pts[i], pts[(i + 1) % 4]];
                const ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez);
                const cross = (ex * (z - a[1]) - ez * (x - a[0])) / len;
                if (Math.abs(cross) < o.street / 2 + 1) return false;
                if (Math.sign(cross) !== Math.sign((ex * (cz - a[1]) - ez * (cx - a[0])))) return false;
            }
            return true;
        };
        const c = Math.cos(angle), s = Math.sin(angle);
        // start from the quad's area over its longest edge, shrink until it fits
        let area = 0;
        for (let i = 0; i < 4; i++) { const [a, b] = [pts[i], pts[(i + 1) % 4]]; area += a[0] * b[1] - b[0] * a[1]; }
        let hw = longest / 2, hd = Math.abs(area) / 2 / longest / 2;
        const fits = (w: number, d: number) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, b]) => inside(cx + c * a * w + s * b * d, cz - s * a * w + c * b * d));
        // biggest uniform scale that fits, then grow each side alone
        let lo = 0, hi = 1;
        for (let k = 0; k < 20; k++) { const t = (lo + hi) / 2; if (fits(hw * t, hd * t)) lo = t; else hi = t; }
        hw *= lo; hd *= lo;
        for (let k = 0; k < 40 && fits(hw * 1.02, hd); k++) hw *= 1.02;
        for (let k = 0; k < 40 && fits(hw, hd * 1.02); k++) hd *= 1.02;
        const width = Math.floor(hw * 2), depth = Math.floor(hd * 2), seed = rng.uint() >>> 0;
        const add = (lot: CityLot, built: Placement[]) => { lots.push(lot); for (const p of built) pieces.push({ piece: p.piece, matrix: place(p.matrix, lot.x, lot.z, lot.angle) }); };
        if (rng.chance(o.empty) || width < 4 || depth < 4)
        {
            const lot: CityLot = { cell, x: cx, z: cz, angle, width, depth, seed, empty: true };
            add(lot, style.square?.(lot, seed) ?? []);
            continue;
        }
        // rows along the front (+Z) and, when deep enough, the back (-Z) of the block
        const rows = depth >= 12 ? [1, -1] : [1], d = Math.min(12, Math.floor(depth / rows.length));
        const lr = new Random(seed);
        for (const side of rows)
        {
            let x = -width / 2;
            while (width / 2 - x >= o.lot[0])
            {
                let w = lr.int(o.lot[0], o.lot[1] + 1);
                if (width / 2 - x - w < o.lot[0]) w = Math.floor(width / 2 - x);
                const lx = (x + w / 2) * side, lz = (depth / 2 - d / 2) * side;
                const lot: CityLot = { cell, x: cx + c * lx + s * lz, z: cz - s * lx + c * lz, angle: angle + (side < 0 ? Math.PI : 0), width: w, depth: d, seed: lr.uint() >>> 0, empty: false };
                add(lot, style.build(lot, lot.seed));
                x += w;
            }
        }
    }

    const streets: City["streets"] = [];
    for (let e = 0; e < grid.edgeCount; e++)
    {
        const a = grid.edges[e * 2], b = grid.edges[e * 2 + 1];
        const [x0, z0, x1, z1] = [P[a * 2], P[a * 2 + 1], P[b * 2], P[b * 2 + 1]];
        streets.push([x0, z0, x1, z1]);
        const built = style.street?.(Math.hypot(x1 - x0, z1 - z0), o.street, new Random(o.seed).fork(`street:${e}`).uint() >>> 0) ?? [];
        // tiny lift per street so crossings don't z-fight
        for (const p of built) { const m = place(p.matrix, x0, z0, -Math.atan2(z1 - z0, x1 - x0)); m[13] += (e % 7) * .002; pieces.push({ piece: p.piece, matrix: m }); }
    }
    return { lots, streets, pieces };
}
