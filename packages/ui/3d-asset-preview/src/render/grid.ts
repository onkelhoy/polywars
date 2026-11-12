import { upload, type GPUMesh, type Mesh } from "@papit/game-mesh";
import { Matrix4 } from "@papit/matrix";
import type { Renderer } from "./renderer";

/** A flat line grid on y = 0, every `step` metres out to `size`, darker every `major` lines. */
export class Grid {
    private gpu: GPUMesh;
    private matrix = Matrix4.create();

    constructor(gl: WebGL2RenderingContext, size = 20, step = 1, major = 5) {
        const positions: number[] = [], colors: number[] = [];
        const n = Math.round(size / step);
        for (let i = -n; i <= n; i++)
        {
            const c = i === 0 ? [.15, .15, .15, .9] : i % major === 0 ? [.15, .15, .15, .5] : [.15, .15, .15, .2];
            const v = i * step;
            positions.push(v, 0, -size, v, 0, size, -size, 0, v, size, 0, v);
            for (let k = 0; k < 4; k++) colors.push(...c);
        }
        const mesh: Mesh = {
            positions: new Float32Array(positions), normals: new Float32Array(positions.length),
            colors: new Float32Array(colors), bounds: { min: { x: -size, y: 0, z: -size }, max: { x: size, y: 0, z: size }, radius: size * Math.SQRT2 },
        };
        this.gpu = upload(gl, mesh);
    }

    draw(renderer: Renderer) {
        renderer.draw(this.gpu, this.matrix, { unlit: true }, renderer.gl.LINES);
    }

    destroy() {
        this.gpu.destroy();
    }
}
