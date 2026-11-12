import type { Layer3D } from "@papit/game-engine";
import { Random } from "@papit/random";
import { GrassMaterial } from "./material";
import type { GrassLook, Light, View } from "./types";

export type PatchOptions = {
    /** metres */
    radius: number;
    /** tufts per m² */
    density: number;
    seed: number;
    /** colour scale of the floor */
    darken: number;
};

/**
 * A round patch of grass on its floor, centred on the origin: the material shown on its own
 * (views, gallery tiles, `pw-3d-asset-preview` `scene`). Sprite tufts on flat ground.
 */
export class GrassPatch {
    readonly material: GrassMaterial;
    /** bounds: x y z, base at y 0, centred on x / z */
    readonly size: [number, number, number];
    private gl: WebGL2RenderingContext;
    private tuft: { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number; instances: number };
    private floor: { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number };
    private o: PatchOptions;

    constructor(layer: Layer3D, look: Partial<GrassLook> = {}, options: Partial<PatchOptions> = {}) {
        this.gl = layer.gl;
        this.o = { radius: 1.5, density: 120, seed: 1, darken: .8, ...options };
        this.material = new GrassMaterial(layer, { source: "sprite", ...look });
        const gl = this.gl, r = this.o.radius;
        this.size = [r * 2, this.material.look.size[1] * 1.5, r * 2];

        // one quad, base at y 0, height 1 (the shader scales and faces it)
        const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
        for (const [x, y] of [[-.5, 0], [.5, 0], [.5, 1], [-.5, 0], [.5, 1], [-.5, 1]]) { positions.push(x, y, 0); normals.push(0, 1, 0); uvs.push(x + .5, y); }
        // tufts: jittered grid inside the disc, x y z scale
        const rng = new Random(this.o.seed), step = 1 / Math.sqrt(this.o.density), data: number[] = [];
        for (let z = -r; z < r; z += step) for (let x = -r; x < r; x += step)
        {
            const px = x + rng.next() * step, pz = z + rng.next() * step, s = rng.next();
            if (Math.hypot(px, pz) < r) data.push(px, 0, pz, 1 + (s * 2 - 1) * .3);
        }
        const vao = gl.createVertexArray()!, buffers: WebGLBuffer[] = [];
        gl.bindVertexArray(vao);
        const attribute = (location: number, values: number[], size: number, divisor = 0) => {
            const b = gl.createBuffer()!;
            buffers.push(b);
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(location, divisor);
        };
        attribute(0, positions, 3);
        attribute(1, normals, 3);
        attribute(2, uvs, 2);
        attribute(4, data, 4, 1);
        gl.bindVertexArray(null);
        this.tuft = { vao, buffers, count: 6, instances: data.length / 4 };

        // floor: a fan of 48 triangles
        const ring = 48, floor: number[] = [0, 0, 0];
        for (let i = 0; i <= ring; i++) floor.push(Math.cos(i / ring * Math.PI * 2) * r, 0, -Math.sin(i / ring * Math.PI * 2) * r);
        const fvao = gl.createVertexArray()!, fb = gl.createBuffer()!;
        gl.bindVertexArray(fvao);
        gl.bindBuffer(gl.ARRAY_BUFFER, fb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(floor), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this.floor = { vao: fvao, buffers: [fb], count: ring + 2 };
    }

    /** `time` in seconds */
    draw(view: View, light: Light, time: number) {
        const gl = this.gl;
        const cull = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        if (this.material.useGround(view, light, time, this.o.darken))
        {
            gl.bindVertexArray(this.floor.vao);
            gl.drawArrays(gl.TRIANGLE_FAN, 0, this.floor.count);
        }
        if (this.material.useTufts(view, light, time))
        {
            gl.bindVertexArray(this.tuft.vao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, this.tuft.count, this.tuft.instances);
        }
        gl.bindVertexArray(null);
        if (cull) gl.enable(gl.CULL_FACE);
    }

    destroy() {
        const gl = this.gl;
        for (const g of [this.tuft, this.floor]) { gl.deleteVertexArray(g.vao); g.buffers.forEach(b => gl.deleteBuffer(b)); }
        this.material.destroy();
    }
}
