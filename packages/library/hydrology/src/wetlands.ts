import type { Random } from "@papit/random";
import type { HydrologyOptions, Stream, Wet } from "./types";

const hash = (x: number, z: number, s: number) => { const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
/** smooth value noise 0..1 */
function noise(x: number, z: number, s: number) {
    const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, fu = u * u * (3 - 2 * u), fv = v * v * (3 - 2 * v);
    const a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}

/**
 * Swamps: shallow ragged water on flat low ground beside big rivers, with small islands; `waterKind` 2.
 * Lowers `height` a little under the water, sets `water` 2 and its `surface`.
 */
export function swamps(streams: Stream[], g: Wet & { waterKind: Uint8Array }, o: HydrologyOptions, rng: Random) {
    const { n, size, height: h, water, surface, waterKind } = g, cell = size / (n - 1), half = size / 2, S = o.swamps;
    if (S.count <= 0) return 0;
    // spots along wide, low, flat rivers
    const spots: [number, number, number][] = [];
    for (const s of streams) for (let i = 0; i < s.points.length; i += 20)
    {
        const [x, y, z, w] = s.points[i];
        if (w < S.width || y - g.seaLevel > S.height) continue;
        const k = Math.round((z + half) / cell) * n + Math.round((x + half) / cell);
        let lo = Infinity, hi = -Infinity;
        for (let a = 0; a < 8; a++) { const r = 40 + w, m = Math.round((z + Math.sin(a * .785) * r + half) / cell) * n + Math.round((x + Math.cos(a * .785) * r + half) / cell); if (m >= 0 && m < n * n) { lo = Math.min(lo, h[m]); hi = Math.max(hi, h[m]); } }
        if (k >= 0 && k < n * n && hi - lo < S.flat) spots.push([x, y, z]);
    }
    let made = 0;
    const used: [number, number, number][] = [];
    while (spots.length && made < S.count)
    {
        const [x, y, z] = spots.splice(rng.int(0, spots.length - 1), 1)[0], r = rng.float(S.radius[0], S.radius[1]);
        if (used.some(u => Math.hypot(u[0] - x, u[1] - z) < (u[2] + r) * 1.5)) continue;
        used.push([x, z, r]);
        const level = y + .25, seed = rng.float(0, 1000), reach = r * 1.4;
        const i0 = Math.max(0, Math.floor((x - reach + half) / cell)), i1 = Math.min(n - 1, Math.ceil((x + reach + half) / cell));
        const j0 = Math.max(0, Math.floor((z - reach + half) / cell)), j1 = Math.min(n - 1, Math.ceil((z + reach + half) / cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        {
            const k = j * n + i;
            if (water[k] === 1) continue;
            const px = i * cell - half, pz = j * cell - half;
            // ragged edge and islands from noise
            const blob = Math.hypot(px - x, pz - z) / r + (noise(px / 35, pz / 35, seed) - .5) * .9, isle = noise(px / 14, pz / 14, seed + 5);
            if (blob >= 1 || isle > .78 || h[k] > level + 3) continue;
            h[k] = Math.min(h[k], level - .2 - .5 * (1 - blob));
            water[k] = 2; surface[k] = level; waterKind[k] = 2;
        }
        made++;
    }
    return made;
}

/** lake kinds: low, shallow lakes muddy (1), the rest clear (0); swamps (2) stay */
export function lakeKinds(g: Wet & { waterKind: Uint8Array }, o: HydrologyOptions) {
    const { n, height: h, water, surface, waterKind } = g, seen = new Uint8Array(n * n);
    for (let s = 0; s < n * n; s++)
    {
        if (seen[s] || water[s] !== 2 || waterKind[s] === 2) continue;
        const part = [s], stack = [s];
        seen[s] = 1;
        let depth = 0;
        while (stack.length)
        {
            const k = stack.pop()!, i = k % n;
            depth += surface[k] - h[k];
            for (const m of [k - 1, k + 1, k - n, k + n])
            {
                if (m < 0 || m >= n * n || Math.abs((m % n) - i) > 1 || seen[m] || water[m] !== 2 || waterKind[m] === 2) continue;
                seen[m] = 1; part.push(m); stack.push(m);
            }
        }
        const muddy = surface[s] - g.seaLevel < o.muddy.height && depth / part.length < o.muddy.depth;
        if (muddy) for (const k of part) waterKind[k] = 1;
    }
}
