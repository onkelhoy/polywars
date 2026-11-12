import type { Pace } from "./pace";

/** min-heap of node indices keyed by a float level */
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
    topKey() { return this.keys[0]; }
}

/** `down`: the node each node drains to (-1 off the map or into the sea), `acc`: nodes that drain through it (catchment) */
export type Water = { water: Uint8Array; surface: Float32Array; down: Int32Array; acc: Float32Array };

/**
 * Ocean: nodes below `sea` connected to the map border. Lakes: priority flood (Barnes 2014) from the ocean and border,
 * every basin fills to its spill height; basins deeper than `minDepth` keep water up to `fullness` of their depth if that covers `minNodes`.
 * Heights and levels in metres.
 */
export async function water(h: Float32Array, n: number, sea: number, minDepth: number, minNodes: number, fullness: number, pace: Pace): Promise<Water> {
    const total = n * n, kind = new Uint8Array(total), surface = new Float32Array(total).fill(sea);
    const queue = new Int32Array(total);
    let head = 0, tail = 0;
    const border = (f: (k: number) => void) => {
        for (let i = 0; i < n; i++) { f(i); f((n - 1) * n + i); }
        for (let j = 1; j < n - 1; j++) { f(j * n); f(j * n + n - 1); }
    };
    // ocean flood
    border(k => { if (h[k] < sea && !kind[k]) { kind[k] = 1; queue[tail++] = k; } });
    while (head < tail)
    {
        const k = queue[head++], i = k % n, j = (k / n) | 0;
        const visit = (m: number) => { if (!kind[m] && h[m] < sea) { kind[m] = 1; queue[tail++] = m; } };
        if (i > 0) visit(k - 1); if (i < n - 1) visit(k + 1); if (j > 0) visit(k - n); if (j < n - 1) visit(k + n);
    }

    // priority flood: fill every basin to where it spills
    pace.begin("lakes");
    const filled = new Float32Array(total), seen = new Uint8Array(total), heap = new Heap(total);
    // the flood's parent links form a drainage tree to the outlets; `order` is the visit order (outlets first)
    const down = new Int32Array(total).fill(-1), order = new Int32Array(total);
    let visited = 0;
    for (let k = 0; k < total; k++) if (kind[k] === 1) { filled[k] = sea; seen[k] = 1; }
    // ocean nodes next to land, and land on the border, start the flood
    for (let k = 0; k < total; k++) if (kind[k] === 1)
    {
        const i = k % n, j = (k / n) | 0;
        if ((i > 0 && !kind[k - 1]) || (i < n - 1 && !kind[k + 1]) || (j > 0 && !kind[k - n]) || (j < n - 1 && !kind[k + n])) heap.push(sea, k);
    }
    border(k => { if (!seen[k]) { seen[k] = 1; filled[k] = h[k]; heap.push(h[k], k); } });
    let done = 0;
    while (heap.size)
    {
        const level = heap.topKey(), k = heap.pop(), i = k % n, j = (k / n) | 0;
        if ((++done & 16383) === 0) await pace.tick(done / total);
        const visit = (m: number) => {
            if (seen[m]) return;
            seen[m] = 1;
            filled[m] = Math.max(h[m], level);
            down[m] = k;
            order[visited++] = m;
            heap.push(filled[m], m);
        };
        if (i > 0) visit(k - 1); if (i < n - 1) visit(k + 1); if (j > 0) visit(k - n); if (j < n - 1) visit(k + n);
    }

    // basins that are deep and big enough
    const mark = new Uint8Array(total);
    for (let k = 0; k < total; k++)
    {
        if (kind[k] || mark[k] || filled[k] - h[k] <= 1e-4) continue;
        head = tail = 0;
        queue[tail++] = k; mark[k] = 1;
        let deepest = 0;
        while (head < tail)
        {
            const c = queue[head++], i = c % n, j = (c / n) | 0;
            deepest = Math.max(deepest, filled[c] - h[c]);
            const visit = (m: number) => { if (!mark[m] && !kind[m] && filled[m] - h[m] > 1e-4 && Math.abs(filled[m] - filled[c]) < 1e-3) { mark[m] = 1; queue[tail++] = m; } };
            if (i > 0) visit(c - 1); if (i < n - 1) visit(c + 1); if (j > 0) visit(c - n); if (j < n - 1) visit(c + n);
        }
        if (deepest < minDepth) continue;
        // the lake fills `fullness` of its basin: 1 to the brim (where it would spill), lower in dry basins
        const spill = filled[k], level = spill - deepest * (1 - fullness);
        let wet = 0;
        for (let q = 0; q < tail; q++) if (h[queue[q]] < level) wet++;
        if (wet < minNodes) continue;
        for (let q = 0; q < tail; q++) if (h[queue[q]] < level) { kind[queue[q]] = 2; surface[queue[q]] = level; }
    }
    // catchment: every land node brings 1, passed downstream from the last visited (highest) back to the outlets
    const acc = new Float32Array(total);
    for (let q = visited - 1; q >= 0; q--)
    {
        const m = order[q];
        if (kind[m] !== 1) acc[m] += 1;
        if (down[m] >= 0) acc[down[m]] += acc[m];
    }
    return { water: kind, surface, down, acc };
}

/** metres from every node to the nearest node where `source` is true (two pass chamfer, 1 / √2) */
export function distance(n: number, cell: number, source: (k: number) => boolean): Float32Array {
    const d = new Float32Array(n * n), D = Math.SQRT2;
    for (let k = 0; k < n * n; k++) d[k] = source(k) ? 0 : 1e9;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    {
        const k = j * n + i;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + 1);
        if (j > 0) { v = Math.min(v, d[k - n] + 1); if (i > 0) v = Math.min(v, d[k - n - 1] + D); if (i < n - 1) v = Math.min(v, d[k - n + 1] + D); }
        d[k] = v;
    }
    for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--)
    {
        const k = j * n + i;
        let v = d[k];
        if (i < n - 1) v = Math.min(v, d[k + 1] + 1);
        if (j < n - 1) { v = Math.min(v, d[k + n] + 1); if (i < n - 1) v = Math.min(v, d[k + n + 1] + D); if (i > 0) v = Math.min(v, d[k + n - 1] + D); }
        d[k] = v;
    }
    for (let k = 0; k < n * n; k++) d[k] *= cell;
    return d;
}

/** 0 flat .. 1 vertical from central differences, heights and `cell` in metres */
export function slopes(h: Float32Array, n: number, cell: number): Float32Array {
    const s = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    {
        const k = j * n + i;
        const gx = (h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)]) / ((Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * cell);
        const gz = (h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i]) / ((Math.min(n - 1, j + 1) - Math.max(0, j - 1)) * cell);
        s[k] = 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
    }
    return s;
}
