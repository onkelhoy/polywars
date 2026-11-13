import type { Grid } from "./grid";
import { toXZ } from "./grid";
import { BRIDGE, TUNNEL } from "./route";
import type { ClassOptions, Span } from "./types";

type P = [number, number];
export type Plan = { points: [number, number, number][]; spans: Span[] };

/** routing cells of straight ground a bridge / tunnel lands on (the router keeps them, shaping keeps them straight) */
export const runout = (c: ClassOptions, cell: number) => Math.max(1, Math.min(4, Math.round(Math.min(40, c.minRadius * .25) / cell)));

/**
 * Grid route → road line in plan: ground runs simplified (Douglas–Peucker) and every corner rounded with an arc of
 * the class `minRadius` (smaller only where the straight bits around it are too short); bridges, tunnels and their
 * straight run outs never bend. Resampled every `step` m, y = ground. `ends` replace the first / last point (junctions).
 */
export function planRoute(grid: Grid, nodes: number[], tags: number[], c: ClassOptions, step: number, heightAt: (x: number, z: number) => number, ends: [P | null, P | null] = [null, null]): Plan {
    // vertices with the kind of the segment that follows; rigid segments keep both their vertices
    const v: P[] = [toXZ(grid, nodes[0])], kind: Span["kind"][] = [], rigid: boolean[] = [];
    const run = runout(c, grid.cell), m = grid.m;
    for (let s = 1; s < nodes.length; s++)
    {
        const p = toXZ(grid, nodes[s]), a = v[v.length - 1];
        if (tags[s] === BRIDGE || tags[s] === TUNNEL)
        {
            // a jump: `run` cells of straight ground, the bridge / tunnel, `run` cells of straight ground (router `jumps`)
            const di = Math.abs(nodes[s] % m - nodes[s - 1] % m), dj = Math.abs(((nodes[s] / m) | 0) - ((nodes[s - 1] / m) | 0));
            const cells = gcd(di, dj) || 1, f = Math.min(.45, run / cells), q = (t: number): P => [a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t];
            v.push(q(f), q(1 - f), p);
            kind.push("ground", tags[s] === BRIDGE ? "bridge" : "tunnel", "ground"); rigid.push(true, true, true);
        }
        else { v.push(p); kind.push("ground"); rigid.push(false); }
    }
    if (ends[0]) v[0] = ends[0];
    if (ends[1]) v[v.length - 1] = ends[1];
    // spikes: a free vertex where the line turns back (> 100°) is a search detour: drop it (repeat)
    for (let again = true; again;)
    {
        again = false;
        for (let i = 1; i < v.length - 1; i++)
        {
            if (rigid[i - 1] || rigid[i]) continue;
            const ax = v[i][0] - v[i - 1][0], az = v[i][1] - v[i - 1][1], bx = v[i + 1][0] - v[i][0], bz = v[i + 1][1] - v[i][1];
            if (ax * bx + az * bz < -.17 * Math.hypot(ax, az) * Math.hypot(bx, bz))
            {
                v.splice(i, 1); kind.splice(i, 1); rigid.splice(i, 1);
                again = true; break;
            }
        }
    }

    // simplify the free runs (vertices touching a rigid segment stay)
    const keep = new Uint8Array(v.length);
    keep[0] = keep[v.length - 1] = 1;
    for (let i = 0; i < rigid.length; i++) if (rigid[i]) keep[i] = keep[i + 1] = 1;
    const tol = grid.cell * (c.minRadius > 100 ? 1.2 : c.minRadius > 30 ? .9 : .6);
    for (let a = 0; a < v.length - 1;)
    {
        let b = a + 1;
        while (b < v.length - 1 && !keep[b]) b++;
        simplify(v, a, b, tol, keep);
        a = b;
    }
    const V: P[] = [], K: Span["kind"][] = [], R: boolean[] = [];
    for (let i = 0; i < v.length; i++)
    {
        if (!keep[i]) continue;
        V.push(v[i]);
    }
    // segment kinds / rigidity between kept vertices: from the original segment after each kept vertex
    {
        let last = 0;
        for (let i = 1; i < v.length; i++)
        {
            if (!keep[i]) continue;
            // a rigid segment only survives between two kept vertices that are its own ends
            const r = i - last === 1 && rigid[last];
            K.push(i - last === 1 ? kind[last] : "ground"); R.push(r);
            last = i;
        }
    }

    // fillets: arc of radius minRadius at every corner, tangent length limited by what the segments can give
    const seg = (i: number) => Math.hypot(V[i + 1][0] - V[i][0], V[i + 1][1] - V[i][1]);
    const giveAt = (i: number, other: boolean) => {
        // how much of segment i a corner may use: none of a bridge / tunnel, all of a run out, half of a free segment
        if (R[i]) return K[i] === "ground" ? seg(i) * .95 : 0;
        return seg(i) * (other ? .5 : .95);
    };
    const corners: { t: number; R: number }[] = V.map(() => ({ t: 0, R: 0 }));
    for (let i = 1; i < V.length - 1; i++)
    {
        const ax = V[i][0] - V[i - 1][0], az = V[i][1] - V[i - 1][1], bx = V[i + 1][0] - V[i][0], bz = V[i + 1][1] - V[i][1];
        const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1, cos = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)));
        const theta = Math.acos(cos);
        if (theta < .01) continue;
        const tan = Math.tan(Math.min(theta, Math.PI * .97) / 2);
        const t = Math.min(c.minRadius * tan, giveAt(i - 1, i - 1 > 0), giveAt(i, i + 1 < V.length - 1));
        corners[i] = { t, R: t / tan };
    }
    // the line: straight between fillets, arcs at corners
    const out: P[] = [V[0]], outKind: Span["kind"][] = [];
    const lerp = (a: P, b: P, d: number): P => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [a[0] + (b[0] - a[0]) * d / l, a[1] + (b[1] - a[1]) * d / l]; };
    for (let i = 1; i < V.length; i++)
    {
        const k = K[i - 1];
        if (i === V.length - 1 || corners[i].t <= 0) { out.push(V[i]); outKind.push(k); continue; }
        const { t } = corners[i], A = lerp(V[i], V[i - 1], t), B = lerp(V[i], V[i + 1], t);
        out.push(A); outKind.push(k);
        // quadratic bezier A → V → B (close to a circular arc for these angles), every ~step / 2 m
        const n = Math.max(2, Math.ceil(t * 2 / (step * .5)));
        for (let q = 1; q <= n; q++)
        {
            const s = q / n, k0 = (1 - s) * (1 - s), k1 = 2 * s * (1 - s), k2 = s * s;
            out.push([A[0] * k0 + V[i][0] * k1 + B[0] * k2, A[1] * k0 + V[i][1] * k1 + B[1] * k2]); outKind.push("ground");
        }
    }

    // runs of one kind (sharing their end points), each resampled every `step` m
    const points: [number, number, number][] = [], merged: Span[] = [];
    for (let i = 0; i < outKind.length;)
    {
        let e = i;
        while (e + 1 < outKind.length && outKind[e + 1] === outKind[i]) e++;
        const res = resample(out.slice(i, e + 2), step), from = points.length ? points.length - 1 : 0;
        for (let q = points.length ? 1 : 0; q < res.length; q++) points.push([res[q][0], heightAt(res[q][0], res[q][1]), res[q][1]]);
        if (points.length - 1 > from) merged.push({ kind: outKind[i], from, to: points.length - 1 });
        i = e + 1;
    }
    return { points, spans: merged.length ? merged : [{ kind: "ground", from: 0, to: points.length - 1 }] };
}

/**
 * Bed height: ground smoothed along the road, held to `maxGrade`, straight over bridges / through tunnels.
 * `pins` (index → y) are fixed heights (junctions), the grade eases to them.
 */
export function gradeRoute(plan: Plan, c: ClassOptions, step: number, pins: Map<number, number> = new Map()) {
    const { points, spans } = plan, n = points.length, y = points.map(p => p[1]), w = Math.max(1, Math.round(c.minRadius / (3 * step)));
    const sm = y.slice();
    for (let i = 0; i < n; i++)
    {
        let sum = 0, cnt = 0;
        for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k++) { sum += y[k]; cnt++; }
        sm[i] = sum / cnt;
    }
    const pin = () => { for (const [i, v] of pins) if (i >= 0 && i < n) sm[i] = v; };
    const straight = () => { for (const s of spans) if (s.kind !== "ground") for (let i = s.from + 1; i < s.to; i++) sm[i] = sm[s.from] + (sm[s.to] - sm[s.from]) * (i - s.from) / (s.to - s.from); };
    pin(); straight();
    const d = (i: number) => Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]);
    for (let pass = 0; pass < 3; pass++)
    {
        for (let i = 1; i < n; i++) if (!pins.has(i)) { const g = c.maxGrade * d(i); sm[i] = Math.min(sm[i - 1] + g, Math.max(sm[i - 1] - g, sm[i])); }
        for (let i = n - 2; i >= 0; i--) if (!pins.has(i)) { const g = c.maxGrade * d(i + 1); sm[i] = Math.min(sm[i + 1] + g, Math.max(sm[i + 1] - g, sm[i])); }
        pin(); straight();
    }
    for (let i = 0; i < n; i++) points[i][1] = sm[i];
}

/** plan + grade in one (single roads, route previews) */
export function shapeRoute(grid: Grid, nodes: number[], tags: number[], c: ClassOptions, step: number, heightAt: (x: number, z: number) => number): Plan {
    const p = planRoute(grid, nodes, tags, c, step, heightAt);
    gradeRoute(p, c, step);
    return p;
}

/** Douglas–Peucker between kept vertices a and b (marks `keep`) */
function simplify(p: P[], a0: number, b0: number, tol: number, keep: Uint8Array) {
    const stack: [number, number][] = [[a0, b0]];
    while (stack.length)
    {
        const [a, b] = stack.pop()!;
        if (b - a < 2) continue;
        const [ax, az] = p[a], [bx, bz] = p[b], len = Math.hypot(bx - ax, bz - az) || 1;
        let far = -1, fd = tol;
        for (let i = a + 1; i < b; i++)
        {
            const d = Math.abs((bx - ax) * (az - p[i][1]) - (ax - p[i][0]) * (bz - az)) / len;
            if (d > fd) { fd = d; far = i; }
        }
        if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
    }
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
    if (out.length > 1 && Math.hypot(last[0] - prev[0], last[1] - prev[1]) < step * .3) out[out.length - 1] = last; else out.push(last);
    return out;
}

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
