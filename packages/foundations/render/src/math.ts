/** Minimal column major mat4 helpers for node transforms. */
export type Mat4 = Float32Array;

export const mat4 = () => identity(new Float32Array(16));

export function identity(out: Mat4) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
}

/** out = a * b */
export function multiply(out: Mat4, a: ArrayLike<number>, b: ArrayLike<number>) {
    const r = new Float32Array(16);
    for (let c = 0; c < 4; c++)
        for (let row = 0; row < 4; row++)
        {
            let s = 0;
            for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
            r[c * 4 + row] = s;
        }
    out.set(r);
    return out;
}

/** Translation, quaternion xyzw, scale. */
export function fromTRS(out: Mat4, t: ArrayLike<number>, q: ArrayLike<number>, s: ArrayLike<number>) {
    const [x, y, z, w] = [q[0], q[1], q[2], q[3]];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    out.set([
        (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
        (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
        (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
        t[0], t[1], t[2], 1,
    ]);
    return out;
}

export function transformPoint(m: ArrayLike<number>, x: number, y: number, z: number): [number, number, number] {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
