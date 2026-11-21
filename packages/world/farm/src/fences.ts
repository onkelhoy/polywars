import type { FarmLayout, FarmOptions, Line } from "./types";

const key = ([x, z]: [number, number]) => `${x.toFixed(2)},${z.toFixed(2)}`;

/** fence loops around pastures, one gate per pasture (the edge nearest the court). Returns the gates. */
export function fences(layout: FarmLayout, o: FarmOptions): [number, number][] {
    const { cells, neighbours: nb } = layout, gates: [number, number][] = [];
    const court = layout.court ?? { x: layout.area.x, z: layout.area.z };
    for (const p of layout.pastures) {
        if (!p.cells.length) continue;
        const own = new Set(p.cells);
        // boundary edges, counter clockwise per cell, so they chain into loops
        const next = new Map<string, [[number, number], [number, number]]>();
        for (const c of p.cells) for (let i = 0; i < 4; i++) {
            if (own.has(nb[c * 4 + i])) continue;
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
            if (line.length > 1) layout.fences.push(line);
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
