import { DEFAULTS, FRAMES } from "./settings";
import type { BakeResult, BakeSettings, Raster, Triangles } from "./types";

const dot = (p: ArrayLike<number>, o: number, a: number[]) => p[o] * a[0] + p[o + 1] * a[1] + p[o + 2] * a[2];
const srgb = (v: number) => v <= .0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - .055;
const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** Bounds of the mesh in the bake frame of `axis`: [across, up, toward the viewer]. */
export function frameBounds(mesh: Triangles, axis: BakeSettings["axis"]) {
    const frame = FRAMES[axis], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i += 3)
        for (let k = 0; k < 3; k++)
        {
            const c = dot(mesh.positions, i, frame[k]);
            if (c < min[k]) min[k] = c;
            if (c > max[k]) max[k] = c;
        }
    return { min, max };
}

/** The rectangle `rasterise` uses: `size` and `center` from the settings, else from the bounds and `snap`. */
export function rectangle(mesh: Triangles, settings: Pick<BakeSettings, "axis" | "size" | "center" | "snap">) {
    const { min, max } = frameBounds(mesh, settings.axis), snap = Math.max(1e-6, settings.snap);
    const up = (v: number) => Math.max(snap, Math.ceil(v / snap - 1e-3) * snap);
    const size = settings.size ?? [up(max[0] - min[0]), up(max[1] - min[1])] as [number, number];
    const center = settings.center ?? [0, 1].map(k => Math.round((min[k] + max[k]) / 2 / snap) * snap) as [number, number];
    return { size, center };
}

/** Step 1 (slow): look at the mesh from the axis, keep the highest point and its material per supersample. */
export function rasterise(mesh: Triangles, options: Partial<BakeSettings> = {}): Raster {
    const settings = { ...DEFAULTS, ...options };
    if (!mesh.material.length) throw new Error("mesh-bake: the mesh has no triangles");
    const [T, B, N] = FRAMES[settings.axis];
    const { size, center } = rectangle(mesh, settings);
    const samples = Math.max(1, Math.min(8, Math.round(settings.samples)));
    const width = Math.max(1, Math.round(size[0] * settings.resolution)), height = Math.max(1, Math.round(size[1] * settings.resolution));
    if (width * height * samples * samples > 8192 * 8192) throw new Error(`mesh-bake: ${width}x${height} px at ${samples}x samples is too large`);
    const SW = width * samples, SH = height * samples, u0 = center[0] - size[0] / 2, v0 = center[1] - size[1] / 2;
    const depth = new Float32Array(SW * SH).fill(-Infinity), material = new Int16Array(SW * SH).fill(-2);
    const p = mesh.positions;
    let lo = Infinity, hi = -Infinity;

    for (let t = 0; t < mesh.material.length; t++)
    {
        const o = t * 9;
        const ax = (dot(p, o, T) - u0) / size[0] * SW, ay = (dot(p, o, B) - v0) / size[1] * SH, az = dot(p, o, N);
        const bx = (dot(p, o + 3, T) - u0) / size[0] * SW, by = (dot(p, o + 3, B) - v0) / size[1] * SH, bz = dot(p, o + 3, N);
        const cx = (dot(p, o + 6, T) - u0) / size[0] * SW, cy = (dot(p, o + 6, B) - v0) / size[1] * SH, cz = dot(p, o + 6, N);
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(area) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(SW - 1, Math.ceil(Math.max(ax, bx, cx)));
        const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(SH - 1, Math.ceil(Math.max(ay, by, cy)));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
        {
            const px = x + .5, py = y + .5;
            const wa = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
            const wb = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
            const wc = 1 - wa - wb;
            if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
            const z = wa * az + wb * bz + wc * cz, i = y * SW + x;
            if (z > depth[i]) { depth[i] = z; material[i] = mesh.material[t]; }
        }
    }

    // holes take their nearest filled neighbour, ring by ring
    let holes: number[] = [];
    for (let i = 0; i < material.length; i++)
    {
        if (material[i] === -2) holes.push(i);
        else { if (depth[i] < lo) lo = depth[i]; if (depth[i] > hi) hi = depth[i]; }
    }
    const coverage = 1 - holes.length / material.length;
    if (!coverage) throw new Error("mesh-bake: nothing of the mesh is inside the rectangle");
    while (holes.length)
    {
        const fill: number[] = [], rest: number[] = [];
        for (const i of holes)
        {
            const x = i % SW, y = (i - x) / SW;
            const from = x + 1 < SW && material[i + 1] !== -2 ? i + 1 : x > 0 && material[i - 1] !== -2 ? i - 1
                : y + 1 < SH && material[i + SW] !== -2 ? i + SW : y > 0 && material[i - SW] !== -2 ? i - SW : -1;
            if (from < 0) rest.push(i); else fill.push(i, from);
        }
        for (let k = 0; k < fill.length; k += 2) { material[fill[k]] = material[fill[k + 1]]; depth[fill[k]] = depth[fill[k + 1]]; }
        holes = rest;
    }
    return { width, height, samples, size, origin: [u0, v0], range: [lo, hi], depth, material, coverage, triangles: mesh.material.length };
}

function blur(src: Float32Array, w: number, h: number, radius: number, wrap: boolean) {
    if (radius < 1) return src;
    let from = src;
    const index = (v: number, n: number) => wrap ? ((v % n) + n) % n : Math.max(0, Math.min(n - 1, v));
    // two box passes each way come close to a gaussian
    for (let pass = 0; pass < 2; pass++)
        for (const horizontal of [true, false])
        {
            const to = new Float32Array(src.length), n = horizontal ? w : h, lines = horizontal ? h : w, step = horizontal ? 1 : w;
            for (let line = 0; line < lines; line++)
            {
                const base = horizontal ? line * w : line;
                let sum = 0;
                for (let k = -radius; k <= radius; k++) sum += from[base + index(k, n) * step];
                for (let i = 0; i < n; i++)
                {
                    to[base + i * step] = sum / (radius * 2 + 1);
                    sum += from[base + index(i + radius + 1, n) * step] - from[base + index(i - radius, n) * step];
                }
            }
            from = to;
        }
    return from;
}

/** Step 2 (fast): the maps from a raster. Only the settings after `tile` matter here, plus `axis` and `plane` for the quad. */
export function shade(raster: Raster, mesh: Pick<Triangles, "materials">, options: Partial<BakeSettings> = {}): BakeResult {
    const settings = { ...DEFAULTS, ...options };
    const { width: W, height: H, samples: S, size } = raster, SW = W * S, SH = H * S, wrap = settings.tile;
    const texel = size[0] / SW;
    const depth = blur(raster.depth, SW, SH, Math.round(settings.soften / texel), wrap);
    const at = (x: number, y: number) => {
        x = wrap ? (x + SW) % SW : Math.max(0, Math.min(SW - 1, x));
        y = wrap ? (y + SH) % SH : Math.max(0, Math.min(SH - 1, y));
        return depth[y * SW + x];
    };

    // relief at the final size, for the ambient occlusion
    const low = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    {
        let sum = 0;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) sum += depth[(y * S + sy) * SW + x * S + sx];
        low[y * W + x] = sum / (S * S);
    }
    // horizon in 8 directions: how much of the sky the surroundings hide
    const pixel = size[0] / W, reach = Math.max(1, Math.round(settings.aoRadius / pixel)), stride = Math.max(1, Math.ceil(reach / 12));
    const DIRECTIONS = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);
    const occlusion = new Float32Array(W * H);
    if (settings.aoStrength > 0)
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        {
            const here = low[y * W + x];
            let hidden = 0;
            for (const [dx, dy] of DIRECTIONS)
            {
                let slope = 0;
                for (let s = 1; s <= reach; s += stride)
                {
                    let nx = Math.round(x + dx * s), ny = Math.round(y + dy * s);
                    if (wrap) { nx = ((nx % W) + W) % W; ny = ((ny % H) + H) % H; }
                    else if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
                    const rise = (low[ny * W + nx] - here) / (s * pixel);
                    if (rise > slope) slope = rise;
                }
                hidden += slope / Math.sqrt(1 + slope * slope);
            }
            occlusion[y * W + x] = Math.min(1, hidden / DIRECTIONS.length * settings.aoStrength);
        }

    const color = new Uint8Array(W * H * 3), normal = new Uint8Array(W * H * 3), ao = new Uint8Array(W * H), spec = new Uint8Array(W * H), relief = new Uint8Array(W * H);
    const [lo, hi] = raster.range, span = Math.max(1e-6, hi - lo), LIMIT = 4; // slope limit: a vertical step stays a readable edge
    const white = { name: "", color: [1, 1, 1, 1] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    {
        let r = 0, g = 0, b = 0, nx = 0, ny = 0, nz = 0, shine = 0;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++)
        {
            const X = x * S + sx, Y = y * S + sy;
            const m = mesh.materials[raster.material[Y * SW + X]] ?? white;
            r += m.color[0]; g += m.color[1]; b += m.color[2];
            shine += settings.specByMaterial[m.name] ?? settings.spec;
            const dx = Math.max(-LIMIT, Math.min(LIMIT, (at(X + 1, Y) - at(X - 1, Y)) / (2 * texel) * settings.normalStrength));
            const dy = Math.max(-LIMIT, Math.min(LIMIT, (at(X, Y + 1) - at(X, Y - 1)) / (2 * texel) * settings.normalStrength));
            const l = Math.hypot(dx, dy, 1);
            nx -= dx / l; ny -= dy / l; nz += 1 / l;
        }
        const n = S * S, l = Math.hypot(nx, ny, nz) || 1, i = y * W + x, o = (H - 1 - y) * W + x; // image row 0 is the top
        const open = 1 - occlusion[i], tint = 1 - settings.aoInColor * occlusion[i];
        color[o * 3] = byte(srgb(r / n * tint)); color[o * 3 + 1] = byte(srgb(g / n * tint)); color[o * 3 + 2] = byte(srgb(b / n * tint));
        normal[o * 3] = byte(nx / l * .5 + .5); normal[o * 3 + 1] = byte(ny / l * .5 + .5); normal[o * 3 + 2] = byte(nz / l * .5 + .5);
        ao[o] = byte(open);
        spec[o] = byte(shine / n * (1 - settings.specCavity * occlusion[i]));
        relief[o] = byte((low[i] - lo) / span);
    }

    const [T, B, N] = FRAMES[settings.axis];
    const d = settings.plane === "top" ? hi : settings.plane === "bottom" ? lo : settings.plane;
    const [u0, v0] = raster.origin;
    const corner = (u: number, v: number) => [0, 1, 2].map(k => T[k] * u + B[k] * v + N[k] * d);
    return {
        width: W, height: H, size, color, normal, ao, spec, relief,
        quad: { positions: [corner(u0, v0), corner(u0 + size[0], v0), corner(u0 + size[0], v0 + size[1]), corner(u0, v0 + size[1])], normal: [...N], uvs: [[0, 1], [1, 1], [1, 0], [0, 0]] },
        depth: hi - lo, coverage: raster.coverage, triangles: raster.triangles,
    };
}

/** Both steps: mesh in, maps and quad out. */
export function bake(mesh: Triangles, options: Partial<BakeSettings> = {}): BakeResult {
    return shade(rasterise(mesh, options), mesh, options);
}
