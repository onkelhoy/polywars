/** min-heap of node indices keyed by a float */
class Heap {
    private keys: Float32Array; private ids: Int32Array; size = 0;
    constructor(capacity: number) { this.keys = new Float32Array(capacity); this.ids = new Int32Array(capacity); }
    push(key: number, id: number) {
        let i = this.size++;
        const k = this.keys, d = this.ids;
        while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; d[i] = d[p]; i = p; }
        k[i] = key; d[i] = id;
    }
    pop(): number {
        const k = this.keys, d = this.ids, top = d[0], key = k[--this.size], id = d[this.size];
        let i = 0;
        for (; ;)
        {
            let c = i * 2 + 1;
            if (c >= this.size) break;
            if (c + 1 < this.size && k[c + 1] < k[c]) c++;
            if (k[c] >= key) break;
            k[i] = k[c]; d[i] = d[c]; i = c;
        }
        k[i] = key; d[i] = id;
        return top;
    }
}

export type Drainage = {
    /** node each node drains to (-1: sea or off the map) */
    down: Int32Array;
    /** nodes draining through each node */
    acc: Float32Array;
    /** basins filled to their spill height */
    filled: Float32Array;
    /** 1 sea (below sea level, open to the border) */
    sea: Uint8Array;
};

/** Priority flood (Barnes 2014) from the sea and the map border: a drainage tree over the filled map, 8 neighbours. */
export function drainage(h: Float32Array, n: number, seaLevel: number): Drainage {
    const total = n * n, sea = new Uint8Array(total), down = new Int32Array(total).fill(-1), filled = new Float32Array(total);
    const seen = new Uint8Array(total), heap = new Heap(total), order = new Int32Array(total);
    // sea: below sea level, flooded from the border
    const q: number[] = [];
    const border = (k: number) => { if (h[k] < seaLevel && !sea[k]) { sea[k] = 1; q.push(k); } };
    for (let i = 0; i < n; i++) { border(i); border((n - 1) * n + i); border(i * n); border(i * n + n - 1); }
    while (q.length)
    {
        const k = q.pop()!, i = k % n, j = (k / n) | 0;
        if (i > 0) border(k - 1); if (i < n - 1) border(k + 1); if (j > 0) border(k - n); if (j < n - 1) border(k + n);
    }
    for (let k = 0; k < total; k++)
    {
        const i = k % n, j = (k / n) | 0;
        if (sea[k]) { seen[k] = 1; filled[k] = seaLevel; heap.push(seaLevel, k); }
        else if (i === 0 || j === 0 || i === n - 1 || j === n - 1) { seen[k] = 1; filled[k] = h[k]; heap.push(h[k], k); }
    }
    let visited = 0;
    const eps = 1e-3;
    while (heap.size)
    {
        const k = heap.pop(), i = k % n, j = (k / n) | 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++)
        {
            const x = i + di, z = j + dj;
            if ((!di && !dj) || x < 0 || z < 0 || x >= n || z >= n) continue;
            const m = z * n + x;
            if (seen[m]) continue;
            seen[m] = 1;
            filled[m] = Math.max(h[m], filled[k] + eps);
            down[m] = k;
            order[visited++] = m;
            heap.push(filled[m], m);
        }
    }
    const acc = new Float32Array(total).fill(1);
    for (let v = visited - 1; v >= 0; v--) { const m = order[v]; if (down[m] >= 0) acc[down[m]] += acc[m]; }
    return { down, acc, filled, sea };
}

/** bilinear height at world x / z */
export function sample(h: Float32Array, n: number, size: number, x: number, z: number) {
    const cell = size / (n - 1), fx = Math.min(n - 1.001, Math.max(0, (x + size / 2) / cell)), fz = Math.min(n - 1.001, Math.max(0, (z + size / 2) / cell));
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * n + i;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + n] * (1 - u) + h[k + n + 1] * u) * v;
}

/** nearest node to world x / z */
export const node = (n: number, size: number, x: number, z: number) => {
    const cell = size / (n - 1), i = Math.min(n - 1, Math.max(0, Math.round((x + size / 2) / cell))), j = Math.min(n - 1, Math.max(0, Math.round((z + size / 2) / cell)));
    return j * n + i;
};
