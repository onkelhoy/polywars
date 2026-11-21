import type { Mesh, RGB, Vec3 } from "./types";

/** flat shaded triangle soup builder */
export class Soup {
    p: number[] = []; n: number[] = []; c: number[] = [];

    tri(a: Vec3, b: Vec3, d: Vec3, col: RGB) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz);
        if (l < 1e-9) return;
        nx /= l; ny /= l; nz /= l;
        for (const v of [a, b, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2], 1); }
    }

    /** quad a b c d (counter clockwise seen from the front) */
    quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, col: RGB) { this.tri(a, b, c, col); this.tri(a, c, d, col); }

    /** both sides */
    quad2(a: Vec3, b: Vec3, c: Vec3, d: Vec3, col: RGB) { this.quad(a, b, c, d, col); this.quad(d, c, b, a, col); }

    /** box between two points (centre line), `w` across (horizontal), `h` up (or across when the beam is vertical) */
    beam(a: Vec3, b: Vec3, w: number, h: number, col: RGB) {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz) || 1;
        const f: Vec3 = [dx / l, dy / l, dz / l];
        // side: horizontal, perpendicular to the beam (vertical beams: x)
        let s: Vec3 = [-f[2], 0, f[0]];
        const sl = Math.hypot(s[0], s[2]);
        s = sl < 1e-4 ? [1, 0, 0] : [s[0] / sl, 0, s[2] / sl];
        const u: Vec3 = [f[1] * s[2] - f[2] * s[1], f[2] * s[0] - f[0] * s[2], f[0] * s[1] - f[1] * s[0]];
        const up: Vec3 = u[1] < 0 ? [-u[0], -u[1], -u[2]] : u;
        const corner = (p: Vec3, i: number, j: number): Vec3 => [p[0] + s[0] * w / 2 * i + up[0] * h / 2 * j, p[1] + s[1] * w / 2 * i + up[1] * h / 2 * j, p[2] + s[2] * w / 2 * i + up[2] * h / 2 * j];
        const A = [corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1)];
        const B = [corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1)];
        for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; this.quad2(A[k], A[k1], B[k1], B[k], col); }
        this.quad2(A[3], A[2], A[1], A[0], col);
        this.quad2(B[0], B[1], B[2], B[3], col);
    }

    /** upright box: centre bottom `at`, size, turned by `yaw` (x along `dir`) */
    block(at: Vec3, dir: [number, number], size: Vec3, col: RGB) {
        const [fx, fz] = dir, sx = -fz, sz = fx, [L, H, W] = size;
        const p = (i: number, j: number, k: number): Vec3 => [at[0] + fx * L / 2 * i + sx * W / 2 * k, at[1] + H * j, at[2] + fz * L / 2 * i + sz * W / 2 * k];
        const c = [p(-1, 0, -1), p(1, 0, -1), p(1, 0, 1), p(-1, 0, 1)], t = [p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1)];
        for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; this.quad2(c[k], c[k1], t[k1], t[k], col); }
        this.quad2(t[0], t[1], t[2], t[3], col);
    }

    mesh(): Mesh {
        const positions = new Float32Array(this.p), min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
        for (let i = 0; i < positions.length; i += 3) { min.x = Math.min(min.x, positions[i]); min.y = Math.min(min.y, positions[i + 1]); min.z = Math.min(min.z, positions[i + 2]); max.x = Math.max(max.x, positions[i]); max.y = Math.max(max.y, positions[i + 1]); max.z = Math.max(max.z, positions[i + 2]); }
        if (!positions.length) { min.x = min.y = min.z = max.x = max.y = max.z = 0; }
        return { positions, normals: new Float32Array(this.n), colors: new Float32Array(this.c), bounds: { min, max, radius: Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2 } };
    }
}

/** point + unit direction (horizontal) + side every `step` m along a polyline */
export function along(path: Vec3[], step: number, offset = 0): { p: Vec3; dir: [number, number]; side: [number, number]; d: number }[] {
    const out: { p: Vec3; dir: [number, number]; side: [number, number]; d: number }[] = [];
    let total = 0, next = offset;
    for (let i = 0; i < path.length - 1; i++)
    {
        const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (l < 1e-6) continue;
        const dir: [number, number] = [(b[0] - a[0]) / l, (b[2] - a[2]) / l];
        while (next <= total + l + 1e-6)
        {
            const t = (next - total) / l;
            out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], dir, side: [-dir[1], dir[0]], d: next });
            next += step;
        }
        total += l;
    }
    return out;
}

export const length = (path: Vec3[]) => path.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - path[i][0], p[2] - path[i][2]), 0);
