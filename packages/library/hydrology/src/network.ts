import type { Random } from "@papit/random";
import { drainage, sample } from "./grid";
import type { Ground, HydrologyOptions, Lake } from "./types";

/** a planned path before carving: x, z, width, catchment share per point; `sea` = ends in the sea */
export type Path = { x: number[]; z: number[]; w: number[]; order: number; sea: boolean; parent: number };

const smoothstep = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Streams on the drainage tree of the (raw) map: nodes over the catchment, traced from their sources down to the sea,
 * the map edge or a bigger stream (longest first, so main stems stay whole). Lakes always send a river out.
 * Then smoothed, given S curves on flat ground and split into deltas at big mouths.
 */
export function plan(g: Ground, o: HydrologyOptions, lakes: Lake[], rng: Random): Path[] {
    const { n, size, height: h, seaLevel } = g, cell = size / (n - 1), half = size / 2, total = n * n;
    const d = drainage(h, n, seaLevel), { down, acc, sea } = d, threshold = Math.max(4, o.catchment / (cell * cell));
    // lakes overflow: their outlet always carries a river
    for (const l of lakes)
    {
        let k = Math.round((l.z + half) / cell) * n + Math.round((l.x + half) / cell);
        for (let steps = 0; k >= 0 && !sea[k] && steps < total; steps++, k = down[k]) acc[k] += threshold * 1.5;
    }
    const is = (k: number) => acc[k] >= threshold && !sea[k];
    const fed = new Uint8Array(total);
    for (let k = 0; k < total; k++) if (is(k) && down[k] >= 0 && is(down[k])) fed[down[k]] = 1;
    const sources: number[] = [], len = new Map<number, number>();
    for (let k = 0; k < total; k++) if (is(k) && !fed[k])
    {
        let c = 0;
        for (let m = k; m >= 0 && !sea[m]; m = down[m]) c++;
        sources.push(k); len.set(k, c);
    }
    sources.sort((a, b) => len.get(b)! - len.get(a)!);

    const owner = new Int32Array(total).fill(-1), raw: { nodes: number[]; parent: number; sea: boolean }[] = [];
    for (const s of sources)
    {
        const nodes = [s];
        let parent = -1, toSea = false;
        for (let k = down[s]; ; k = down[k])
        {
            if (k < 0) break;
            nodes.push(k);
            if (sea[k]) { toSea = true; break; }
            if (owner[k] >= 0) { parent = owner[k]; break; }
        }
        if (nodes.length * cell < o.length && parent < 0 && !toSea) continue;
        if (nodes.length * cell < o.length && parent >= 0) continue;
        const id = raw.length;
        for (const k of nodes) if (owner[k] < 0 && !sea[k]) owner[k] = id;
        raw.push({ nodes, parent, sea: toSea });
    }

    const width = (k: number) => Math.min(o.maxWidth, o.width * Math.sqrt(acc[k] / threshold));
    const out: Path[] = [];
    for (const r of raw)
    {
        let x = r.nodes.map(k => (k % n) * cell - half), z = r.nodes.map(k => ((k / n) | 0) * cell - half), w = r.nodes.map(width);
        const order = 1 + Math.floor(Math.log(acc[r.nodes[r.nodes.length - 2] ?? r.nodes[0]] / threshold) / Math.log(4));
        // smooth the grid zigzag (ends stay)
        for (let it = 0; it < 3; it++) { x = chaikin(x); z = chaikin(z); w = chaikin(w); }
        const p = resample(x, z, w, cell * .75);
        meander(p, g, o, rng);
        // tributaries end on their (now curved) parent
        if (r.parent >= 0 && out[r.parent]) snap(p, out[r.parent]);
        out.push({ ...p, order, sea: r.sea, parent: r.parent });
    }
    for (const p of out.slice()) if (p.sea && p.w[p.w.length - 1] >= o.delta.width) delta(p, out, g, o, rng);
    return out;
}

function chaikin(v: number[]) {
    if (v.length < 3) return v;
    const out = [v[0]];
    for (let i = 0; i < v.length - 1; i++) out.push(v[i] * .75 + v[i + 1] * .25, v[i] * .25 + v[i + 1] * .75);
    out.push(v[v.length - 1]);
    return out;
}

function resample(x: number[], z: number[], w: number[], step: number) {
    const o = { x: [x[0]], z: [z[0]], w: [w[0]] };
    let carry = 0;
    for (let i = 0; i < x.length - 1; i++)
    {
        const l = Math.hypot(x[i + 1] - x[i], z[i + 1] - z[i]);
        let t = step - carry;
        while (t <= l) { const f = t / l; o.x.push(x[i] + (x[i + 1] - x[i]) * f); o.z.push(z[i] + (z[i + 1] - z[i]) * f); o.w.push(w[i] + (w[i + 1] - w[i]) * f); t += step; }
        carry = l - (t - step);
    }
    const e = x.length - 1;
    if (carry > step * .3) { o.x.push(x[e]); o.z.push(z[e]); o.w.push(w[e]); }
    else { o.x[o.x.length - 1] = x[e]; o.z[o.z.length - 1] = z[e]; }
    return o;
}

/** S curves: sideways offset, big on flat ground, none on slopes, faded in / out at the ends */
function meander(p: { x: number[]; z: number[]; w: number[] }, g: Ground, o: HydrologyOptions, rng: Random) {
    const m = p.x.length;
    if (m < 4 || o.meander <= 0) return;
    const at = (x: number, z: number) => sample(g.height, g.n, g.size, x, z);
    const s = [0];
    for (let i = 1; i < m; i++) s.push(s[i - 1] + Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]));
    const L = s[m - 1], phase = rng.float(0, Math.PI * 2), phase2 = rng.float(0, Math.PI * 2), x = p.x.slice(), z = p.z.slice();
    let theta = phase, amp = 0;
    for (let i = 0; i < m; i++)
    {
        const a = Math.max(0, i - 3), b = Math.min(m - 1, i + 3), run = s[b] - s[a] || 1;
        const slope = Math.abs(at(x[a], z[a]) - at(x[b], z[b])) / run, base = 20 + p.w[i] * 3, lambda = base * 7;
        if (i) theta += (s[i] - s[i - 1]) / lambda * Math.PI * 2;
        // ease the amplitude so a slope change doesn't kink the path
        const target = o.meander * base * (1 - smoothstep(.015, .09, slope));
        amp += (target - amp) * Math.min(1, (s[i] - (s[i - 1] ?? 0)) / (lambda * .25));
        const fade = Math.min(1, s[i] / (lambda * .5), (L - s[i]) / (lambda * .5)), off = amp * fade * (Math.sin(theta) + .35 * Math.sin(theta * 2.3 + phase2));
        let dx = x[b] - x[a], dz = z[b] - z[a];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        p.x[i] = x[i] - dz * off; p.z[i] = z[i] + dx * off;
    }
}

/** cut the path where it comes closest to its parent and end on that parent point */
function snap(p: { x: number[]; z: number[]; w: number[] }, parent: Path) {
    const m = p.x.length, from = Math.max(0, m - 60);
    let best = Infinity, bi = m - 1, bp = 0;
    for (let i = from; i < m; i++) for (let j = 0; j < parent.x.length; j++)
    {
        const d = Math.hypot(p.x[i] - parent.x[j], p.z[i] - parent.z[j]);
        if (d < best) { best = d; bi = i; bp = j; }
    }
    p.x.length = p.z.length = p.w.length = bi + 1;
    p.x.push(parent.x[bp]); p.z.push(parent.z[bp]); p.w.push(p.w[bi]);
}

/** a big mouth splits into branches fanning out to the sea */
function delta(p: Path, out: Path[], g: Ground, o: HydrologyOptions, rng: Random) {
    const m = p.x.length, w = p.w[m - 1], step = Math.hypot(p.x[1] - p.x[0], p.z[1] - p.z[0]) || 1;
    const reach = o.delta.length * Math.sqrt(w / o.delta.width), split = Math.max(1, m - 1 - Math.round(reach / step));
    const count = Math.min(o.delta.branches, 1 + Math.floor(w / o.delta.width));
    if (count < 2 || split >= m - 2) return;
    const a = Math.max(0, split - 4), dir = Math.atan2(p.z[split] - p.z[a], p.x[split] - p.x[a]);
    for (let b = 0; b < count - 1; b++)
    {
        const side = b % 2 ? 1 : -1, spread = (.35 + .25 * Math.floor(b / 2)) * side + rng.float(-.1, .1);
        let heading = dir + spread * .5, x = p.x[split], z = p.z[split];
        const q = { x: [x], z: [z], w: [w * .55] };
        for (let s = 0; s < (reach * 2.5) / step; s++)
        {
            // bend outward first, then on to the sea; wobble a little
            heading += (dir + spread - heading) * .05 + rng.float(-.08, .08);
            x += Math.cos(heading) * step; z += Math.sin(heading) * step;
            if (Math.abs(x) > g.size / 2 || Math.abs(z) > g.size / 2) break;
            q.x.push(x); q.z.push(z); q.w.push(w * .55);
            if (sample(g.height, g.n, g.size, x, z) < g.seaLevel - 1) break;
        }
        if (q.x.length > 3) out.push({ ...q, order: p.order, sea: true, parent: -1 });
    }
    for (let i = split; i < m; i++) p.w[i] *= .7;
}
