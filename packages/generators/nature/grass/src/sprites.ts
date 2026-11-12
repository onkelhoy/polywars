import { hash } from "./noise";

export type Sprite = { width: number; height: number; data: Uint8Array };

/**
 * Generated sprites, row 0 is the bottom. r = shade, g = 1 where the accent colour shows (else the grass colour).
 * `leaves` fat leaves pointing every way from the centre (reads from any angle, also top-down),
 * `tuft` a fan of blades, `flower` a stem with a head, `leafy` fewer, taller, wider blades.
 */
export function sprite(kind: "leaves" | "tuft" | "flower" | "leafy", pixels: number, seed = 1): Sprite {
    const n = pixels, data = new Uint8Array(n * n * 4);
    if (kind === "leaves") return leaves(n, seed, data);
    const k = n / 24;
    const put = (x: number, y: number, shade: number, accent = 0) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= n || y >= n) return;
        const i = (y * n + x) * 4, v = Math.round(Math.min(1, shade) * 255);
        // keep the brightest blade in front
        if (data[i + 3] && data[i] >= v && !accent) return;
        data[i] = v;
        data[i + 1] = accent * 255;
        data[i + 2] = 0;
        data[i + 3] = 255;
    };
    const blade = (base: number, lean: number, height: number, width: number, shade: number, accent = kind === "leafy" ? 1 : 0) => {
        for (let y = 0; y < height; y++)
        {
            const t = y / height;
            const x = base + lean * t * t;
            const w = Math.max(1, width * (1 - t * .8));
            for (let i = 0; i < w; i++) put(x + i - w / 2, y, shade * (.72 + .28 * t), accent);
        }
    };
    const blades = kind === "leafy" ? 4 : kind === "flower" ? 3 : 7;
    for (let b = 0; b < blades; b++)
    {
        const r = (i: number) => hash(seed * 1000 + b * 13 + i);
        const side = (b / (blades - 1 || 1)) * 2 - 1;
        const base = n / 2 + side * n * .18 + (r(1) - .5) * 2 * k;
        const lean = side * n * (.15 + r(2) * .2);
        const height = n * (kind === "leafy" ? .8 + r(3) * .2 : .5 + r(3) * .4) * (kind === "flower" ? .6 : 1);
        // neighbours alternate a little in shade so blades read apart
        blade(base, lean, height, (kind === "leafy" ? 3 : 2) * k, (b % 2 ? .86 : 1) * (.94 + r(4) * .06));
    }
    if (kind === "flower")
    {
        const cx = n / 2, top = n * .72;
        blade(cx, n * .04, top, 1.2 * k, .7, 0);
        const r = 2.6 * k;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
            if (x * x + y * y <= r * r) put(cx + n * .04 + x, top + y, x * x + y * y < r * r * .25 ? .75 : 1, 1);
    }
    return { width: n, height: n, data };
}

/** 3-4 leaves around the centre, each a pointed ellipse in its own shade, lighter towards the tip */
function leaves(n: number, seed: number, data: Uint8Array): Sprite {
    const count = 3 + (hash(seed * 77) > .5 ? 1 : 0);
    const start = hash(seed * 91) * Math.PI * 2;
    // drawn back to front: later leaves cover earlier ones
    for (let l = 0; l < count; l++)
    {
        const r = (i: number) => hash(seed * 1000 + l * 17 + i);
        const angle = start + l * Math.PI * 2 / count + (r(1) - .5) * .6;
        const length = n * (.36 + r(2) * .12), width = length * (.34 + r(3) * .1);
        const dx = Math.cos(angle), dy = Math.sin(angle);
        // leaf from near the centre outwards
        const cx = n / 2 + dx * length * .5, cy = n / 2 + dy * length * .5;
        // each leaf its own shade, neighbours alternate
        const shade = (l % 2 ? .84 : 1) * (.94 + r(4) * .06);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
        {
            const px = x + .5 - cx, py = y + .5 - cy;
            const along = (px * dx + py * dy) / (length / 2), across = (-px * dy + py * dx) / (width / 2);
            // pointed at the tip: narrower as `along` grows
            const taper = 1 - Math.max(0, along) * .45;
            const e = along * along + (across / taper) * (across / taper);
            if (e > 1) continue;
            const i = (y * n + x) * 4;
            // lighter towards the tip, no rim
            const v = (.8 + .2 * (along * .5 + .5)) * shade;
            data[i] = Math.round(Math.min(1, v) * 255);
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 255;
        }
    }
    return { width: n, height: n, data };
}
