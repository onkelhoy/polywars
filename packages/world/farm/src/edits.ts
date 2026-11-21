import type { FarmGround, FarmLayout, GroundEdit, Line, Paint, Zone } from "./types";

/** point in polygon (even odd) */
function inPoly(p: Line, x: number, z: number) {
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, zi] = p[i], [xj, zj] = p[j];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}
/** distance to a polyline */
function toLine(l: Line, x: number, z: number) {
    let d = Infinity;
    for (let i = 1; i < l.length; i++) {
        const [ax, az] = l[i - 1], [bx, bz] = l[i], dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return d;
}
function bounds(e: GroundEdit): [number, number, number, number] {
    if (e.kind === "flatten") { const r = Math.hypot(e.w, e.d) / 2 + e.blend; return [e.x - r, e.z - r, e.x + r, e.z + r]; }
    const pts = "poly" in e ? e.poly : e.line, pad = "line" in e ? e.width / 2 : 0;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, z] of pts) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); }
    return [a - pad, b - pad, c + pad, d + pad];
}
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The farm's ground edits as samplers, for terrain / grass / paint to read.
 * `height`: ground with flatten pads blended in. `paint`: top paint here or null. `grass`: 0 none .. 1 keep.
 */
export function groundEdits(ground: FarmGround, edits: GroundEdit[], bucket = 16) {
    const grid = new Map<string, number[]>();
    edits.forEach((e, i) => {
        const [a, b, c, d] = bounds(e);
        for (let gx = Math.floor(a / bucket); gx <= Math.floor(c / bucket); gx++)
            for (let gz = Math.floor(b / bucket); gz <= Math.floor(d / bucket); gz++) {
                const k = gx + "," + gz; (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
            }
    });
    const near = (x: number, z: number) => grid.get(Math.floor(x / bucket) + "," + Math.floor(z / bucket)) ?? [];
    /** 0..1 how much a shape covers (lines: soft edge of half a metre) */
    const cover = (e: GroundEdit & ({ poly: Line } | { line: Line; width: number }), x: number, z: number) =>
        "poly" in e ? (inPoly(e.poly, x, z) ? 1 : 0) : smooth(Math.max(0, Math.min(1, (e.width / 2 - toLine(e.line, x, z)) / .5 + .5)));

    return {
        height(x: number, z: number) {
            let y = ground.height(x, z);
            for (const i of near(x, z)) {
                const e = edits[i]; if (e.kind !== "flatten") continue;
                const c = Math.cos(e.yaw), s = Math.sin(e.yaw), lx = (x - e.x) * c + (z - e.z) * s, lz = -(x - e.x) * s + (z - e.z) * c;
                const out = Math.hypot(Math.max(0, Math.abs(lx) - e.w / 2), Math.max(0, Math.abs(lz) - e.d / 2));
                if (out < e.blend) y += (e.y - y) * smooth(1 - out / e.blend);
            }
            return y;
        },
        paint(x: number, z: number): Paint | null {
            let top: Paint | null = null;
            for (const i of near(x, z)) { const e = edits[i]; if (e.kind === "paint" && cover(e, x, z) > .5) top = e.paint; }
            return top;
        },
        grass(x: number, z: number) {
            let g = 1;
            for (const i of near(x, z)) { const e = edits[i]; if (e.kind === "noGrass") g = Math.min(g, 1 - cover(e, x, z)); }
            return g;
        },
    };
}

/** zone under a point: nearest cell centre inside the area, "none" outside */
export function zoneAt(layout: FarmLayout, bucket = 32) {
    const grid = new Map<string, number[]>();
    for (const c of layout.cells) if (c.inside) { const k = Math.floor(c.x / bucket) + "," + Math.floor(c.z / bucket); (grid.get(k) ?? grid.set(k, []).get(k)!).push(c.id); }
    const { x: ax, z: az, radius } = layout.area;
    return (x: number, z: number): Zone => {
        if (Math.hypot(x - ax, z - az) > radius) return "none";
        let best = -1, bd = Infinity;
        const i = Math.floor(x / bucket), j = Math.floor(z / bucket);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const c of grid.get(i + a + "," + (j + b)) ?? []) {
            const d = Math.hypot(layout.cells[c].x - x, layout.cells[c].z - z); if (d < bd) { bd = d; best = c; }
        }
        return best < 0 ? "none" : layout.cells[best].zone;
    };
}
