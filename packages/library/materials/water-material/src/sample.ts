import type { Layer3D } from "@papit/game-engine";
import { WaterMaterial } from "./material";
import type { Light, View, WaterLook } from "./types";

type Mesh = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number };

/**
 * A square of sea round a sandy island: the material on its own (views, gallery). The island is drawn plain
 * so the shore foam has something to run to. Bounds `size`, surface at y 0.
 */
export class WaterSample {
    readonly material: WaterMaterial;
    readonly size: [number, number, number];
    private gl: WebGL2RenderingContext;
    private water: Mesh;
    private island: Mesh;
    private program?: { program: WebGLProgram; name: string };

    constructor(readonly layer: Layer3D, look: Partial<WaterLook> = {}, { extent = 120, cells = 96, island = 22 } = {}) {
        this.gl = layer.gl;
        this.material = new WaterMaterial(layer, look);
        this.size = [extent, 6, extent];
        const gl = this.gl, step = extent / cells, v = cells + 1;
        const pos: number[] = [], info: number[] = [], flow: number[] = [], idx: number[] = [];
        for (let j = 0; j < v; j++) for (let i = 0; i < v; i++)
        {
            const x = i * step - extent / 2, z = j * step - extent / 2, shore = Math.max(0, Math.hypot(x, z) - island);
            pos.push(x, 0, z);
            info.push(shore * .15, shore);
            flow.push(x, z, 0, 1);
            if (i < cells && j < cells) { const a = j * v + i; idx.push(a, a + v, a + 1, a + 1, a + v, a + v + 1); }
        }
        this.water = this.upload([[pos, 3], [info, 2], [flow, 4]], idx);
        // island: a low cone poking out of the water
        const ipos: number[] = [0, 3, 0], iidx: number[] = [];
        for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; ipos.push(Math.cos(a) * island * 1.15, -1.5, Math.sin(a) * island * 1.15); if (k) iidx.push(0, k + 1, k); }
        this.island = this.upload([[ipos, 3]], iidx);
        const name = `water-sample-island-${Math.random().toString(36).slice(2)}`;
        layer.createProgram(name, `#version 300 es
layout(location = 0) in vec3 position; uniform mat4 view, projection; out float vY;
void main() { vY = position.y; gl_Position = projection * view * vec4(position, 1.0); }`, `#version 300 es
precision highp float; in float vY; out vec4 o; void main() { o = vec4(mix(vec3(.75, .68, .45), vec3(.93, .86, .62), clamp(vY / 3.0 + .5, 0.0, 1.0)), 1.0); }`)
            .then(program => this.program = { program, name });
    }

    draw(view: View, light: Light, time: number) {
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        if (this.program)
        {
            gl.useProgram(this.program.program);
            gl.uniformMatrix4fv(gl.getUniformLocation(this.program.program, "view"), false, new Float32Array(view.viewMatrix));
            gl.uniformMatrix4fv(gl.getUniformLocation(this.program.program, "projection"), false, new Float32Array(view.projectionMatrix));
            this.mesh(this.island);
        }
        if (!this.material.use(view, light, time)) return;
        const cull = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        this.mesh(this.water);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        if (cull) gl.enable(gl.CULL_FACE);
    }

    destroy() {
        for (const m of [this.water, this.island]) { this.gl.deleteVertexArray(m.vao); m.buffers.forEach(b => this.gl.deleteBuffer(b)); }
        this.material.destroy();
        if (this.program) this.layer.deleteProgram(this.program.name);
    }

    private mesh(m: Mesh) {
        const gl = this.gl;
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }

    private upload(attributes: [number[], number][], indices: number[]): Mesh {
        const gl = this.gl, vao = gl.createVertexArray()!, buffers: WebGLBuffer[] = [];
        gl.bindVertexArray(vao);
        attributes.forEach(([values, size], location) => {
            const b = gl.createBuffer()!;
            buffers.push(b);
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        });
        const ib = gl.createBuffer()!;
        buffers.push(ib);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        return { vao, buffers, count: indices.length };
    }
}
