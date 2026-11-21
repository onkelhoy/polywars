import { bindFog } from "@polywar/fog";
import { bindShadows } from "@polywar/shadows";
import type { Layer3D } from "@papit/game-engine";
import { bindUnder } from "@polywar/water";
import { GROUND_FRAGMENT, GROUND_VERTEX, NOISE_FRAGMENT, NOISE_SIZE, NOISE_VERTEX } from "./shaders";
import { BIOMES, type Albedo, type BiomeMap, type CoverMap, type Light, type TerrainLook, type Underwater, type View } from "./types";

type Program = { name: string; program: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

let ids = 0;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const DEBUG = { "": 0, biome: 1, height: 2, slope: 3, moisture: 4, temperature: 5, flow: 6, cover: 7, albedo: 8 } as const;

/** Low poly earthy palette; any field can be overridden. */
export const TERRAIN_LOOK: TerrainLook = {
    colors: {
        ocean: "#bfa57a", lake: "#8f8160", beach: "#e8d49b", grassland: "#88a94b", savanna: "#cab35c",
        desert: "#e2bf7a", forest: "#587f3b", hills: "#9a9d53", plateau: "#b08f60", mountain: "#918077", snow: "#f4f3f2", river: "#837556",
    },
    rock: { color: "#847670", slope: .55, softness: .08 },
    snow: { color: "#f2f4f7", height: 260, softness: 25, slope: .6 },
    paint: { edge: 10, size: 30, washes: .5, rim: 0, warmth: .5, grain: 0, pixel: .3 },
    paths: { dirt: "#8a6e4e", gravel: "#a59a86" },
    grass: {
        color: "#5d9a3a", dry: "#c4ad62", blend: .5, darken: .8, edge: .3,
        patches: [{ color: "#7bb045", scale: .02, threshold: .58, softness: .08 }, { color: "#4a7d33", scale: .015, threshold: .62, softness: .08 }],
    },
    variation: 0,
    flat: false,
    bands: 3,
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
    private map?: { texture: WebGLTexture; n: number; size: number };
    private pathMap?: { texture: WebGLTexture; n: number; size: number };
    private coverTex?: { texture: WebGLTexture; size: number };
    /** the cover map last given (CPU side: `coverAt` reads it) */
    coverData: CoverMap | null = null;

    /** Programs come from the layer (async); `useGround` returns false until they are linked. */
    constructor(readonly layer: Layer3D, look: Partial<TerrainLook> = {}) {
        this.gl = layer.gl;
        this.o = merge(TERRAIN_LOOK, look);
        this.link(`terrain-material-${this.id}-ground`, GROUND_VERTEX, GROUND_FRAGMENT).then(p => this.groundProgram = p);
        this.link(`terrain-material-${this.id}-noise`, NOISE_VERTEX, NOISE_FRAGMENT).then(p => { this.bake(p); this.layer.deleteProgram(p.name); });
    }

    private noise?: WebGLTexture;

    get look(): Readonly<TerrainLook> { return this.o; }

    /** Merge settings (nested objects merge too). Nothing to rebuild: all uniforms. */
    set(look: Partial<TerrainLook>) { this.o = merge(this.o, look); }

    /** Biome grid for the painted borders (null: off, borders follow the mesh). */
    biomes(map: BiomeMap | null) {
        const gl = this.gl;
        if (this.map) gl.deleteTexture(this.map.texture);
        this.map = undefined;
        if (!map) return;
        const texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, map.n, map.n, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, map.biome);
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
        for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
        gl.activeTexture(gl.TEXTURE0);
        this.map = { texture, n: map.n, size: map.size };
    }

    /**
     * Ways painted onto the ground (dirt lanes, gravel, paths): an `n`² RG8 grid over `size` metres centred on the
     * origin, R = cover (0..255, drawn where over half), G = surface (0 dirt .. 255 gravel). null: none.
     */
    paths(map: { data: Uint8Array; n: number; size: number } | null) {
        const gl = this.gl;
        if (this.pathMap) gl.deleteTexture(this.pathMap.texture);
        this.pathMap = undefined;
        if (!map) return;
        const texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, map.n, map.n, 0, gl.RG, gl.UNSIGNED_BYTE, map.data);
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
        for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
        gl.activeTexture(gl.TEXTURE0);
        this.pathMap = { texture, n: map.n, size: map.size };
    }

    /** Control map (grass density, dry, height, flowers), see `CoverMap`. The ground turns grassy where R is. null: none. */
    cover(map: CoverMap | null) {
        const gl = this.gl;
        if (this.coverTex) gl.deleteTexture(this.coverTex.texture);
        this.coverTex = undefined;
        this.coverData = map;
        if (!map) return;
        const texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE10);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, map.n, map.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, map.data);
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
        for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
        gl.activeTexture(gl.TEXTURE0);
        this.coverTex = { texture, size: map.size };
    }

    /**
     * The ground's colour seen from straight above, unlit (`n`² texels over `size` metres): grass tufts take their colour
     * from it, so they always match the ground. `draw(view)` draws the ground geometry (after `useGround(view, ...)`, which
     * this calls). Null while the programs still link. Pass the last result as `into` to reuse its texture.
     */
    bakeAlbedo(size: number, n: number, draw: (view: View) => void, light: Light, into?: Albedo | null): Albedo | null {
        const gl = this.gl, h = size / 2, Y = 1e4;
        // straight down: clip x = x / h, clip y = -z / h (so faces still face the viewer), depth from y
        const view: View = {
            viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            projectionMatrix: [1 / h, 0, 0, 0, 0, 0, -1 / Y, 0, 0, -1 / h, 0, 0, 0, 0, 0, 1],
            worldPosition: { x: 0, y: Y, z: 0 },
        };
        const debug = this.o.debug;
        this.o.debug = "albedo";
        const ok = this.useGround(view, light);
        this.o.debug = debug;
        if (!ok) return null;
        const texture = into?.texture ?? gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE11);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
        for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
        gl.activeTexture(gl.TEXTURE0);
        const target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null, vp = gl.getParameter(gl.VIEWPORT) as Int32Array;
        const clear = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;
        const fbo = gl.createFramebuffer()!, depth = gl.createRenderbuffer()!;
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, n, n);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
        gl.viewport(0, 0, n, n);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        draw(view);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(vp[0], vp[1], vp[2], vp[3]);
        gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
        gl.deleteFramebuffer(fbo);
        gl.deleteRenderbuffer(depth);
        return { texture, size };
    }

    /**
     * Draw any mesh as this ground (after `useGround`): e.g. a level model's earth, painted and grassed by the cover map,
     * no copy of it needed. `mesh` is a `@papit/game-mesh` `GPUMesh` (position 0, normal 1; its other attributes are
     * ignored), `matrix` model to world (column major), `biome` the palette index it shows.
     */
    drawPart(mesh: { vao: WebGLVertexArrayObject; draw(): void }, matrix: ArrayLike<number>, biome = BIOMES.indexOf("grassland")) {
        const gl = this.gl, p = this.groundProgram;
        if (!p) return;
        gl.uniformMatrix4fv(p.u("model"), false, Float32Array.from(matrix));
        gl.bindVertexArray(mesh.vao);
        // the mesh's own colour / uv / joints sit where the ground wants data, flow, surface: constants for this draw
        const on = [2, 3, 4].map(l => gl.getVertexAttrib(l, gl.VERTEX_ATTRIB_ARRAY_ENABLED) as boolean);
        [2, 3, 4].forEach(l => gl.disableVertexAttribArray(l));
        gl.vertexAttrib4f(2, biome, 0, .5, .5);
        gl.vertexAttrib1f(3, 0);
        gl.vertexAttrib1f(4, -1e5);
        mesh.draw();
        gl.bindVertexArray(mesh.vao);
        on.forEach((e, i) => e && gl.enableVertexAttribArray(2 + i));
        gl.bindVertexArray(null);
        gl.uniformMatrix4fv(p.u("model"), false, IDENTITY);
    }

    /** How far chunk walls (flow -2 vertices) hang down, metres, for the next ground draws. Call after `useGround`. */
    wallDrop(metres: number) {
        const p = this.groundProgram;
        if (p) this.gl.uniform1f(p.u("wallDrop"), metres);
    }

    /** Bind the ground program. `water` adds the underwater tint and fog. */
    useGround(view: View, light: Light, water?: Underwater): boolean {
        const gl = this.gl, o = this.o, p = this.groundProgram;
        if (!p || !this.noise) return false;
        const u = p.u;
        gl.useProgram(p.program);
        this.common(p, view, light);
        gl.uniform1f(u("wallDrop"), 0);
        gl.uniformMatrix4fv(u("model"), false, IDENTITY);
        gl.uniform3fv(u("palette"), BIOMES.flatMap(b => linear(o.colors[b])));
        gl.uniform3fv(u("rockColor"), linear(o.rock.color));
        gl.uniform2f(u("rock"), o.rock.slope, o.rock.softness);
        gl.uniform3fv(u("snowColor"), linear(o.snow.color));
        gl.uniform3f(u("snow"), o.snow.height, o.snow.softness, o.snow.slope);
        gl.uniform1f(u("variation"), o.variation);
        gl.uniform3f(u("paint"), this.map ? o.paint.edge : 0, Math.max(1, o.paint.size), o.paint.washes);
        gl.uniform3f(u("wash"), o.paint.rim, o.paint.warmth, o.paint.grain);
        gl.uniform1f(u("pixel"), o.paint.pixel);
        gl.uniform2f(u("grid"), this.map?.n ?? 0, this.map?.size ?? 1);
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, this.map?.texture ?? null);
        gl.activeTexture(gl.TEXTURE0);
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_2D, this.noise ?? null);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(u("noiseMap"), 8);
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, this.pathMap?.texture ?? null);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(u("pathMap"), 9);
        gl.uniform1f(u("pathSize"), this.pathMap ? this.pathMap.size : 0);
        gl.uniform3fv(u("dirtColor"), linear(o.paths.dirt));
        gl.uniform3fv(u("gravelColor"), linear(o.paths.gravel));
        gl.uniform1i(u("biomeMap"), 5);
        gl.activeTexture(gl.TEXTURE10);
        gl.bindTexture(gl.TEXTURE_2D, this.coverTex?.texture ?? null);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(u("coverMap"), 10);
        gl.uniform1f(u("coverSize"), this.coverTex?.size ?? 0);
        const g = o.grass, pa = [g.patches[0], g.patches[1]];
        gl.uniform3fv(u("grassColor"), linear(g.color));
        gl.uniform3fv(u("grassDry"), linear(g.dry));
        gl.uniform3fv(u("grassPatchColor"), [...linear(pa[0]?.color ?? g.color), ...linear(pa[1]?.color ?? g.color)]);
        gl.uniform3fv(u("grassPatch"), [pa[0]?.scale ?? 0, pa[0]?.threshold ?? 2, pa[0]?.softness ?? 0, pa[1]?.scale ?? 0, pa[1]?.threshold ?? 2, pa[1]?.softness ?? 0]);
        gl.uniform4f(u("grassLook"), g.blend, g.darken, g.edge, 0);
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
        this.paths(null);
        this.cover(null);
        if (this.noise) this.gl.deleteTexture(this.noise);
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
        bindFog(gl, u, light);
        bindShadows(gl, u, light.shadow);
        gl.uniform1f(u("bands"), o.bands);
        gl.uniform1f(u("wrap"), o.lighting.wrap);
        gl.uniform1f(u("steepness"), o.lighting.steepness);
    }

    /** render the fbm once into an R8 texture (mirrored repeat: no seams) */
    private bake(p: Program) {
        const gl = this.gl, texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE8);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, NOISE_SIZE, NOISE_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, null);
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
        for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.MIRRORED_REPEAT);
        gl.activeTexture(gl.TEXTURE0);
        const target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null, view = gl.getParameter(gl.VIEWPORT) as Int32Array;
        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.viewport(0, 0, NOISE_SIZE, NOISE_SIZE);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(p.program);
        gl.bindVertexArray(null);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(view[0], view[1], view[2], view[3]);
        gl.deleteFramebuffer(fbo);
        this.noise = texture;
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
