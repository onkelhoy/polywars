/**
 * Right triangulated irregular network (RTIN, Evans et al. 2001; the method behind Mapbox's Martini).
 * The grid (2^k + 1 nodes a side) is a binary tree of right triangles; each is split only where the surface
 * strays more than `maxError` from it, so flat land gets big triangles and ridges keep full detail.
 * Errors propagate up the tree, which keeps the mesh free of cracks.
 */

const tables = new Map<number, { coords: Uint16Array; count: number; parents: number }>();

/** corner a and b of every triangle in the tree, by id; c follows from them */
function table(size: number) {
    let t = tables.get(size);
    if (t) return t;
    const tile = size - 1, count = tile * tile * 2 - 2, parents = count - tile * tile, coords = new Uint16Array(count * 4);
    for (let i = 0; i < count; i++)
    {
        let id = i + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
        if (id & 1) { bx = by = cx = tile; }
        else { ax = ay = cy = tile; }
        while ((id >>= 1) > 1)
        {
            const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
            if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; }
            else { ax = bx; ay = by; bx = cx; by = cy; }
            cx = mx; cy = my;
        }
        coords.set([ax, ay, bx, by], i * 4);
    }
    tables.clear();
    tables.set(size, t = { coords, count, parents });
    return t;
}

/**
 * Error per node (a split priority, metres when `adaptive` is 1): how far the height there is from the edge it splits. `edge(k, a, b)` may add more
 * (e.g. a biome border between node k and the corners a / b) so those edges always get split.
 */
export function errors(height: Float32Array, size: number, edge?: (k: number, a: number, b: number) => number, adaptive = 1): Float32Array {
    const { coords, count, parents } = table(size), out = new Float32Array(size * size);
    for (let i = count - 1; i >= 0; i--)
    {
        const k = i * 4, ax = coords[k], ay = coords[k + 1], bx = coords[k + 2], by = coords[k + 3];
        const mx = (ax + bx) >> 1, my = (ay + by) >> 1, cx = mx + my - ay, cy = my + ax - mx;
        const a = ay * size + ax, b = by * size + bx, m = my * size + mx;
        let e = Math.abs((height[a] + height[b]) / 2 - height[m]);
        if (edge) e = Math.max(e, edge(m, a, b));
        // `adaptive` blends the triangle size (0: even grid) with the height error (1: detail where the shape needs it)
        if (adaptive < 1) e = Math.pow(Math.abs(ax - bx) + Math.abs(ay - by), 1 - adaptive) * Math.pow(e + .05, adaptive);
        if (i < parents) e = Math.max(e, out[((ay + cy) >> 1) * size + ((ax + cx) >> 1)], out[((by + cy) >> 1) * size + ((bx + cx) >> 1)]);
        out[m] = Math.max(out[m], e);
    }
    return out;
}

/** The mesh for `maxError`: `nodes` (grid index per vertex) and `triangles` (3 vertex indices each). */
export function triangulate(err: Float32Array, size: number, maxError: number) {
    const max = size - 1, index = new Uint32Array(size * size);
    let vertices = 0, count = 0;
    const countAll = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
        const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
        if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && err[my * size + mx] > maxError)
        {
            countAll(cx, cy, ax, ay, mx, my);
            countAll(bx, by, cx, cy, mx, my);
        }
        else
        {
            for (const k of [ay * size + ax, by * size + bx, cy * size + cx]) if (!index[k]) index[k] = ++vertices;
            count++;
        }
    };
    countAll(0, 0, max, max, max, 0);
    countAll(max, max, 0, 0, 0, max);

    const nodes = new Uint32Array(vertices), triangles = new Uint32Array(count * 3);
    for (let k = 0; k < index.length; k++) if (index[k]) nodes[index[k] - 1] = k;
    let t = 0;
    const emit = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
        const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
        if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && err[my * size + mx] > maxError)
        {
            emit(cx, cy, ax, ay, mx, my);
            emit(bx, by, cx, cy, mx, my);
        }
        else
        {
            triangles[t++] = index[ay * size + ax] - 1;
            triangles[t++] = index[by * size + bx] - 1;
            triangles[t++] = index[cy * size + cx] - 1;
        }
    };
    emit(0, 0, max, max, max, 0);
    emit(max, max, 0, 0, 0, max);
    return { nodes, triangles };
}

/**
 * Height of the mesh `triangulate(err, size, maxError)` makes, at grid position x / y (fractional, 0..size-1):
 * walks down the same tree to the leaf triangle holding the point and interpolates its corners.
 */
export function meshHeight(err: Float32Array, size: number, maxError: number, height: (k: number) => number, x: number, y: number) {
    const max = size - 1;
    // right angle at c, hypotenuse a b; the root halves split along the diagonal
    let ax: number, ay: number, bx: number, by: number, cx: number, cy: number;
    if (x >= y) { ax = 0; ay = 0; bx = max; by = max; cx = max; cy = 0; }
    else { ax = max; ay = max; bx = 0; by = 0; cx = 0; cy = max; }
    const side = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    for (;;)
    {
        const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
        if (!(Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && err[my * size + mx] > maxError)) break;
        // children (c, a, m) and (b, c, m), split by the line c m
        if (side(cx, cy, mx, my, x, y) * side(cx, cy, mx, my, ax, ay) >= 0) { const tx = ax, ty = ay; ax = cx; ay = cy; bx = tx; by = ty; }
        else { ax = bx; ay = by; bx = cx; by = cy; }
        cx = mx; cy = my;
    }
    // barycentric in a b c
    const d = side(ax, ay, bx, by, cx, cy) || 1;
    const wa = side(bx, by, cx, cy, x, y) / d, wb = side(cx, cy, ax, ay, x, y) / d, wc = 1 - wa - wb;
    return height(ay * size + ax) * wa + height(by * size + bx) * wb + height(cy * size + cx) * wc;
}
