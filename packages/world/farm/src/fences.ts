import type { Random } from "@papit/random";
import type { FarmLayout, FarmOptions, Line } from "./types";

const key = ([x, z]: [number, number]) => `${x.toFixed(2)},${z.toFixed(2)}`;

/** fence loops around pastures, one gate per pasture (the edge nearest the court). Returns the gates. */
export function fences(layout: FarmLayout, o: FarmOptions, rnd: Random): [number, number][] {
    const { cells, neighbours: nb } = layout, gates: [number, number][] = [];
    const court = layout.court ?? { x: layout.area.x, z: layout.area.z };
    // pastures always, some fields too (a field next to a pasture shares its fence)
    const pastured = new Set(layout.pastures.flatMap(p => p.cells));
    const areas = [
        ...layout.pastures.filter(p => p.cells.length).map(p => ({ cells: p.cells, style: o.fence.styles.pasture })),
        ...layout.fields.filter(() => rnd.chance(o.fence.fields)).map(f => ({ cells: f.cells, style: o.fence.styles.field })),
    ];
    for (const p of areas) {
        const style = p.style[rnd.int(0, p.style.length)];
        const own = new Set(p.cells);
        // boundary edges, counter clockwise per cell, so they chain into loops
        const next = new Map<string, [[number, number], [number, number]]>();
        for (const c of p.cells) for (let i = 0; i < 4; i++) {
            // fields: only toward land that is no field / pasture (no fence between two fields)
            const n = nb[c * 4 + i];
            if (own.has(n) || (p.style === o.fence.styles.field && n >= 0 && (pastured.has(n) || cells[n].zone === "field"))) continue;
            const a = cells[c].corners[i], b = cells[c].corners[(i + 1) % 4];
            next.set(key(a), [a, b]);
        }
        // gate: the boundary edge closest to the court
        let gate = "", gd = Infinity;
        for (const [k, [a, b]] of next) {
            const d = Math.hypot((a[0] + b[0]) / 2 - court.x, (a[1] + b[1]) / 2 - court.z);
            if (d < gd) { gd = d; gate = k; }
        }
        // the gate: a gap of `o.fence.gate` metres in the middle of that edge
        let gA: [number, number] | undefined, gB: [number, number] | undefined;
        if (gate) {
            const [a, b] = next.get(gate)!, m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            const h = Math.min(o.fence.gate, l * .8) / 2, ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
            gA = [m[0] - ux * h, m[1] - uz * h]; gB = [m[0] + ux * h, m[1] + uz * h];
            gates.push(m);
        }
        // walk the loops, cutting at the gate so each loop is an open line
        const left = new Set(next.keys());
        while (left.size) {
            const atGate = left.has(gate);
            let start = atGate ? next.get(gate)![1] : next.get([...left][0])![0];
            if (atGate) left.delete(gate);
            const line: Line = atGate ? [gB!, start] : [start];
            for (let k = key(start); left.has(k);) {
                const [, b] = next.get(k)!; left.delete(k);
                line.push(b); k = key(b);
            }
            if (atGate) line.push(gA!);
            if (line.length > 1) { layout.fences.push(line); layout.fenceStyles.push(style); }
        }
    }
    layout.gates.push(...gates);
    return layout.gates;
}

/** fence posts along a line: segment centres + yaw, for the fence asset */
export function fenceSegments(line: Line, length: number) {
    const out: { x: number; z: number; yaw: number; length: number }[] = [];
    for (let i = 1; i < line.length; i++) {
        const [x0, z0] = line[i - 1], [x1, z1] = line[i], d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(d / length));
        for (let k = 0; k < n; k++) {
            const t = (k + .5) / n;
            out.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, yaw: Math.atan2(z1 - z0, x1 - x0), length: d / n });
        }
    }
    return out;
}

/** post spots along a line, about `spacing` apart, corners kept (for a generated fence: posts on the ground, rails follow) */
export function fencePosts(line: Line, spacing = 2.9): Line {
    const out: Line = [line[0]];
    for (let i = 1; i < line.length; i++) {
        const [x0, z0] = line[i - 1], [x1, z1] = line[i], n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / spacing));
        for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]);
    }
    return out;
}

/** a low fancy fence round the yard, only on its outer edges that no other fence uses (the house front) */
export function yardFence(layout: FarmLayout, yard: number[], o: FarmOptions) {
    const { cells, neighbours: nb } = layout, own = new Set(yard), style = o.fence.styles.yard[0];
    const fenced = new Set<string>();
    for (const l of layout.fences) for (const p of l) fenced.add(key(p));
    for (const c of yard) for (let i = 0; i < 4; i++) {
        const n = nb[c * 4 + i];
        if (own.has(n)) continue;
        const a = cells[c].corners[i], b = cells[c].corners[(i + 1) % 4];
        if (fenced.has(key(a)) || fenced.has(key(b))) continue;
        // only toward open land (not fields, pastures), like a front garden
        if (n >= 0 && cells[n].zone !== "none") continue;
        layout.fences.push([a, b]); layout.fenceStyles.push(style);
    }
}

/**
 * No doubles, no crossings: an edge (corner to corner) is dropped when it runs along or crosses a fence kept before it
 * (its middle or both ends within `near` m). Edges are not resampled, so pieces keep their length.
 */
export function cutFences(layout: FarmLayout, o: FarmOptions, near = 1.5) {
    const dist = (l: Line, x: number, z: number) => {
        let d = Infinity;
        for (let i = 1; i < l.length; i++) {
            const [ax, az] = l[i - 1], [bx, bz] = l[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
            d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
        }
        return d;
    };
    const cross = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
        const s = (p: [number, number], q: [number, number], r: [number, number]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
        return s(a, b, c) * s(a, b, d) < 0 && s(c, d, a) * s(c, d, b) < 0;
    };
    const kept: Line[] = [], styles: string[] = [];
    layout.fences.forEach((line, f) => {
        let run: Line = [line[0]];
        const flush = () => { if (run.length > 1) { kept.push(run); styles.push(layout.fenceStyles[f]); } };
        for (let i = 1; i < line.length; i++) {
            const a = line[i - 1], b = line[i], m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            // along: the whole edge lies on a kept fence (touching one at a corner is fine)
            const along = kept.some(k => dist(k, m[0], m[1]) < near && dist(k, a[0], a[1]) < near && dist(k, b[0], b[1]) < near);
            const crosses = kept.some(k => k.some((p, j) => j > 0 && cross(a, b, k[j - 1], p)));
            if (along || crosses) { flush(); run = [b]; continue; }
            run.push(b);
        }
        flush();
    });
    layout.fences = kept;
    layout.fenceStyles = styles;
}
