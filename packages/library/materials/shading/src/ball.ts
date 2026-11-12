import type { Layer3D } from "@papit/game-engine";
import { upload, type GPUMesh, type Mesh } from "@papit/game-mesh";
import { Renderer, type Drawable, type Light, type View } from "@polywar/renderer";
import { loadTexture, textureFrom, type Maps } from "@polywar/textured";
import { normalPixels } from "./maps";
import type { Shading } from "./shading";

/** uv sphere of `radius` around `center`, `repeat` tiles the uvs */
export function uvSphere(radius = .5, center: [number, number, number] = [0, radius, 0], color: [number, number, number] = [1, 1, 1], repeat: [number, number] = [1, 1], rings = 32, segments = 64): Mesh {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
    for (let r = 0; r <= rings; r++)
    {
        const theta = r / rings * Math.PI;
        for (let s = 0; s <= segments; s++)
        {
            const phi = s / segments * Math.PI * 2;
            const n = [Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)];
            positions.push(center[0] + n[0] * radius, center[1] + n[1] * radius, center[2] + n[2] * radius);
            normals.push(...n);
            uvs.push(s / segments * repeat[0], r / rings * repeat[1]);
            colors.push(...color, 1);
        }
    }
    const row = segments + 1;
    for (let r = 0; r < rings; r++) for (let s = 0; s < segments; s++)
    {
        const a = r * row + s, b = a + row;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return {
        positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), colors: new Float32Array(colors),
        indices: new Uint32Array(indices),
        bounds: { min: { x: center[0] - radius, y: center[1] - radius, z: center[2] - radius }, max: { x: center[0] + radius, y: center[1] + radius, z: center[2] + radius }, radius },
    };
}

/** flat checker floor on y = 0, `size` wide, `cells` per side */
export function checker(size = 2.4, cells = 8, a: [number, number, number] = [.18, .18, .19], b: [number, number, number] = [.3, .3, .32]): Mesh {
    const positions: number[] = [], normals: number[] = [], colors: number[] = [];
    const step = size / cells, o = -size / 2;
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++)
    {
        const x0 = o + i * step, z0 = o + j * step, x1 = x0 + step, z1 = z0 + step, c = (i + j) % 2 ? a : b;
        positions.push(x0, 0, z0, x0, 0, z1, x1, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1);
        for (let k = 0; k < 6; k++) { normals.push(0, 1, 0); colors.push(...c, 1); }
    }
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), bounds: { min: { x: o, y: 0, z: o }, max: { x: -o, y: 0, z: -o }, radius: -o * Math.SQRT2 } };
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * A shading on a Blender-like preview ball: a sphere over a checker floor. A `Drawable`, so the gallery
 * and `pw-3d-asset-preview` (`scene`) show it; the light comes from them, the shading changes how it lands.
 */
export class ShadingBall implements Drawable {
    readonly size: [number, number, number] = [1, 1, 1];
    readonly renderer: Renderer;
    private ball: GPUMesh;
    private floor: GPUMesh;
    private maps: Maps = {};
    private own?: WebGLTexture;

    constructor(readonly layer: Layer3D, readonly shading: Shading = {}) {
        const gl = layer.gl;
        this.renderer = new Renderer(layer);
        this.ball = upload(gl, uvSphere(.5, [0, .5, 0], shading.color ?? [.8, .32, .16], shading.repeat ?? [1, 1]));
        this.floor = upload(gl, checker());
        const n = shading.normal;
        if (n === "bumps" || n === "tiles") this.maps.normal = this.own = textureFrom(gl, normalPixels(n), 128, 128, 3);
        else if (n) loadTexture(gl, n).then(t => this.maps.normal = t);
    }

    draw(view: View, light: Light, _time: number) {
        const r = this.renderer, s = this.shading;
        r.light = { ...light, toon: s.toon ?? 0 };
        r.begin(view, null);
        r.draw(this.floor, IDENTITY);
        r.draw(this.ball, IDENTITY, { unlit: s.unlit, maps: this.maps });
    }

    destroy() {
        this.ball.destroy();
        this.floor.destroy();
        if (this.own) this.layer.gl.deleteTexture(this.own);
    }
}
