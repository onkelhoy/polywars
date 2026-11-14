/** Small column major 4x4 helpers (Float32Array / number[] of 16). */
export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const mat4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** out = translate(x, y, z) · Ry(yaw) · Rx(pitch) · Rz(roll) · scale(s) */
export function compose(out: Mat4, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, s = 1) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    // Ry·Rx
    const m00 = cy, m01 = sy * sp, m02 = sy * cp;
    const m10 = 0, m11 = cp, m12 = -sp;
    const m20 = -sy, m21 = cy * sp, m22 = cy * cp;
    // ·Rz
    out[0] = (m00 * cr + m01 * sr) * s; out[1] = (m10 * cr + m11 * sr) * s; out[2] = (m20 * cr + m21 * sr) * s; out[3] = 0;
    out[4] = (-m00 * sr + m01 * cr) * s; out[5] = (-m10 * sr + m11 * cr) * s; out[6] = (-m20 * sr + m21 * cr) * s; out[7] = 0;
    out[8] = m02 * s; out[9] = m12 * s; out[10] = m22 * s; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
    return out;
}

export function multiply(out: Mat4, a: ArrayLike<number>, b: ArrayLike<number>) {
    const r = new Float32Array(16);
    for (let c = 0; c < 4; c++)
        for (let row = 0; row < 4; row++)
            r[c * 4 + row] = a[row] * b[c * 4] + a[4 + row] * b[c * 4 + 1] + a[8 + row] * b[c * 4 + 2] + a[12 + row] * b[c * 4 + 3];
    out.set(r);
    return out;
}

export function point(m: ArrayLike<number>, p: ArrayLike<number>): Vec3 {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

export function direction(m: ArrayLike<number>, d: ArrayLike<number>): Vec3 {
    return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
}

/** inverse of a rotation + translation (+ uniform scale) matrix */
export function invertRigid(out: Mat4, m: ArrayLike<number>) {
    const s2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2] || 1;
    const r = new Float32Array(16);
    r[0] = m[0] / s2; r[1] = m[4] / s2; r[2] = m[8] / s2;
    r[4] = m[1] / s2; r[5] = m[5] / s2; r[6] = m[9] / s2;
    r[8] = m[2] / s2; r[9] = m[6] / s2; r[10] = m[10] / s2;
    r[12] = -(r[0] * m[12] + r[4] * m[13] + r[8] * m[14]);
    r[13] = -(r[1] * m[12] + r[5] * m[13] + r[9] * m[14]);
    r[14] = -(r[2] * m[12] + r[6] * m[13] + r[10] * m[14]);
    r[15] = 1;
    out.set(r);
    return out;
}

/** a perspective projection (vertical fov radians) */
export function perspective(out: Mat4, fov: number, aspect: number, near: number, far: number) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
}

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
