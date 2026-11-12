import { Matrix4 } from "@papit/matrix";

/** 6 planes (a b c d) of projection * view, normalised */
export function frustum(projection: ArrayLike<number>, view: ArrayLike<number>): number[][] {
    const m = Matrix4.create(Array.from(projection)).multiply(Matrix4.create(Array.from(view)));
    const row = (r: number) => Array.from(m.getRow(r));
    const w = row(3), planes: number[][] = [];
    for (let r = 0; r < 3; r++)
    {
        const x = row(r);
        planes.push(w.map((e, i) => e + x[i]), w.map((e, i) => e - x[i]));
    }
    return planes.map(([a, b, c, d]) => { const l = Math.hypot(a, b, c) || 1; return [a / l, b / l, c / l, d / l]; });
}

export function visible(planes: number[][], x: number, y: number, z: number, r: number) {
    for (const [a, b, c, d] of planes) if (a * x + b * y + c * z + d < -r) return false;
    return true;
}
