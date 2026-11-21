import type { FarmLayout, FarmOptions, Line, Zone } from "./types";

const COST: Record<Zone, number> = { none: 1, yard: 1, field: 2.5, pasture: 6, wood: 3 };

/** cheapest cell route (dijkstra, the grid is small) */
function route(layout: FarmLayout, from: number, to: number): number[] {
    const { cells, neighbours: nb } = layout, n = cells.length;
    const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[from] = 0;
    for (;;) {
        let u = -1, best = Infinity;
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
        if (u < 0 || u === to) break;
        done[u] = 1;
        for (let k = 0; k < 4; k++) {
            const v = nb[u * 4 + k]; if (v < 0 || done[v]) continue;
            const c = cells[v], run = Math.hypot(c.x - cells[u].x, c.z - cells[u].z), rise = Math.abs(c.y - cells[u].y);
            const w = run * (1 + (rise / run) * 12) * (c.water ? 60 : COST[c.zone]) * (c.inside ? 1 : 4);
            if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
        }
    }
    const out: number[] = [];
    for (let c = to; c >= 0; c = prev[c]) out.unshift(c);
    return out[0] === from ? out : [];
}

/** corner cutting, keeps the ends */
function smooth(l: Line, times = 2): Line {
    for (let t = 0; t < times; t++) {
        const o: Line = [l[0]];
        for (let i = 0; i < l.length - 1; i++) {
            const [ax, az] = l[i], [bx, bz] = l[i + 1];
            o.push([ax * .75 + bx * .25, az * .75 + bz * .25], [ax * .25 + bx * .75, az * .25 + bz * .75]);
        }
        o.push(l[l.length - 1]); l = o;
    }
    return l;
}

function nearest(layout: FarmLayout, x: number, z: number, ok = (_: number) => true) {
    let best = -1, bd = Infinity;
    for (const c of layout.cells) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd && ok(c.id)) { bd = d; best = c.id; } }
    return best;
}

/** lane from the road entry to the court, trails from the court to gates and fields */
export function paths(layout: FarmLayout, yard: number[], gates: [number, number][], o: FarmOptions) {
    const court = layout.court; if (!court || !yard.length) return;
    const home = nearest(layout, court.x, court.z);
    const add = (to: [number, number], kind: "lane" | "trail") => {
        const cells = route(layout, home, nearest(layout, to[0], to[1], c => !layout.cells[c].water));
        if (!cells.length) return;
        const line = smooth([[court.x, court.z], ...cells.slice(1).map(c => [layout.cells[c].x, layout.cells[c].z] as [number, number]), to]);
        const width = kind === "lane" ? o.path.lane : o.path.trail;
        layout.paths.push({ line, width, kind });
        layout.edits.push({ kind: "noGrass", line, width }, { kind: "paint", paint: "dirt", line, width: width + 1 });
    };
    if (layout.area.entry) add([layout.area.entry.x, layout.area.entry.z], "lane");
    for (const g of gates) add(g, "trail");
    // the nearest fields get a trail, the rest are reached across them
    const near = layout.fields.map(f => {
        let best = f.cells[0], bd = Infinity;
        for (const c of f.cells) { const d = Math.hypot(layout.cells[c].x - court.x, layout.cells[c].z - court.z); if (d < bd) { bd = d; best = c; } }
        return { best, bd };
    }).sort((a, b) => a.bd - b.bd).slice(0, o.path.fields);
    for (const { best } of near) add([layout.cells[best].x, layout.cells[best].z], "trail");
}
