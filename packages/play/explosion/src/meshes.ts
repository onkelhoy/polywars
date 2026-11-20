/** unit icosahedron split `subdivisions` times, flat triangle list (xyz) */
export function icosahedron(subdivisions: number) {
    return new Float32Array(faces(subdivisions).flat(2));
}

/** the same with barycentric corners per vertex: xyz uvw */
export function icosahedronBary(subdivisions: number) {
    const out: number[] = [], bary = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (const f of faces(subdivisions)) f.forEach((p, i) => out.push(...p, ...bary[i]));
    return new Float32Array(out);
}

function faces(subdivisions: number) {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
        .map(p => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
    let out = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]].map(f => f.map(i => v[i]));
    const mid = (a: number[], b: number[]) => { const m = [a[0] + b[0], a[1] + b[1], a[2] + b[2]], l = Math.hypot(m[0], m[1], m[2]); return [m[0] / l, m[1] / l, m[2] / l]; };
    for (let s = 0; s < subdivisions; s++)
        out = out.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
    return out;
}

/** a 3 sided spike: base triangle at y 0 (unit circle), tip at y 1 */
export function spike() {
    const out: number[] = [], b = [0, 1, 2].map(i => [Math.cos(i / 3 * Math.PI * 2), 0, Math.sin(i / 3 * Math.PI * 2)]);
    for (let i = 0; i < 3; i++) out.push(...b[i], ...b[(i + 1) % 3], 0, 1, 0);
    return new Float32Array(out);
}

/** a flat ring of `n` quads: (cos, sin, side 0 outer / 1 inner, segment) per vertex */
export function ring(n: number) {
    const out: number[] = [];
    for (let i = 0; i < n; i++)
    {
        const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
        const p = (angle: number, side: number) => out.push(Math.cos(angle), Math.sin(angle), side, i);
        p(a, 0); p(b, 0); p(b, 1); p(a, 0); p(b, 1); p(a, 1);
    }
    return new Float32Array(out);
}
