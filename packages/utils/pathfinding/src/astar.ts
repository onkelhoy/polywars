import { Heap } from "./heap";

export type Push = (to: number, cost: number, tag?: number) => void;

export type AStarOptions = {
    /** number of states; states are 0 .. size-1 */
    size: number;
    start: number | number[];
    goal: (state: number) => boolean;
    /** call `push(to, cost, tag?)` for every move out of `state`; `tag` (0..255) marks the move (kept on the path) */
    neighbours: (state: number, push: Push) => void;
    /** never over the real rest cost (0 = Dijkstra) */
    heuristic?: (state: number) => number;
    /** give up after this many expanded states */
    limit?: number;
};

export type AStarResult = { states: number[]; tags: number[]; cost: number; visited: number };

/**
 * A* over any state space given by callbacks. Typed arrays sized to `size`, reused between runs of the same `Search`
 * (stamp per run, no clearing).
 */
export class Search {
    private g = new Float64Array(0);
    private parent = new Int32Array(0);
    private tag = new Uint8Array(0);
    private stamp = new Uint32Array(0);
    private closed = new Uint32Array(0);
    private run = 0;
    private heap = new Heap(4096);

    private fit(size: number) {
        if (this.g.length >= size) return;
        this.g = new Float64Array(size); this.parent = new Int32Array(size); this.tag = new Uint8Array(size);
        this.stamp = new Uint32Array(size); this.closed = new Uint32Array(size); this.run = 0;
    }

    find(o: AStarOptions): AStarResult | null {
        this.fit(o.size);
        const run = ++this.run, { g, parent, tag, stamp, closed, heap } = this, h = o.heuristic ?? (() => 0), limit = o.limit ?? Infinity;
        heap.clear();
        for (const s of Array.isArray(o.start) ? o.start : [o.start]) { g[s] = 0; parent[s] = -1; tag[s] = 0; stamp[s] = run; heap.push(h(s), s); }
        let current = -1, visited = 0;
        const push: Push = (to, cost, t = 0) => {
            if (!(cost < Infinity) || closed[to] === run) return;
            const v = g[current] + cost;
            if (stamp[to] === run && g[to] <= v) return;
            stamp[to] = run; g[to] = v; parent[to] = current; tag[to] = t;
            heap.push(v + h(to), to);
        };
        while (heap.size)
        {
            const s = heap.pop();
            if (closed[s] === run) continue;
            closed[s] = run;
            if (o.goal(s))
            {
                const states: number[] = [], tags: number[] = [];
                for (let k = s; k >= 0; k = parent[k]) { states.push(k); tags.push(tag[k]); }
                return { states: states.reverse(), tags: tags.reverse(), cost: g[s], visited };
            }
            if (++visited > limit) return null;
            current = s;
            o.neighbours(s, push);
        }
        return null;
    }
}

/** one off A* */
export const astar = (o: AStarOptions) => new Search().find(o);
