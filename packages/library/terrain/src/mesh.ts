import { BIOMES } from "@polywar/terrain-material";
import type { TerrainData } from "./types";

export type Mesh = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number; x: number; y: number; z: number; radius: number };
type Attribute = [Float32Array, number];

export function upload(gl: WebGL2RenderingContext, attributes: Attribute[], indices: Uint32Array, shared?: WebGLBuffer): Omit<Mesh, "x" | "y" | "z" | "radius"> {
    const vao = gl.createVertexArray()!, buffers: WebGLBuffer[] = [];
    gl.bindVertexArray(vao);
    attributes.forEach(([values, size], location) => {
        const b = gl.createBuffer()!;
        buffers.push(b);
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    });
    let ib = shared;
    if (!ib) { ib = gl.createBuffer()!; buffers.push(ib); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    if (!shared) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, buffers, count: indices.length };
}

export function free(gl: WebGL2RenderingContext, meshes: { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[] }[]) {
    for (const m of meshes) { gl.deleteVertexArray(m.vao); m.buffers.forEach(b => gl.deleteBuffer(b)); }
}

/** two triangles per cell, the diagonal alternates (no long ridges along one direction) */
export function grid(cells: number): Uint32Array {
    const v = cells + 1, out = new Uint32Array(cells * cells * 6);
    for (let j = 0, k = 0; j < cells; j++) for (let i = 0; i < cells; i++, k += 6)
    {
        const a = j * v + i;
        if ((i + j) & 1) out.set([a, a + v, a + 1, a + 1, a + v, a + v + 1], k);
        else out.set([a, a + v, a + v + 1, a, a + v + 1, a + 1], k);
    }
    return out;
}

/**
 * Flat ground from the map edge out to `skirt` metres: the far fields or the sea floor, in the edge's most common biome.
 * The inner edge follows the map every `segments`th of a side (the edge is faded flat, so few are needed).
 */
export function skirt(gl: WebGL2RenderingContext, d: TerrainData, level: number, skirtSize: number, fallback: number, segments = 32) {
    const n = d.n, half = d.size / 2, outer = half + skirtSize;
    const sides: ((t: number) => [number, number])[] = [t => [t, 0], t => [n - 1, t], t => [n - 1 - t, n - 1], t => [0, n - 1 - t]];
    const votes = new Map<number, number>();
    for (const side of sides) for (let t = 0; t < n; t++) { const [i, j] = side(t), b = d.biome[j * n + i]; votes.set(b, (votes.get(b) ?? 0) + 1); }
    const biome = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
    const pos: number[] = [], nor: number[] = [], data: number[] = [], idx: number[] = [];
    for (const side of sides)
    {
        const base = pos.length / 3;
        for (let s = 0; s <= segments; s++)
        {
            const [i, j] = side(Math.round(s / segments * (n - 1))), x = i * d.cell - half, z = j * d.cell - half;
            // out to the outer square, straight away from the map side (corners diagonal)
            const k = outer / Math.max(Math.abs(x), Math.abs(z), 1e-6);
            pos.push(x, d.height[j * n + i], z, x * k, level, z * k);
            nor.push(0, 1, 0, 0, 1, 0);
            data.push(biome, 0, .5, .5, biome, 0, .5, .5);
        }
        for (let s = 0; s < segments; s++)
        {
            const a = base + s * 2;
            idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
    }
    const m = upload(gl, [[new Float32Array(pos), 3], [new Float32Array(nor), 3], [new Float32Array(data), 4], [new Float32Array(pos.length / 3).fill(-1), 1]], new Uint32Array(idx));
    return { ...m, x: 0, y: level, z: 0, radius: outer * 1.5 };
}

/**
 * Water surfaces as quads: every cell (of `step` nodes) touching water of `kind` (1 ocean, 2 lake) at its surface level.
 * `depth` per vertex for the tint. Ocean also gets a ring out to `skirt` metres.
 */
export function waterMesh(gl: WebGL2RenderingContext, d: TerrainData, kind: 1 | 2, step: number, skirtSize = 0) {
    const n = d.n, half = d.size / 2, pos: number[] = [], depth: number[] = [], idx: number[] = [];
    const quad = (corners: [number, number, number, number][]) => {
        const b = pos.length / 3;
        for (const [x, y, z, dp] of corners) { pos.push(x, y, z); depth.push(dp); }
        idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 2);
    };
    for (let j = 0; j < n - 1; j += step) for (let i = 0; i < n - 1; i += step)
    {
        const i1 = Math.min(n - 1, i + step), j1 = Math.min(n - 1, j + step), ks = [j * n + i, j * n + i1, j1 * n + i1, j1 * n + i];
        let level = -Infinity;
        for (const k of ks) if (d.water[k] === kind) level = Math.max(level, d.surface[k]);
        if (level === -Infinity) continue;
        const xy = [[i, j], [i1, j], [i1, j1], [i, j1]];
        quad(ks.map((k, c) => [xy[c][0] * d.cell - half, level, xy[c][1] * d.cell - half, level - d.height[k]]) as any);
    }
    if (kind === 1 && skirtSize > 0)
    {
        const o = half + skirtSize, y = d.seaLevel, deep = d.seaLevel + d.size;
        quad([[-o, y, -o, deep], [o, y, -o, deep], [o, y, -half, deep], [-o, y, -half, deep]]);
        quad([[-o, y, half, deep], [o, y, half, deep], [o, y, o, deep], [-o, y, o, deep]]);
        quad([[-o, y, -half, deep], [-half, y, -half, deep], [-half, y, half, deep], [-o, y, half, deep]]);
        quad([[half, y, -half, deep], [o, y, -half, deep], [o, y, half, deep], [half, y, half, deep]]);
    }
    if (!idx.length) return null;
    return { ...upload(gl, [[new Float32Array(pos), 3], [new Float32Array(depth), 1]], new Uint32Array(idx)), x: 0, y: 0, z: 0, radius: Infinity };
}

export const BIOME = (name: typeof BIOMES[number]) => BIOMES.indexOf(name);
