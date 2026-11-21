import type { FarmLayout, Line } from "./types";

function inQuad(p: Line, x: number, z: number) {
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, zi] = p[i], [xj, zj] = p[j];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}
function toLine(l: Line, x: number, z: number) {
    let d = Infinity;
    for (let i = 1; i < l.length; i++) {
        const [ax, az] = l[i - 1], [bx, bz] = l[i], dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return d;
}

/**
 * Crop plants in rows over each field: per crop name a flat list x, z, yaw (rows run along the field's first cell edge).
 * `spacing[crop]` = [between rows, along a row] metres; `margin` metres kept clear at field borders and paths.
 */
export function cropRows(layout: FarmLayout, spacing: Record<string, [number, number]>, margin = 1): Map<string, number[]> {
    const out = new Map<string, number[]>();
    for (const f of layout.fields) {
        const sp = spacing[f.crop]; if (!sp || !f.cells.length) continue;
        const polys = f.cells.map(c => layout.cells[c].corners);
        const [[ax, az], [bx, bz]] = polys[0], yaw = Math.atan2(bz - az, bx - ax), c = Math.cos(yaw), s = Math.sin(yaw);
        // field bounds in the row frame
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        for (const p of polys) for (const [x, z] of p) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
        // edges of the field (cell edges whose neighbour is not in it): keep a margin there
        const own = new Set(f.cells), edges: Line[] = [];
        for (const id of f.cells) for (let i = 0; i < 4; i++) if (!own.has(layout.neighbours[id * 4 + i])) edges.push([layout.cells[id].corners[i], layout.cells[id].corners[(i + 1) % 4]]);
        const paths = layout.paths.map(p => ({ line: p.line, w: p.width / 2 + margin }));
        const list = out.get(f.crop) ?? out.set(f.crop, []).get(f.crop)!;
        // per cell: rows snapped to one grid per field so they run on across cells
        for (const id of f.cells) {
            const p = layout.cells[id].corners;
            let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
            for (const [x, z] of p) { const u = x * c + z * s, v = -x * s + z * c; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
            const near = edges.filter(e => e.some(([x, z]) => x > x0 - 20 && x < x1 + 20 && z > z0 - 20 && z < z1 + 20));
            const pnear = paths.filter(q => q.line.some(([x, z]) => x > x0 - 20 && x < x1 + 20 && z > z0 - 20 && z < z1 + 20));
            for (let v = Math.ceil((b0 - v0) / sp[0]) * sp[0] + v0; v < b1; v += sp[0]) for (let u = Math.ceil((a0 - u0) / sp[1]) * sp[1] + u0; u < a1; u += sp[1]) {
                const x = u * c - v * s, z = u * s + v * c;
                if (!inQuad(p, x, z)) continue;
                if (near.some(e => toLine(e, x, z) < margin)) continue;
                if (pnear.some(q => toLine(q.line, x, z) < q.w)) continue;
                list.push(x, z, yaw);
            }
        }
    }
    return out;
}
