import { Search, type AStarResult } from "./astar";

/** headings: 8 (king moves) or 16 (plus knight moves, gentler angles) as [dx, dz], sorted by angle */
export function headings(count: 8 | 16): [number, number][] {
    const d: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    if (count === 16) d.push([2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]);
    return d.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
}

/** a move a caller adds (bridge, tunnel, ...): to node, arriving heading, cost, tag 1..255 */
export type ExtraPush = (to: number, heading: number, cost: number, tag: number) => void;

export type GridOptions = {
    /** nodes per side; node = j * n + i */
    n: number;
    headings?: 8 | 16;
    from: number;
    to: number;
    /**
     * cost of a straight move `from` → `to` (neighbours) arriving with `heading`, after `previous` heading
     * (-1 at the start). `turn` = heading steps between them (0..H/2). Infinity = not allowed.
     */
    cost: (from: number, to: number, heading: number, previous: number, turn: number) => number;
    /** extra moves out of a node (long jumps): `push(to, heading, cost, tag)` */
    extra?: (node: number, heading: number, push: ExtraPush) => void;
    /** lower bound of cost per node step (heuristic = straight distance × this), 0 = Dijkstra */
    minCost?: number;
    /** heuristic times this: > 1 searches much less, routes up to that much dearer (weighted A*) */
    greed?: number;
    /** cost times (1 + penalty[node]) for moves into a node (alternatives) */
    penalty?: Float32Array;
    limit?: number;
};

export type GridResult = { nodes: number[]; headings: number[]; tags: number[]; cost: number; visited: number };

/** A* over a grid with (node, heading) states, so turns can cost. Keep one `GridSearch` for many runs on the same size. */
export class GridSearch {
    private search = new Search();

    find(o: GridOptions): GridResult | null {
        const { n, from, to } = o, H = o.headings ?? 8, dirs = headings(H), min = (o.minCost ?? 0) * (o.greed ?? 1), pen = o.penalty;
        const ti = to % n, tj = (to / n) | 0;
        const step = dirs.map(([dx, dz]) => dz * n + dx);
        let node = 0, heading = 0;
        const extraPush: ExtraPush = (t, hd, c, tag) => this.push!(t * H + hd, pen ? c * (1 + pen[t]) : c, tag);
        const r: AStarResult | null = this.search.find({
            size: n * n * H,
            start: Array.from({ length: H }, (_, h) => from * H + h),
            goal: s => ((s / H) | 0) === to,
            heuristic: min ? s => { const k = (s / H) | 0; return Math.hypot(k % n - ti, ((k / n) | 0) - tj) * min; } : undefined,
            limit: o.limit,
            neighbours: (s, push) => {
                node = (s / H) | 0; heading = s % H;
                const i = node % n, j = (node / n) | 0, first = node === from;
                this.push = push;
                for (let d = 0; d < H; d++)
                {
                    const x = i + dirs[d][0], z = j + dirs[d][1];
                    if (x < 0 || z < 0 || x >= n || z >= n) continue;
                    const t = node + step[d], diff = Math.abs(d - heading), turn = first ? 0 : Math.min(diff, H - diff);
                    let c = o.cost(node, t, d, first ? -1 : heading, turn);
                    if (pen) c *= 1 + pen[t];
                    push(t * H + d, c);
                }
                o.extra?.(node, first ? -1 : heading, extraPush);
            },
        });
        if (!r) return null;
        return { nodes: r.states.map(s => (s / H) | 0), headings: r.states.map(s => s % H), tags: r.tags, cost: r.cost, visited: r.visited };
    }
    private push?: (to: number, cost: number, tag?: number) => void;
}

export type AlternativeOptions = {
    /** routes wanted */
    k: number;
    /** penalty added on nodes of found routes (and `spread` nodes round them) */
    penalty?: number;
    spread?: number;
    /** keep a route only when it shares under this share of its nodes with every kept route */
    overlap?: number;
    /** searches at most */
    tries?: number;
};

/**
 * Several different routes A → B (penalty method): find a route, make its nodes dearer, search again; keep routes
 * that differ enough. The first is the best route.
 */
export function alternatives(o: GridOptions, a: AlternativeOptions, search = new GridSearch()): GridResult[] {
    const { n } = o, penalty = a.penalty ?? 1, spread = a.spread ?? 1, overlap = a.overlap ?? .6, tries = a.tries ?? a.k * 3;
    const pen = o.penalty ? o.penalty.slice() : new Float32Array(n * n), kept: GridResult[] = [], sets: Set<number>[] = [];
    for (let t = 0; t < tries && kept.length < a.k; t++)
    {
        const r = search.find({ ...o, penalty: pen });
        if (!r) break;
        const set = new Set(r.nodes);
        if (sets.every(s => { let shared = 0; for (const k of set) if (s.has(k)) shared++; return shared / set.size < overlap; }))
        {
            kept.push(t === 0 ? r : { ...r, cost: recost(o, r) });
            sets.push(set);
        }
        for (const k of r.nodes)
        {
            const i = k % n, j = (k / n) | 0;
            for (let dz = -spread; dz <= spread; dz++) for (let dx = -spread; dx <= spread; dx++)
            {
                const x = i + dx, z = j + dz;
                if (x >= 0 && z >= 0 && x < n && z < n) pen[z * n + x] += penalty;
            }
        }
    }
    return kept;
}

/** cost of a found route without penalties (ground moves only; extra moves keep their share) */
function recost(o: GridOptions, r: GridResult): number {
    let c = 0;
    for (let s = 1; s < r.nodes.length; s++)
    {
        if (r.tags[s]) continue;
        const H = o.headings ?? 8, diff = Math.abs(r.headings[s] - r.headings[s - 1]);
        c += o.cost(r.nodes[s - 1], r.nodes[s], r.headings[s], s === 1 ? -1 : r.headings[s - 1], s === 1 ? 0 : Math.min(diff, H - diff));
    }
    return c;
}
