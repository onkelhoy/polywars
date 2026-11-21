/** A smooth signed shore distance over a square of the world, for the water's wave lines (see `WaterMaterial.use`). */
export type ShoreMap = { texture: WebGLTexture; x: number; z: number; cell: number; n: number };

/**
 * Upload signed metres to the shore (> 0 on water, < 0 on land) on a grid of `n`² nodes `cell` metres apart, node 0 at
 * world `x` `z` (row by row along x, rows along z). Blurred over `blur` metres so the waves come out round, not along every
 * facet of the land. Half float, filtered.
 */
export function createShoreMap(gl: WebGL2RenderingContext, signed: ArrayLike<number>, n: number, x: number, z: number, cell: number, blur = 12): ShoreMap {
    let a = new Float32Array(n * n);
    for (let k = 0; k < a.length; k++) a[k] = Math.max(-500, Math.min(2000, signed[k]));
    const r = Math.max(0, Math.round(blur / cell / 2));
    // three box passes: close to a gaussian
    if (r > 0) for (let pass = 0; pass < 3; pass++) a = box(a, n, r);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, n, n, 0, gl.RED, gl.FLOAT, a);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { texture, x, z, cell, n };
}

export function deleteShoreMap(gl: WebGL2RenderingContext, map: ShoreMap) { gl.deleteTexture(map.texture); }

/** box blur `r` nodes, rows then columns (running sums) */
function box(a: Float32Array, n: number, r: number) {
    const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
    for (let j = 0; j < n; j++)
    {
        let sum = 0, count = 0;
        for (let i = 0; i <= Math.min(r, n - 1); i++) { sum += a[j * n + i]; count++; }
        for (let i = 0; i < n; i++)
        {
            tmp[j * n + i] = sum / count;
            const add = i + r + 1, drop = i - r;
            if (add < n) { sum += a[j * n + add]; count++; }
            if (drop >= 0) { sum -= a[j * n + drop]; count--; }
        }
    }
    for (let i = 0; i < n; i++)
    {
        let sum = 0, count = 0;
        for (let j = 0; j <= Math.min(r, n - 1); j++) { sum += tmp[j * n + i]; count++; }
        for (let j = 0; j < n; j++)
        {
            out[j * n + i] = sum / count;
            const add = j + r + 1, drop = j - r;
            if (add < n) { sum += tmp[add * n + i]; count++; }
            if (drop >= 0) { sum -= tmp[drop * n + i]; count--; }
        }
    }
    return out;
}
