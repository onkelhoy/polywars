import { IrregularGrid } from "@papit/irregular-grid";
import { Random } from "@papit/random";
import type { City, CityLot, CityOptions, CityStyle, Placement } from "./types";

const styles = new Map<string, CityStyle<any>>();
export const registerStyle = (style: CityStyle<any>) => void styles.set(style.name, style);
export const getStyle = (name: string) => styles.get(name);
export const styleNames = () => [...styles.keys()];

export const CITY_DEFAULTS: Omit<CityOptions, "style"> = { seed: 1, radius: 2, block: 14, street: 3, empty: .1 };

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
 * Each block gets the biggest rectangle that fits its inset quad, aligned to its longest edge.
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
                if (Math.abs(cross) < o.street / 2) return false;
                if (Math.sign(cross) !== Math.sign((ex * (cz - a[1]) - ez * (cx - a[0])))) return false;
            }
            return true;
        };
        const c = Math.cos(angle), s = Math.sin(angle);
        let hw = longest / 2, hd = longest / 2;
        const fits = () => [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, b]) => inside(cx + c * a * hw + s * b * hd, cz - s * a * hw + c * b * hd));
        for (let k = 0; k < 60 && !fits(); k++) { hw *= .95; hd *= .95; if (hd > hw * .8) hd *= .97; }
        const width = Math.floor(hw * 2), depth = Math.floor(hd * 2);
        const lot: CityLot = { cell, x: cx, z: cz, angle, width, depth, seed: rng.uint() >>> 0, empty: rng.chance(o.empty) || width < 2 || depth < 2 };
        lots.push(lot);
        if (lot.empty) continue;
        for (const p of style.build({ width, depth }, lot.seed)) pieces.push({ piece: p.piece, matrix: place(p.matrix, cx, cz, angle) });
    }

    const streets: City["streets"] = [];
    for (let e = 0; e < grid.edgeCount; e++)
    {
        const a = grid.edges[e * 2], b = grid.edges[e * 2 + 1];
        streets.push([P[a * 2], P[a * 2 + 1], P[b * 2], P[b * 2 + 1]]);
    }
    return { lots, streets, pieces };
}
