import type { Random } from "@papit/random";
import { sample } from "./grid";
import type { Ground, HydrologyOptions, Lake, Wet } from "./types";

const RING = 24;

/**
 * Highland lakes: basins dug on high, calm ground, best next to a big drop (so the outlet falls over it).
 * A low rim closes the bowl, with a notch toward the drop: the outlet. Changes `height`, marks `hard` (keep from erosion).
 */
export function digLakes(g: Ground, o: HydrologyOptions, rng: Random, hard: Float32Array): Lake[] {
    const { n, size, height: h, top, seaLevel } = g, cell = size / (n - 1), half = size / 2, L = o.lakes;
    if (L.count <= 0) return [];
    const at = (x: number, z: number) => sample(h, n, size, x, z);
    type Spot = { x: number; z: number; r: number; level: number; score: number; angle: number };
    const spots: Spot[] = [];
    for (let t = 0; t < 3000; t++)
    {
        const r = rng.float(L.radius[0], L.radius[1]), x = rng.float(-half + r * 3, half - r * 3), z = rng.float(-half + r * 3, half - r * 3), c = at(x, z);
        if (c < L.height * top || c < seaLevel + L.depth * 2) continue;
        // calm inside, a drop outside
        let rough = 0, low = Infinity, angle = 0;
        for (let a = 0; a < RING; a++)
        {
            const ang = a / RING * Math.PI * 2, cx = Math.cos(ang), cz = Math.sin(ang);
            // calm out past the rim too: a drop inside it would leave the lake open (a dam in the air)
            for (const f of [.6, 1]) rough = Math.max(rough, Math.abs(at(x + cx * r * f, z + cz * r * f) - c));
            for (const f of [1.2, 1.45]) rough = Math.max(rough, c - at(x + cx * r * f, z + cz * r * f) - 2);
            const far = at(x + cx * r * 2.5, z + cz * r * 2.5);
            if (far < low) { low = far; angle = ang; }
        }
        if (rough > L.depth) continue;
        spots.push({ x, z, r, level: c, score: Math.min(c - low, 120) - rough * 3, angle });
    }
    spots.sort((a, b) => b.score - a.score);
    const picked: Spot[] = [];
    for (const s of spots)
    {
        if (picked.length >= L.count) break;
        if (picked.some(p => Math.hypot(p.x - s.x, p.z - s.z) < (p.r + s.r) * 3)) continue;
        picked.push(s);
    }
    for (const s of picked)
    {
        const reach = s.r * 1.4, i0 = Math.max(0, Math.floor((s.x - reach + half) / cell)), i1 = Math.min(n - 1, Math.ceil((s.x + reach + half) / cell));
        const j0 = Math.max(0, Math.floor((s.z - reach + half) / cell)), j1 = Math.min(n - 1, Math.ceil((s.z + reach + half) / cell));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        {
            const x = i * cell - half, z = j * cell - half, t = Math.hypot(x - s.x, z - s.z) / s.r, k = j * n + i;
            if (t > 1.4) continue;
            if (t < 1) h[k] = Math.min(h[k], s.level - L.depth * (1 - t * t) * (.8 + .2 * Math.cos(t * 7 + i * .3)));
            // rim, lowered to a notch toward the drop
            let da = Math.abs(Math.atan2(z - s.z, x - s.x) - s.angle);
            da = Math.min(da, Math.PI * 2 - da);
            const rim = Math.max(0, 1 - Math.abs(t - 1.1) / .3), notch = da < .3 ? -.5 : 2.5;
            if (rim > 0 && t >= .85) h[k] = Math.max(h[k], s.level + notch * rim);
            hard[k] = Math.max(hard[k], .9 * Math.min(1, (1.4 - t) * 3));
        }
    }
    return picked.map(s => ({ x: s.x, z: s.z, radius: s.r, level: s.level }));
}

/** After erosion: fill each highland lake up to just under its notch (water 2). */
export function fillLakes(lakes: Lake[], g: Wet): Lake[] {
    const kept: Lake[] = [];
    const { n, size, height: h, water, surface } = g, cell = size / (n - 1), half = size / 2;
    for (const l of lakes)
    {
        // spill: the lowest point of the rim
        let spill = Infinity;
        for (let a = 0; a < 96; a++)
        {
            const ang = a / 96 * Math.PI * 2;
            let ridge = -Infinity;
            for (const f of [.95, 1.05, 1.15, 1.25]) ridge = Math.max(ridge, sample(h, n, size, l.x + Math.cos(ang) * l.radius * f, l.z + Math.sin(ang) * l.radius * f));
            spill = Math.min(spill, ridge);
        }
        const level = spill - .3, max = l.radius * 1.3;
        l.level = level;
        const start = Math.round((l.z + half) / cell) * n + Math.round((l.x + half) / cell);
        if (h[start] >= level || level < g.seaLevel) continue;
        kept.push(l);
        const stack = [start], seen = new Set([start]);
        while (stack.length)
        {
            const k = stack.pop()!, i = k % n, j = (k / n) | 0;
            water[k] = 2; surface[k] = level;
            for (const m of [k - 1, k + 1, k - n, k + n])
            {
                const x = m % n, z = (m / n) | 0;
                if (m < 0 || m >= n * n || Math.abs(x - i) > 1 || seen.has(m)) continue;
                seen.add(m);
                if (h[m] < level && Math.hypot(x * cell - half - l.x, z * cell - half - l.z) < max) stack.push(m);
            }
        }
    }
    return kept;
}
