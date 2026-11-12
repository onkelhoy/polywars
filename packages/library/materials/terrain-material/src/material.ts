import type { Layer3D } from "@papit/game-engine";
import { bindUnder } from "@polywar/water";
import { GROUND_FRAGMENT, GROUND_VERTEX } from "./shaders";
import { BIOMES, type BiomeMap, type Light, type TerrainLook, type Underwater, type View } from "./types";

type Program = { name: string; program: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

let ids = 0;
const DEBUG = { "": 0, biome: 1, height: 2, slope: 3, moisture: 4, temperature: 5, flow: 6 } as const;

/** Low poly earthy palette; any field can be overridden. */
export const TERRAIN_LOOK: TerrainLook = {
    colors: {
        ocean: "#b9a57a", lake: "#8a8160", beach: "#e3d39b", grassland: "#7ea64a", savanna: "#c2b35e",
        desert: "#dcbf7d", forest: "#4f7d3a", hills: "#8f9b52", plateau: "#a68e62", mountain: "#8a8077", snow: "#f2f4f7", river: "#7d7556",
    },
    rock: { color: "#7c746c", slope: .55, softness: .08 },
    snow: { color: "#f2f4f7", height: 260, softness: 25, slope: .6 },
    paint: { edge: 7, size: 16, strokes: .08 },
    gloss: { rock: .2, wet: .22, reach: 6 },
    variation: .06,
    flat: true,
    bands: 0,
    lighting: { wrap: .1, steepness: 1 },
    contours: 0,
    range: [0, 400],
    debug: "",
};

/** a few named looks on top of `TERRAIN_LOOK` (views, gallery) */
export const TERRAIN_LOOKS: Record<string, Partial<TerrainLook>> = {
    natural: {},
    toon: { bands: 3, variation: .1 },
    smooth: { flat: false, variation: 0 },
    map: { contours: 10, flat: false, variation: 0 },
};

/** sRGB hex to linear rgb */
export function linear(hex: string): [number, number, number] {
    const n = parseInt(hex.replace("#", ""), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => Math.pow(c / 255, 2.2)) as [number, number, number];
}

/**
 * The terrain material: the ground program (biome palette, rock on slopes, snow caps, faceted light, debug views,
 * tint under water). Water itself is `@polywar/water`. Geometry is the caller's.
 *
 * Ground attributes: 0 position, 1 normal, 2 data (biome index, slope, moisture, temperature), 3 flow, 4 water surface height.
 */
export class TerrainMaterial {
    readonly gl: WebGL2RenderingContext;
    private o: TerrainLook;
    private groundProgram?: Program;
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };
    private id = ids++;
    private map?: { texture: WebGLTexture; wet?: WebGLTexture; n: number; size: number };

    /** Programs come from the layer (async); `useGround` returns false until they are linked. */
    constructor(readonly layer: Layer3D, look: Partial<TerrainLook> = {}) {
        this.gl = layer.gl;
        this.o = merge(TERRAIN_LOOK, look);
        this.link(`terrain-material-${this.id}-ground`, GROUND_VERTEX, GROUND_FRAGMENT).then(p => this.groundProgram = p);
    }

    get look(): Readonly<TerrainLook> { return this.o; }

    /** Merge settings (nested objects merge too). Nothing to rebuild: all uniforms. */
    set(look: Partial<TerrainLook>) { this.o = merge(this.o, look); }

    /** Biome grid for the painted borders (null: off, borders follow the mesh). */
    biomes(map: BiomeMap | null) {
        const gl = this.gl;
        if (this.map) { gl.deleteTexture(this.map.texture); if (this.map.wet) gl.deleteTexture(this.map.wet); }
        this.map = undefined;
        if (!map) return;
        const texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, map.n, map.n, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, map.biome);
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
        for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
        let wet: WebGLTexture | undefined;
        if (map.toWater)
        {
            // metres to water, 0..255 m in a byte, filtered
            const bytes = new Uint8Array(map.n * map.n);
            for (let k = 0; k < bytes.length; k++) bytes[k] = Math.min(255, Math.round(map.toWater[k]));
            wet = gl.createTexture()!;
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, wet);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, map.n, map.n, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
            for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
            for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
        }
        gl.activeTexture(gl.TEXTURE0);
        this.map = { texture, wet, n: map.n, size: map.size };
    }

    /** Bind the ground program. `water` adds the underwater tint and fog. */
    useGround(view: View, light: Light, water?: Underwater): boolean {
        const gl = this.gl, o = this.o, p = this.groundProgram;
        if (!p) return false;
        const u = p.u;
        gl.useProgram(p.program);
        this.common(p, view, light);
        gl.uniform3fv(u("palette"), BIOMES.flatMap(b => linear(o.colors[b])));
        gl.uniform3fv(u("rockColor"), linear(o.rock.color));
        gl.uniform2f(u("rock"), o.rock.slope, o.rock.softness);
        gl.uniform3fv(u("snowColor"), linear(o.snow.color));
        gl.uniform3f(u("snow"), o.snow.height, o.snow.softness, o.snow.slope);
        gl.uniform1f(u("variation"), o.variation);
        gl.uniform3f(u("paint"), this.map ? o.paint.edge : 0, Math.max(1, o.paint.size), o.paint.strokes);
        gl.uniform2f(u("grid"), this.map?.n ?? 0, this.map?.size ?? 1);
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, this.map?.texture ?? null);
        gl.activeTexture(gl.TEXTURE0);
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, this.map?.wet ?? null);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(u("biomeMap"), 5);
        gl.uniform1i(u("waterMap"), 4);
        gl.uniform3f(u("gloss"), o.gloss.rock, this.map?.wet ? o.gloss.wet : 0, Math.max(.1, o.gloss.reach));
        gl.uniform1f(u("contours"), o.contours);
        gl.uniform1i(u("flatShade"), o.flat ? 1 : 0);
        gl.uniform2f(u("range"), o.range[0], o.range[1]);
        gl.uniform1i(u("debug"), DEBUG[o.debug] ?? 0);
        gl.uniform1i(u("eyeUnder"), water?.eyeSurface != null ? 1 : 0);
        if (water) bindUnder(gl, u, water.under, water.eyeSurface ?? 0);
        return true;
    }

    destroy() {
        this.biomes(null);
        if (this.groundProgram) this.layer.deleteProgram(this.groundProgram.name);
    }

    private common(p: Program, view: View, light: Light) {
        const gl = this.gl, u = p.u, o = this.o;
        this.f32.view.set(view.viewMatrix);
        this.f32.projection.set(view.projectionMatrix);
        gl.uniformMatrix4fv(u("view"), false, this.f32.view);
        gl.uniformMatrix4fv(u("projection"), false, this.f32.projection);
        const e = view.worldPosition ?? { x: 0, y: 0, z: 0 };
        gl.uniform3f(u("eye"), e.x, e.y, e.z);
        gl.uniform3fv(u("sunDirection"), light.sunDirection);
        gl.uniform3fv(u("sunColor"), light.sunColor);
        gl.uniform1f(u("sunStrength"), light.sunStrength);
        gl.uniform3fv(u("sky"), light.sky);
        gl.uniform3fv(u("ground"), light.ground);
        gl.uniform1f(u("ambient"), light.ambient);
        gl.uniform3fv(u("fogColor"), light.fogColor);
        gl.uniform1f(u("fogDensity"), light.fogDensity);
        gl.uniform1f(u("bands"), o.bands);
        gl.uniform1f(u("wrap"), o.lighting.wrap);
        gl.uniform1f(u("steepness"), o.lighting.steepness);
    }

    private async link(name: string, vertex: string, fragment: string): Promise<Program> {
        const gl = this.gl, program = await this.layer.createProgram(name, vertex, fragment);
        const cache = new Map<string, WebGLUniformLocation | null>();
        return { name, program, u: n => cache.has(n) ? cache.get(n)! : (cache.set(n, gl.getUniformLocation(program, n)), cache.get(n)!) };
    }
}

/** one level deep merge: nested plain objects merge, the rest replaces */
export function merge<T extends object>(base: T, over: Partial<T>): T {
    const out: any = { ...base };
    for (const [k, v] of Object.entries(over))
    {
        if (v === undefined) continue;
        const b = (base as any)[k];
        out[k] = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b) ? { ...b, ...v } : v;
    }
    return out;
}
