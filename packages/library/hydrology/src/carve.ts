import { drainage, node, sample } from "./grid";
import type { Path } from "./network";
import type { HydrologyOptions, Stream } from "./types";

type Grid = { n: number; size: number; height: Float32Array; seaLevel: number };
const smoothstep = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Beds along each path: following the ground but never rising (a climb up to `cut` is cut through, past a higher rim the
 * river only goes on where the ground is below its bed again). A drop of `fall` or more in one step is a waterfall. `stop(k)` ends a piece at a node (lakes, sea).
 */
function beds(p: Path, g: Grid, o: HydrologyOptions, stop?: (k: number) => boolean) {
    const pieces: { i: number[]; bed: number[]; depth: number[]; ground: number[]; falls: number[] }[] = [];
    let cur: typeof pieces[number] | null = null, bed = Infinity, blocked = false;
    for (let i = 0; i < p.x.length; i++)
    {
        const ground = sample(g.height, g.n, g.size, p.x[i], p.z[i]), depth = o.depth * Math.min(3, Math.sqrt(p.w[i] / o.width));
        const k = node(g.n, g.size, p.x[i], p.z[i]), end = stop?.(k) ?? false;
        // never below the sea floor near the coast: no pits
        const want = Math.max(ground - depth, g.seaLevel - depth * 2);
        // a rim too high to cut: water can't climb it, so no new river starts up there; it goes on once the ground is below the bed again
        if (cur && want - bed > o.cut) { if (cur.i.length > 1) pieces.push(cur); cur = null; blocked = true; continue; }
        if (blocked && want > bed) continue;
        blocked = false;
        if (!cur)
        {
            if (end) continue;
            cur = { i: [], bed: [], depth: [], ground: [], falls: [] };
            bed = Math.min(bed, want);
        }
        else if (want < bed) { if (bed - want >= o.fall) cur.falls.push(cur.i.length); bed = want; }
        cur.i.push(i); cur.bed.push(bed); cur.depth.push(depth); cur.ground.push(ground);
        if (end) { pieces.push(cur); cur = null; }
    }
    if (cur && cur.i.length > 1) pieces.push(cur);
    return pieces;
}

/**
 * Before erosion: valleys. Banks rise at `valley` slope, deep cuts at `canyon` slope (cliffs), near the sea almost flat (deltas, flood plains).
 * Lowers `height`, marks `hard` in the channel and at waterfalls, `wet` 3 in the channel.
 */
export function carveValleys(paths: Path[], g: Grid, o: HydrologyOptions, hard: Float32Array, wet?: Uint8Array) {
    const { n, size, height } = g, cell = size / (n - 1), half = size / 2, target = height.slice();
    for (const p of paths) for (const piece of beds(p, g, o, wet && (k => wet[k] === 2)))
    {
        const falls = new Set(piece.falls);
        piece.i.forEach((i, q) => {
            const bed = piece.bed[q], depth = piece.depth[q], w2 = p.w[i] / 2, cut = Math.max(0, piece.ground[q] - bed - depth);
            let bank = o.valley + (o.canyon - o.valley) * smoothstep(4, 22, cut);
            bank *= .3 + .7 * smoothstep(2, 12, bed - g.seaLevel);
            const reach = Math.min(w2 + (cut + depth * 2) / bank + cell, 400), x0 = p.x[i], z0 = p.z[i];
            const i0 = Math.max(0, Math.floor((x0 - reach + half) / cell)), i1 = Math.min(n - 1, Math.ceil((x0 + reach + half) / cell));
            const j0 = Math.max(0, Math.floor((z0 - reach + half) / cell)), j1 = Math.min(n - 1, Math.ceil((z0 + reach + half) / cell));
            const fall = falls.has(q);
            for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++)
            {
                const k = j * n + ii, d = Math.hypot(ii * cell - half - x0, j * cell - half - z0);
                if (d > reach) continue;
                const v = d < w2 ? bed + depth * (d / w2) ** 2 : bed + depth + (d - w2) * bank;
                if (v < target[k]) target[k] = v;
                if (d < w2 + cell) { hard[k] = Math.max(hard[k], .6); if (wet && !wet[k]) wet[k] = 3; }
                if (fall && d < w2 * 2 + cell * 2) hard[k] = 1;
            }
        });
    }
    // the carved shape inside the valleys (NaN outside): erosion may not dig far below it
    const shape = new Float32Array(target.length).fill(NaN);
    for (let k = 0; k < target.length; k++) if (target[k] < height[k]) shape[k] = target[k];
    height.set(target);
    return shape;
}

/** after erosion: nowhere in a valley more than `dig` m below its carved shape (water gathers there and erosion runs deep) */
export function limitErosion(height: Float32Array, shape: Float32Array, dig = 2) {
    for (let k = 0; k < height.length; k++) if (shape[k] === shape[k] && height[k] < shape[k] - dig) height[k] = shape[k] - dig;
}

type Wet = Grid & { water: Uint8Array; surface: Float32Array };

/**
 * After erosion: the exact channel (bed, steep banks), water 3 with its surface; pieces end in lakes and the sea.
 * The water surface never rises downstream, leaves a lake at its level, meets the lake / sea / bigger river it runs into
 * at that one's level (eased in over `blend` m), and a piece that doesn't leave a lake starts as a trickle (springs, and
 * where a river comes back after a rim); one that runs into nothing ends in a pond. Returns the streams (x, surface, z, width).
 */
export function carveBeds(paths: Path[], g: Wet, o: HydrologyOptions, blend = 40): Stream[] {
    const { n, size, height, water, surface } = g, cell = size / (n - 1), half = size / 2, total = n * n;
    const level = new Float32Array(total).fill(Infinity), target = height.slice(), chan = new Float32Array(total).fill(Infinity), out: Stream[] = [];
    const ponds: [number, number, number, number, number][] = [];
    const still = (k: number) => water[k] === 1 || water[k] === 2;
    /** the surface of a stream already placed within its width of x z (the river this one leaves or runs into), else NaN */
    const near = (x: number, z: number) => {
        let best = Infinity, y = NaN;
        for (const s of out) for (const [px, py, pz, pw] of s.points)
        {
            const d = Math.hypot(px - x, pz - z);
            if (d < Math.max(pw / 2, cell) && d < best) { best = d; y = py; }
        }
        return y;
    };
    for (const p of paths) for (const piece of beds(p, g, o, still))
    {
        const m = piece.i.length, i0 = piece.i[0], xs = piece.i.map(i => p.x[i]), zs = piece.i.map(i => p.z[i]);
        const along = [0];
        for (let q = 1; q < m; q++) along.push(along[q - 1] + Math.hypot(xs[q] - xs[q - 1], zs[q] - zs[q - 1]));
        const L = along[m - 1];
        // starts: out of a lake (its level), off a river (its level, deltas), else a spring: a trickle widening over 80 m
        const kStart = i0 > 0 ? node(n, size, p.x[i0 - 1], p.z[i0 - 1]) : -1, outlet = kStart >= 0 && still(kStart);
        const fromRiver = outlet ? NaN : near(xs[0], zs[0]);
        const spring = !outlet && fromRiver !== fromRiver && i0 > 0;
        const w = piece.i.map((i, q) => spring ? Math.max(1, p.w[i] * (.15 + .85 * smoothstep(0, 80, along[q]))) : p.w[i]);
        const depth = w.map(v => o.depth * Math.min(3, Math.sqrt(v / o.width)));
        const y = piece.bed.map((b, q) => b + piece.depth[q] * .8);
        if (outlet) y[0] = surface[kStart];
        else if (fromRiver === fromRiver) y[0] = Math.min(y[0], fromRiver);
        for (let q = 1; q < m; q++) y[q] = Math.min(y[q], y[q - 1]);
        // ends: in a lake / the sea (the last point is in it) or on a bigger river
        const kEnd = node(n, size, xs[m - 1], zs[m - 1]);
        const T = still(kEnd) ? surface[kEnd] : near(xs[m - 1], zs[m - 1]);
        if (T === T)
        {
            for (let q = 0; q < m; q++) y[q] = T + (y[q] - T) * smoothstep(0, blend, L - along[q]);
            y[m - 1] = T;
            for (let q = m - 2; q >= 0; q--) y[q] = Math.max(y[q], y[q + 1]);
        }
        const points: Stream["points"] = [];
        for (let q = 0; q < m; q++)
        {
            const x0 = xs[q], z0 = zs[q], w2 = w[q] / 2, dq = depth[q], top = y[q], bed = top - dq * .8;
            points.push([x0, top, z0, w[q]]);
            // banks: as high as the ground beside the channel, so a deep cut gets canyon walls, not a slot
            let rim = -Infinity;
            for (let a = 0; a < 8; a++) rim = Math.max(rim, sample(height, n, size, x0 + Math.cos(a * .785) * (w2 + cell * 2), z0 + Math.sin(a * .785) * (w2 + cell * 2)));
            const cut = Math.max(0, rim - bed - dq), bank = cut > 6 ? o.canyon : 1, reach = Math.min(w2 + dq * 2 + cell * 2 + cut / bank, 300);
            // nodes that carry the water: at least .8 cell out, so the river is one 4-connected run of nodes however narrow
            const wet = Math.max(w2 + cell * .5, cell * .8);
            const ia = Math.max(0, Math.floor((x0 - reach + half) / cell)), ib = Math.min(n - 1, Math.ceil((x0 + reach + half) / cell));
            const ja = Math.max(0, Math.floor((z0 - reach + half) / cell)), jb = Math.min(n - 1, Math.ceil((z0 + reach + half) / cell));
            for (let j = ja; j <= jb; j++) for (let ii = ia; ii <= ib; ii++)
            {
                const k = j * n + ii, d = Math.hypot(ii * cell - half - x0, j * cell - half - z0);
                if (d > reach || still(k)) continue;
                const v = d < w2 ? bed + dq * (d / w2) ** 2 : bed + dq + (d - w2) * bank;
                if (v < target[k]) target[k] = v;
                // the channel itself gets exactly the bed shape (erosion pits filled)
                if (d < w2 && v < chan[k]) chan[k] = v;
                // the lowest water near a node: beside a fall the node belongs to the pool below, not the lip above
                if (d <= wet) level[k] = Math.min(level[k], top);
            }
        }
        // ends nowhere (no lake, sea or river to run into): a small pond at its end, so it never just stops in a field
        if (T !== T) ponds.push([xs[m - 1], zs[m - 1], Math.max(8, w[m - 1] * 1.5), y[m - 1], depth[m - 1]]);
        out.push({ points, order: p.order, falls: piece.falls });
    }
    for (const [x0, z0, r, top, dq] of ponds)
    {
        const ia = Math.max(0, Math.floor((x0 - r * 2 + half) / cell)), ib = Math.min(n - 1, Math.ceil((x0 + r * 2 + half) / cell));
        const ja = Math.max(0, Math.floor((z0 - r * 2 + half) / cell)), jb = Math.min(n - 1, Math.ceil((z0 + r * 2 + half) / cell));
        for (let j = ja; j <= jb; j++) for (let ii = ia; ii <= ib; ii++)
        {
            const k = j * n + ii, d = Math.hypot(ii * cell - half - x0, j * cell - half - z0);
            if (still(k) || d > r * 2) continue;
            // a bowl under the water, its bank rising gently outside
            const v = d < r ? top - dq * (1 - (d / r) ** 2) - .3 : top + (d - r) * .4;
            if (v < target[k]) target[k] = v;
            if (d < r && v < chan[k]) chan[k] = v;
            if (d <= r) level[k] = Math.min(level[k], top);
        }
    }
    for (let k = 0; k < total; k++) if (chan[k] < Infinity) target[k] = chan[k];
    height.set(target);
    despike(g);
    for (let k = 0; k < total; k++) if (level[k] < Infinity && !water[k]) { water[k] = 3; surface[k] = level[k]; }
    return out;
}

/**
 * Last step, after everything else that shapes the ground (roads, tunnels): the ground fits the water exactly, so water
 * never sinks into the ground nor ends in the air. River nodes next to a lake / the sea take its level; river nodes lie
 * `depth` m under their surface; land next to a lake / the sea (8 neighbours) stands `lip` m over its level (the lake quads
 * run up to those nodes at that level); land next to a river `lip` m over the lowest river beside it if that takes at most
 * `raise` m (deeper: the river sheet bends down to the ground there). Raised banks ease out at `slope`. Tunnel `holes` are left alone. Returns what it changed.
 */
export function seal(g: Wet & { holes?: Uint8Array }, depth = .5, lip = .2, slope = .5, raise = 2, mouth = 8) {
    const { n, height: h, water: W, surface } = g, holes = g.holes;
    const still = (k: number) => W[k] === 1 || W[k] === 2;
    const each = (k: number, f: (m: number) => void) => {
        const i = k % n, j = (k / n) | 0;
        for (let b = Math.max(0, j - 1); b <= Math.min(n - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(n - 1, i + 1); a++) if (a !== i || b !== j) f(b * n + a);
    };
    let mouths = 0, cut = 0, raised = 0, most = 0, mostAt = -1, deep = 0, lakes = 0;
    for (let k = 0; k < W.length; k++)
    {
        if (W[k] !== 3) continue;
        let s = -Infinity;
        each(k, m => { if (still(m)) s = Math.max(s, surface[m]); });
        if (s > -Infinity && surface[k] !== s) { surface[k] = s; mouths++; }
    }
    for (let k = 0; k < W.length; k++)
    {
        if (W[k] !== 3 || holes?.[k]) continue;
        if (h[k] > surface[k] - depth) { h[k] = surface[k] - depth; cut++; }
    }
    // at a mouth the bed comes up to the depth of the sea / lake around it over `mouth` nodes: no deep channel cut into a
    // shallow bay (its steps show through the water)
    const hops = new Int32Array(W.length).fill(-1), queue: number[] = [];
    for (let k = 0; k < W.length; k++) if (still(k)) { hops[k] = 0; queue.push(k); }
    for (let q = 0; q < queue.length; q++)
    {
        const k = queue[q];
        if (hops[k] >= mouth) continue;
        each(k, m => { if (hops[m] < 0 && W[m] === 3) { hops[m] = hops[k] + 1; queue.push(m); } });
    }
    for (let k = 0; k < W.length; k++)
    {
        if (W[k] !== 3 || hops[k] < 1 || holes?.[k]) continue;
        let sum = 0, cnt = 0;
        const i = k % n, j = (k / n) | 0, r = hops[k] + 1;
        for (let b = Math.max(0, j - r); b <= Math.min(n - 1, j + r); b++) for (let a = Math.max(0, i - r); a <= Math.min(n - 1, i + r); a++)
        { const m = b * n + a; if (still(m)) { sum += surface[m] - h[m]; cnt++; } }
        if (!cnt) continue;
        const bay = Math.max(depth, sum / cnt), t = 1 - (hops[k] - 1) / mouth, want = surface[k] - bay;
        if (want > h[k]) h[k] += (want - h[k]) * t;
    }
    // banks: how much each land node must come up, eased outward (`slope` m per m: the raise, not the height, so it never fills a gorge)
    // so a raised bank is an embankment, not a wall
    const need = new Float32Array(W.length), land = (k: number) => !W[k] && !holes?.[k];
    for (let k = 0; k < W.length; k++)
    {
        if (!land(k)) continue;
        // the river sheet's land corners sit at the lowest river beside them (beside a fall: the pool, not the top); lakes' at their level
        // a bank far under a river (a gully beside it) isn't dammed: the sheet runs down to the ground there (a short spill), see terrain riverSheet
        let r = Infinity, l = -Infinity;
        each(k, m => { if (W[m] === 3) r = Math.min(r, surface[m]); else if (W[m]) l = Math.max(l, surface[m]); });
        if (r < Infinity && h[k] < r + lip && r + lip - h[k] <= raise) need[k] = r + lip - h[k];
        if (l > -Infinity && h[k] < l + lip) { need[k] = Math.max(need[k], l + lip - h[k]); lakes = Math.max(lakes, l + lip - h[k]); }
    }
    const cell = g.size / (n - 1), a = slope * cell, b = slope * cell * Math.SQRT2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    {
        const k = j * n + i;
        if (!land(k)) continue;
        let v = need[k];
        if (i > 0) v = Math.max(v, need[k - 1] - a);
        if (j > 0) { v = Math.max(v, need[k - n] - a); if (i > 0) v = Math.max(v, need[k - n - 1] - b); if (i < n - 1) v = Math.max(v, need[k - n + 1] - b); }
        need[k] = v;
    }
    for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--)
    {
        const k = j * n + i;
        if (!land(k)) continue;
        let v = need[k];
        if (i < n - 1) v = Math.max(v, need[k + 1] - a);
        if (j < n - 1) { v = Math.max(v, need[k + n] - a); if (i < n - 1) v = Math.max(v, need[k + n + 1] - b); if (i > 0) v = Math.max(v, need[k + n - 1] - b); }
        need[k] = v;
    }
    for (let k = 0; k < W.length; k++)
    {
        const up = need[k];
        if (!land(k) || up <= 0) continue;
        if (up > most) { most = up; mostAt = k; }
        if (up > 2) deep++;
        h[k] += up; raised++;
    }
    return { mouths, cut, raised, deep, most, mostAt, lakes };
}

/** single node pits and needles on land (more than 3 m past all four neighbours) go to the nearest neighbour height */
export function despike(g: Wet) {
    const { n, height: h, water } = g;
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++)
    {
        const k = j * n + i;
        if (water[k] === 1 || water[k] === 2) continue;
        const a = h[k - 1], b = h[k + 1], c = h[k - n], d = h[k + n], lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        if (h[k] < lo - 3) h[k] = lo;
        else if (h[k] > hi + 3) h[k] = hi;
    }
}

/**
 * Closed basins left after carving: big ones (`lake` m², `depth` m deep) fill with water up to their spill level (a lake
 * behind a rim), small ones fill with ground up to `keep` m under it. Returns the number of lakes made.
 */
export function fillPits(g: Wet, keep = 1.5, lake = 3000, depth = 3) {
    const { n, size, height: h, water, surface } = g, { filled } = drainage(h, n, g.seaLevel), cell = size / (n - 1);
    const pit = (k: number) => (water[k] === 0 || water[k] === 3) && filled[k] - h[k] > .3;
    const seen = new Uint8Array(n * n);
    let lakes = 0;
    for (let s = 0; s < h.length; s++)
    {
        if (seen[s] || !pit(s)) continue;
        const part = [s], stack = [s];
        seen[s] = 1;
        let deepest = 0;
        while (stack.length)
        {
            const k = stack.pop()!, i = k % n;
            deepest = Math.max(deepest, filled[k] - h[k]);
            for (const m of [k - 1, k + 1, k - n, k + n])
            {
                // one lake = one spill level (neighbour pits that spill at other levels are other lakes)
                if (m < 0 || m >= n * n || Math.abs((m % n) - i) > 1 || seen[m] || !pit(m) || Math.abs(filled[m] - filled[s]) > 1e-3) continue;
                seen[m] = 1; part.push(m); stack.push(m);
            }
        }
        if (part.length * cell * cell >= lake && deepest >= depth) { for (const k of part) { water[k] = 2; surface[k] = filled[k]; } lakes++; }
        else for (const k of part) if (filled[k] - h[k] > keep) h[k] = filled[k] - keep;
    }
    return lakes;
}

/**
 * Still water side by side at two levels (two lakes, a lake and the sea): lakes within `merge` m of each other become one
 * at the lower level; otherwise the higher water's edge node becomes a low dam (land just over its surface), so each water
 * keeps one flat level and the step shows as ground, not two planes.
 */
export function separateLevels(g: Wet, step = .5, merge = 1) {
    const { n, height: h, water, surface } = g;
    const near = (k: number) => { const i = k % n; return [k - 1, k + 1, k - n, k + n].filter(m => m >= 0 && m < n * n && Math.abs((m % n) - i) <= 1); };
    // a lake at or under the level of the sea it touches is part of the sea
    const seen = new Uint8Array(n * n);
    for (let s0 = 0; s0 < n * n; s0++)
    {
        if (water[s0] !== 2 || seen[s0]) continue;
        const part = [s0], stack = [s0];
        seen[s0] = 1;
        let sea = -Infinity;
        while (stack.length)
        {
            const k = stack.pop()!;
            for (const m of near(k))
            {
                if (water[m] === 1) sea = Math.max(sea, surface[m]);
                if (water[m] !== 2 || seen[m]) continue;
                seen[m] = 1; part.push(m); stack.push(m);
            }
        }
        if (sea > -Infinity && part.every(k => surface[k] <= sea + step)) for (const k of part) { water[k] = 1; surface[k] = sea; }
    }
    // lakes touching at almost one level (a pit lake left in a bigger one): one lake at the lower level, the higher one's
    // bed over it becomes land; no dam ring inside a lake
    for (let changed = true, rounds = 0; changed && rounds < 20; rounds++)
    {
        changed = false;
        for (let k = 0; k < n * n; k++)
        {
            if (water[k] !== 2) continue;
            const low = near(k).find(m => water[m] === 2 && surface[m] < surface[k] - 1e-3 && surface[k] - surface[m] <= merge);
            if (low === undefined) continue;
            const from = surface[k], to = surface[low], stack = [k], seen = new Set([k]);
            while (stack.length)
            {
                const c = stack.pop()!;
                surface[c] = to;
                if (h[c] >= to) water[c] = 0;
                for (const m of near(c)) if (water[m] === 2 && !seen.has(m) && Math.abs(surface[m] - from) < 1e-3) { seen.add(m); stack.push(m); }
            }
            changed = true;
        }
    }
    // a lake higher than the water beside it: its edge node there becomes a dam
    let dams = 0;
    for (let k = 0; k < n * n; k++)
    {
        if (water[k] !== 2) continue;
        if (!near(k).some(m => (water[m] === 1 || water[m] === 2) && surface[k] - surface[m] > step)) continue;
        water[k] = 0; h[k] = Math.max(h[k], surface[k] + .4);
        dams++;
    }
    return dams;
}
