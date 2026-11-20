import { marchingCubes } from "@papit/marching-cubes";
import type { CloudKind } from "./types";

/** a big round mass a cloud is built on: x, y, z, radius (y up from its bottom line) */
export type Mass = [number, number, number, number];

/**
 * The masses of a cloud: a few big ones per `kind`, plus smaller bumps on their upper surface
 * (the cartoon outline). `size` m, `height` tower multiplier, `lean` m the head goes sideways.
 */
export function skeleton(kind: CloudKind, size: number, height: number, lean: number): Mass[] {
    const r = Math.random, S = size, out: Mass[] = [];
    const add = (x: number, y: number, z: number, radius: number) => out.push([x, y, z, radius * S]);
    if (kind === "cumulus")
    {
        // base row, shoulders, a body that climbs and leans, a head
        for (let i = 0; i < 3; i++) { const t = i / 2 - .5, mid = 1 - Math.abs(t) * 2; add(t * 1.3 * S, .2 * S, (r() - .5) * .3 * S, .42 + .1 * mid); }
        add(-.5 * S, .55 * S, (r() - .5) * .3 * S, .34); add(.55 * S, .5 * S, (r() - .5) * .3 * S, .32);
        add(lean * .3, .95 * S * height, 0, .46); add(lean * .65, 1.35 * S * height, (r() - .5) * .2 * S, .42);
        add(lean, 1.72 * S * height, 0, .38); add(lean + (r() < .5 ? -1 : 1) * .32 * S, 1.6 * S * height, (r() - .5) * .3 * S, .28);
    }
    else if (kind === "fair")
    {
        add(0, .25 * S, 0, .45); add(-.42 * S, .15 * S, (r() - .5) * .3 * S, .3); add(.45 * S, .15 * S, (r() - .5) * .3 * S, .32);
        if (r() < .6) add((r() - .5) * .3 * S, .5 * S, 0, .28);
    }
    else if (kind === "bank")
    {
        for (let i = 0; i < 6; i++) { const t = i / 5 - .5, mid = 1 - Math.abs(t) * 2; add(t * 2.6 * S, (.15 + .1 * mid) * S, (r() - .5) * .5 * S, .3 + .14 * mid); }
        add((r() - .5) * .8 * S, .45 * S, 0, .3);
    }
    else
    {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) add((i / 3 - .5) * 2.6 * S + (r() - .5) * .3 * S, (.12 + r() * .05) * S, (j / 2 - .5) * 1.6 * S, .36 + r() * .08);
    }
    // bumps: a few smaller ones on each mass's upper side, not buried in a neighbour
    const big = out.slice();
    for (const m of big)
        for (let i = 0, n = kind === "overcast" ? 1 : 3; i < n; i++)
        {
            const a = r() * Math.PI * 2, up = .35 + r() * .55, ring = Math.sqrt(1 - up * up);
            const p: Mass = [m[0] + Math.cos(a) * ring * m[3] * .9, m[1] + up * m[3] * .9, m[2] + Math.sin(a) * ring * m[3] * .9, m[3] * (.5 + r() * .15)];
            if (big.some(q => q !== m && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < q[3] * .75)) continue;
            out.push(p);
        }
    return out;
}

/**
 * One low poly mesh round the masses: they blend smoothly (summed soft spheres), cut flat at y 0,
 * marched on a coarse grid (`cells` along the longest side) and jittered a little so the facets look cut by hand.
 * Returns flat triangles, positions only.
 */
export function cloudMesh(masses: Mass[], cells = 16, jitter = .25): Float32Array {
    const min = [Infinity, 0, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const m of masses)
        for (let k = 0; k < 3; k++)
        {
            if (k !== 1) min[k] = Math.min(min[k], m[k] - m[3] * 1.2);
            max[k] = Math.max(max[k], m[k] + m[3] * 1.2);
        }
    const cell = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / cells;
    min[1] = -cell; // one layer under the bottom line
    const w = Math.ceil((max[0] - min[0]) / cell) + 2, h = Math.ceil((max[1] - min[1]) / cell) + 2, dz = Math.ceil((max[2] - min[2]) / cell) + 2;
    const values = new Float32Array(w * h * dz);
    // a lone mass ends at its radius: kernel (1 - (d / 1.5r)²)², which is .309 at d = r (tight: lobes stay round)
    const iso = .309;
    for (let z = 0; z < dz; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    {
        const px = min[0] + x * cell, py = min[1] + y * cell, pz = min[2] + z * cell;
        let f = 0;
        if (py > 0)
            for (const m of masses)
            {
                const q = ((px - m[0]) ** 2 + (py - m[1]) ** 2 + (pz - m[2]) ** 2) / (2.25 * m[3] * m[3]);
                if (q < 1) f += (1 - q) * (1 - q);
            }
        values[x + w * (y + h * z)] = f - iso;
    }
    const { positions } = marchingCubes({ values, width: w, height: h, depth: dz }, {
        transform: (x, y, z, out) => { out[0] = min[0] + x * cell; out[1] = min[1] + y * cell; out[2] = min[2] + z * cell; },
    });
    // jitter: the same point always moves the same way (shared corners stay shared); the bottom stays flat
    const out = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3)
    {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        const k = hash(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
        const j = jitter * cell, flat = y < cell * .5 ? 0 : 1;
        out[i] = x + (k[0] - .5) * j;
        out[i + 1] = Math.max(0, y + (k[1] - .5) * j * flat);
        out[i + 2] = z + (k[2] - .5) * j;
    }
    return out;
}

function hash(x: number, y: number, z: number) {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
    const next = () => { h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    return [next(), next(), next()];
}
