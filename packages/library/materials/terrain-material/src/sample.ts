import type { Layer3D } from "@papit/game-engine";
import { fbm, ridged, simplex } from "@polywar/noise";
import { WaterMaterial } from "@polywar/water-material";
import { TerrainMaterial } from "./material";
import { BIOMES, type Biome, type Light, type TerrainLook, type View } from "./types";

type Mesh = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number };

/**
 * A small square of made up land with every biome, water around it: the material on its own
 * (views, gallery tiles, `pw-3d-asset-preview` `scene`). Bounds `size`, base at y 0.
 */
export class TerrainSample {
    readonly material: TerrainMaterial;
    readonly water: WaterMaterial;
    readonly size: [number, number, number];
    private gl: WebGL2RenderingContext;
    private ground: Mesh;
    private sea: Mesh;
    private level: number;

    constructor(layer: Layer3D, look: Partial<TerrainLook> = {}, { extent = 4, cells = 48, seed = 3 } = {}) {
        this.gl = layer.gl;
        const height = extent * .45, sea = height * .18;
        this.material = new TerrainMaterial(layer, {
            snow: { color: "#f2f4f7", height: height * .8, softness: height * .05, slope: .6 },
            range: [0, height], contours: look.contours ? height / 12 : 0,
            ...look,
        });
        this.water = new WaterMaterial(layer, { foam: { color: "#fff", width: 0, spacing: 1, speed: 0, amount: 0, shore: 0, far: 0 }, sparkle: { strength: 1, size: .3, scale: .4, far: 20 } });
        this.level = sea;
        this.size = [extent, height, extent];
        const n = simplex(seed), gl = this.gl, step = extent / cells, v = cells + 1;
        const h = new Float32Array(v * v);
        for (let j = 0; j < v; j++) for (let i = 0; i < v; i++)
        {
            const x = i / cells * 2 - 1, z = j / cells * 2 - 1;
            const fall = Math.max(0, 1 - Math.pow(Math.hypot(x, z) / 1.05, 3));
            const m = ridged(n, x * 1.2 + 3, z * 1.2, { octaves: 4 }) * Math.max(0, x + .3);
            h[j * v + i] = Math.max(0, height * fall * (.25 + .2 * fbm(n, x * 2, z * 2) + m * .9));
        }
        const pos: number[] = [], nor: number[] = [], data: number[] = [], flow: number[] = [], surface: number[] = [];
        for (let j = 0; j < v; j++) for (let i = 0; i < v; i++)
        {
            const y = h[j * v + i], at = (a: number, b: number) => h[Math.min(v - 1, Math.max(0, b)) * v + Math.min(v - 1, Math.max(0, a))];
            const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * step), dz = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
            const l = Math.hypot(dx, 1, dz), slope = 1 - 1 / l;
            const z = j / cells * 2 - 1, moist = .5 + .5 * n(i * .1 + 9, j * .1), temp = .5 - z * .4;
            const t = y / height;
            const biome: Biome = y < sea ? "ocean" : t < .23 ? "beach" : t > .75 ? "snow" : t > .55 ? "mountain"
                : temp > .7 ? (moist < .5 ? "desert" : "savanna") : moist > .6 ? "forest" : t > .4 ? "hills" : "grassland";
            pos.push(i * step - extent / 2, y, j * step - extent / 2);
            nor.push(-dx / l, 1 / l, -dz / l);
            data.push(BIOMES.indexOf(biome), slope, moist, temp);
            flow.push(0);
            surface.push(sea);
        }
        this.ground = this.upload([[pos, 3], [nor, 3], [data, 4], [flow, 1], [surface, 1]], grid(cells));
        const e = extent / 2, d = height * .3;
        this.sea = this.upload([[[-e, sea, -e, e, sea, -e, e, sea, e, -e, sea, e], 3], [[d, 9, d, 9, d, 9, d, 9], 2], [[-e, -e, 0, 0, e, -e, 0, 0, e, e, 0, 0, -e, e, 0, 0], 4]], new Uint32Array([0, 2, 1, 0, 3, 2]));
    }

    draw(view: View, light: Light, time: number) {
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        const under = { texture: this.water.texture, time, caustics: .6, color: this.water.look.under.color, density: this.water.look.under.density, eyeUnder: (view.worldPosition?.y ?? 1) < this.level };
        if (this.material.useGround(view, light, under)) this.drawMesh(this.ground);
        if (this.water.use(view, light, time, { under: under.eyeUnder }))
        {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            this.drawMesh(this.sea);
            gl.depthMask(true);
            gl.disable(gl.BLEND);
        }
    }

    destroy() {
        for (const m of [this.ground, this.sea]) { this.gl.deleteVertexArray(m.vao); m.buffers.forEach(b => this.gl.deleteBuffer(b)); }
        this.material.destroy();
        this.water.destroy();
    }

    private drawMesh(m: Mesh) {
        const gl = this.gl;
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }

    private upload(attributes: [number[], number][], indices: Uint32Array): Mesh {
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
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        return { vao, buffers, count: indices.length };
    }
}

/** two triangles per cell over a `cells`² grid of (cells + 1)² vertices */
export function grid(cells: number): Uint32Array {
    const v = cells + 1, out = new Uint32Array(cells * cells * 6);
    for (let j = 0, k = 0; j < cells; j++) for (let i = 0; i < cells; i++, k += 6)
    {
        const a = j * v + i;
        // alternate the diagonal: no long ridges along one direction
        if ((i + j) & 1) out.set([a, a + v, a + 1, a + 1, a + v, a + v + 1], k);
        else out.set([a, a + v, a + v + 1, a, a + v + 1, a + 1], k);
    }
    return out;
}

