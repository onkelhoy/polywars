import type { Grid } from "./grid";
import { toXZ } from "./grid";
import { BRIDGE, TUNNEL } from "./route";
import type { ClassOptions, Span } from "./types";

type P = [number, number];

/**
 * Grid route → smooth road line: ground runs simplified (Douglas–Peucker) and rounded (Chaikin, more for big
 * `minRadius`), bridges / tunnels straight; all resampled every `step` m. Bed height: ground smoothed along the road,
 * held to `maxGrade`, straight over bridges / through tunnels.
 */
export function shapeRoute(grid: Grid, nodes: number[], tags: number[], c: ClassOptions, step: number, heightAt: (x: number, z: number) => number): { points: [number, number, number][]; spans: Span[] } {
    // pieces: [kind, xz list]
    const pieces: [Span["kind"], P[]][] = [];
    let run: P[] = [toXZ(grid, nodes[0])];
    for (let s = 1; s < nodes.length; s++)
    {
        const p = toXZ(grid, nodes[s]);
        if (tags[s])
        {
            if (run.length > 1) pieces.push(["ground", run]);
            pieces.push([tags[s] === BRIDGE ? "bridge" : tags[s] === TUNNEL ? "tunnel" : "ground", [run[run.length - 1], p]]);
            run = [p];
        }
        else run.push(p);
    }
    if (run.length > 1 || !pieces.length) pieces.push(["ground", run]);

    const tolerance = grid.cell * (c.minRadius > 100 ? 1.5 : c.minRadius > 30 ? 1 : .6);
    const rounds = Math.max(1, Math.min(5, Math.round(Math.log2(Math.max(1, c.minRadius / grid.cell))) + 1));
    const points: [number, number, number][] = [], spans: Span[] = [];
    for (const [kind, list] of pieces)
    {
        let line = list;
        if (kind === "ground" && line.length > 2) line = chaikin(simplify(line, tolerance), rounds);
        const res = resample(line, step), from = points.length ? points.length - 1 : 0;
        for (let i = points.length ? 1 : 0; i < res.length; i++) points.push([res[i][0], heightAt(res[i][0], res[i][1]), res[i][1]]);
        spans.push({ kind, from, to: points.length - 1 });
    }
    grade(points, spans, c, step);
    return { points, spans };
}

function grade(points: [number, number, number][], spans: Span[], c: ClassOptions, step: number) {
    const n = points.length, y = points.map(p => p[1]), w = Math.max(1, Math.round(c.minRadius / (3 * step)));
    // smooth along the road (window w)
    const sm = y.slice();
    for (let i = 0; i < n; i++)
    {
        let sum = 0, cnt = 0;
        for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k++) { sum += y[k]; cnt++; }
        sm[i] = sum / cnt;
    }
    const straight = () => { for (const s of spans) if (s.kind !== "ground") for (let i = s.from + 1; i < s.to; i++) sm[i] = sm[s.from] + (sm[s.to] - sm[s.from]) * (i - s.from) / (s.to - s.from); };
    straight();
    const d = (i: number) => Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]);
    for (let pass = 0; pass < 2; pass++)
    {
        for (let i = 1; i < n; i++) { const g = c.maxGrade * d(i); sm[i] = Math.min(sm[i - 1] + g, Math.max(sm[i - 1] - g, sm[i])); }
        for (let i = n - 2; i >= 0; i--) { const g = c.maxGrade * d(i + 1); sm[i] = Math.min(sm[i + 1] + g, Math.max(sm[i + 1] - g, sm[i])); }
        straight();
    }
    for (let i = 0; i < n; i++) points[i][1] = sm[i];
}

function simplify(p: P[], tol: number): P[] {
    if (p.length < 3) return p;
    const keep = new Uint8Array(p.length);
    keep[0] = keep[p.length - 1] = 1;
    const stack: [number, number][] = [[0, p.length - 1]];
    while (stack.length)
    {
        const [a, b] = stack.pop()!;
        const [ax, az] = p[a], [bx, bz] = p[b], len = Math.hypot(bx - ax, bz - az) || 1;
        let far = -1, fd = tol;
        for (let i = a + 1; i < b; i++)
        {
            const d = Math.abs((bx - ax) * (az - p[i][1]) - (ax - p[i][0]) * (bz - az)) / len;
            if (d > fd) { fd = d; far = i; }
        }
        if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
    }
    return p.filter((_, i) => keep[i]);
}

function chaikin(p: P[], rounds: number): P[] {
    for (let r = 0; r < rounds; r++)
    {
        const out: P[] = [p[0]];
        for (let i = 0; i < p.length - 1; i++)
        {
            const [ax, az] = p[i], [bx, bz] = p[i + 1];
            out.push([ax * .75 + bx * .25, az * .75 + bz * .25], [ax * .25 + bx * .75, az * .25 + bz * .75]);
        }
        out.push(p[p.length - 1]);
        p = out;
    }
    return p;
}

function resample(p: P[], step: number): P[] {
    const out: P[] = [p[0]];
    let carry = 0;
    for (let i = 0; i < p.length - 1; i++)
    {
        const [ax, az] = p[i], [bx, bz] = p[i + 1], len = Math.hypot(bx - ax, bz - az);
        let t = step - carry;
        while (t < len) { out.push([ax + (bx - ax) * t / len, az + (bz - az) * t / len]); t += step; }
        carry = len - (t - step);
    }
    const last = p[p.length - 1], prev = out[out.length - 1];
    if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) > step * .3) out.push(last); else out[out.length - 1] = last;
    return out;
}
