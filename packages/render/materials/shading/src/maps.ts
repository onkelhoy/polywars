/** Procedural normal maps: a height field to rgb normals (OpenGL, +Y up), tileable. */
export function normalPixels(kind: "bumps" | "tiles", size = 128, strength = 3): Uint8Array {
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    {
        const u = x / size, v = y / size;
        let value: number;
        if (kind === "bumps")
        {
            // one round bump per tile
            const dx = u - .5, dy = v - .5, d = Math.hypot(dx, dy) * 2.4;
            value = d < 1 ? Math.sqrt(1 - d * d) : 0;
        }
        else
        {
            // 2 x 2 bricks, rows offset by half, bevelled grooves
            const row = Math.floor(v * 2), bu = (u * 2 + row * .5) % 1, bv = (v * 2) % 1;
            const edge = Math.min(bu, 1 - bu, bv, 1 - bv);
            value = Math.min(edge / .08, 1);
        }
        h[y * size + x] = value;
    }
    const at = (x: number, y: number) => h[((y + size) % size) * size + (x + size) % size];
    const out = new Uint8Array(size * size * 3);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    {
        // rows run top to bottom, the map's +Y runs up the image
        const nx = (at(x - 1, y) - at(x + 1, y)) * strength, ny = (at(x, y + 1) - at(x, y - 1)) * strength;
        const l = Math.hypot(nx, ny, 1), i = (y * size + x) * 3;
        out[i] = (nx / l * .5 + .5) * 255;
        out[i + 1] = (ny / l * .5 + .5) * 255;
        out[i + 2] = (1 / l * .5 + .5) * 255;
    }
    return out;
}
