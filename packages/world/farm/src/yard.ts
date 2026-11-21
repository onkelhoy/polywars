import type { Random } from "@papit/random";
import type { FarmGround, FarmLayout, FarmOptions, FarmPiece, Line } from "./types";

/** rectangle corners, xz */
export function rect(x: number, z: number, w: number, d: number, yaw: number, grow = 0): Line {
    const c = Math.cos(yaw), s = Math.sin(yaw), hw = w / 2 + grow, hd = d / 2 + grow;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [x + a * c - b * s, z + a * s + b * c] as [number, number]);
}

/** separating axis test for two rectangles */
function overlap(a: Line, b: Line) {
    for (const p of [a, b]) for (let i = 0; i < 4; i++) {
        const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % 4], nx = z0 - z1, nz = x1 - x0;
        let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
        for (const [x, z] of a) { const v = x * nx + z * nz; amin = Math.min(amin, v); amax = Math.max(amax, v); }
        for (const [x, z] of b) { const v = x * nx + z * nz; bmin = Math.min(bmin, v); bmax = Math.max(bmax, v); }
        if (amax < bmin || bmax < amin) return false;
    }
    return true;
}

/** footprint: mean height to sit on, and how uneven it is */
function seat(g: FarmGround, poly: Line) {
    const hs = poly.map(([x, z]) => g.height(x, z));
    const mean = hs.reduce((a, b) => a + b, 0) / hs.length;
    return { y: mean, rough: Math.max(...hs) - Math.min(...hs) };
}

/** buildings on yard cells, yaw along the cell edges; landmarks on the high ground */
export function placeYard(layout: FarmLayout, yard: number[], ground: FarmGround, o: FarmOptions, rnd: Random) {
    const { cells } = layout, taken: Line[] = [];
    if (!yard.length) return;
    const cx = yard.reduce((a, c) => a + cells[c].x, 0) / yard.length, cz = yard.reduce((a, c) => a + cells[c].z, 0) / yard.length;
    // the yard's main direction: its start cell's first edge, so buildings line up
    const [[ax, az], [bx, bz]] = cells[yard[0]].corners, main = Math.atan2(bz - az, bx - ax);
    // keep the yard middle open (the court)
    const court = rect(cx, cz, 10, 10, main);
    const place = (p: FarmPiece, spots: number[], yawOf: (c: number) => number) => {
        for (const c of spots) for (let k = 0; k < 6; k++) {
            const cell = cells[c], yaw = yawOf(c) + (k % 2) * Math.PI / 2 + (k > 1 ? Math.PI : 0);
            const jitter = k > 3 ? 2 : 0, x = cell.x + rnd.float(-jitter, jitter), z = cell.z + rnd.float(-jitter, jitter);
            const foot = rect(x, z, p.w, p.d, yaw, o.yard.gap / 2);
            if (taken.some(t => overlap(t, foot)) || (p.asset !== "Well" && overlap(court, foot))) continue;
            // corners must stay on the farm and dry
            if (foot.some(([fx, fz]) => ground.water?.(fx, fz) || Math.hypot(fx - layout.area.x, fz - layout.area.z) > layout.area.radius)) continue;
            const s = seat(ground, rect(x, z, p.w, p.d, yaw));
            if (s.rough > Math.max(p.w, p.d) * o.yard.maxSlope) continue;
            taken.push(foot);
            layout.buildings.push({ asset: p.asset, x, z, y: s.y, yaw, w: p.w, d: p.d });
            // flatten only when the ground is not already flat
            if (s.rough > .15) layout.edits.push({ kind: "flatten", x, z, w: p.w, d: p.d, yaw, y: s.y, blend: 3 });
            layout.edits.push({ kind: "noGrass", poly: rect(x, z, p.w, p.d, yaw, .5) }, { kind: "paint", paint: "dirt", poly: rect(x, z, p.w, p.d, yaw, 1.5) });
            return true;
        }
        return false;
    };
    // around the court, nearest cells first; the well in the court
    const byNear = [...yard].sort((a, b) => Math.hypot(cells[a].x - cx, cells[a].z - cz) - Math.hypot(cells[b].x - cx, cells[b].z - cz));
    for (const p of o.yard.pieces) {
        if (p.asset === "Well") { const foot = rect(cx, cz, p.w, p.d, main); if (!taken.some(t => overlap(t, foot))) { taken.push(foot); layout.buildings.push({ asset: p.asset, x: cx, z: cz, y: ground.height(cx, cz), yaw: main, w: p.w, d: p.d }); } continue; }
        // face the court: yaw toward the centre, snapped to the main grid direction
        place(p, byNear, c => {
            const to = Math.atan2(cz - cells[c].z, cx - cells[c].x) - main;
            return main + Math.round(to / (Math.PI / 2)) * Math.PI / 2;
        });
    }
    // yard dirt court
    layout.edits.push({ kind: "noGrass", poly: rect(cx, cz, 12, 12, main) }, { kind: "paint", paint: "gravel", poly: rect(cx, cz, 14, 14, main) });
    // landmarks: highest free cells (windmill on the hill)
    const high = cells.filter(c => c.inside && !c.water && (c.zone === "none" || c.zone === "pasture")).sort((a, b) => b.y - a.y).map(c => c.id);
    for (const p of o.landmark) place(p, high.slice(0, 12), () => rnd.float(0, Math.PI * 2));
    layout.court = { x: cx, z: cz, yaw: main };
}
