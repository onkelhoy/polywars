import type { Layer3D } from "@papit/game-engine";
import { Matrix4 } from "@papit/matrix";
import { TUFT, chunkCount, pack, place, plantChunk, type ChunkTufts, type Placed } from "./place";
import { GrassMaterial } from "@polywar/grass-material";
import { decode, encode, isCode } from "./code";
import { DEFAULTS, look, resolve, type Resolved } from "./presets";
import type { GrassOptions, GrassSettings, Light, Planting, Pusher, Quality, View } from "./types";

type Geometry = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number; indexed?: number };

/**
 * GPU grass. Plant an area, then `draw` each frame (and `drawGround` for the matching floor).
 * Everything visual is in `options`; `quality` picks a preset of the costly parts.
 * The look is a `GrassMaterial` (`@polywar/grass-material`); this places, chunks and culls the tufts.
 */
export class Grass {
    private o: Resolved;
    readonly material: GrassMaterial;
    private geometry?: Geometry;
    private instances: WebGLBuffer;
    private planting?: Planting;
    private placed?: Placed;
    private ground?: Geometry;
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };
    /** tufts drawn last frame */
    drawn = 0;
    /** window planting: chunks kept by key, the keys in the buffer now, the last followed point */
    private cache = new Map<string, ChunkTufts>();
    private shown = "";
    private center?: [number, number];

    readonly gl: WebGL2RenderingContext;

    /** Programs come from the layer (async); draws are skipped until they are linked. */
    constructor(readonly layer: Layer3D, options: Partial<GrassOptions> = {}) {
        this.gl = layer.gl;
        this.o = resolve(options);
        this.material = new GrassMaterial(layer, look(this.o));
        this.instances = this.gl.createBuffer()!;
        this.buildGeometry();
    }

    get options(): Readonly<Resolved> { return this.o; }

    /** Current settings as plain JSON data: `new Grass(gl, settings)` or `grass.load(settings)` brings them back. */
    toJSON(): GrassSettings {
        const { q: _q, s: _s, mesh: _m, sprites, ...rest } = this.o;
        const out: GrassSettings = structuredClone(rest);
        if (sprites?.some(s => typeof s === "string")) out.sprites = sprites.map(s => typeof s === "string" ? s : null);
        return out;
    }

    /** Share code of the current settings (only what differs from the defaults): `grass.load(code)` brings them back. */
    get code(): string { return encode(this.toJSON(), DEFAULTS); }

    /** Replace all settings (missing fields fall back to the defaults). Takes settings, JSON text or a share code. Keeps the mesh unless given. */
    load(settings: Partial<GrassSettings> | string) {
        const data: Partial<GrassSettings> = typeof settings !== "string" ? settings : isCode(settings) ? decode(settings, DEFAULTS as GrassSettings) : JSON.parse(settings);
        this.set({ ...DEFAULTS, mesh: this.o.mesh, ...data });
    }
    /** tufts planted */
    get count() { return this.placed?.count ?? 0; }
    /** true when `maxTufts` thinned the planting; `density` is what was used */
    get capped() { return this.placed?.capped ?? false; }
    get density() { return this.placed?.density ?? this.o.q.density; }

    get quality() { return this.o.quality; }
    set quality(quality: Quality) { this.set({ quality }); }

    /** Merge options. Rebuilds only what the change needs (shader, geometry, textures, planting). */
    set(options: Partial<GrassOptions>) {
        const before = this.o;
        this.o = resolve({ ...stripResolved(before), ...options });
        const q = this.o.q, b = before.q;
        this.material.set(look(this.o));
        if (q.source !== b.source || q.planes !== b.planes || this.o.mesh !== before.mesh) this.buildGeometry();
        if (this.planting && (q.density !== b.density || q.distance !== b.distance || q.maxTufts !== b.maxTufts || this.o.chunk !== before.chunk || this.o.sizeJitter !== before.sizeJitter)) this.plant(this.planting);
    }

    /** Grow grass over an area. Replaces what was planted. With a `window` nothing grows until `follow`. */
    plant(planting: Planting) {
        this.planting = planting;
        this.cache.clear();
        this.shown = "";
        if (planting.window)
        {
            this.placed = undefined;
            if (this.center) this.follow(...this.center);
            return;
        }
        this.upload(place(planting, this.o.q.density, this.o.chunk, this.o.q.maxTufts, this.o.sizeJitter));
        this.buildGround();
    }

    /**
     * Window planting: keep the chunks within `window` metres of x / z planted (call it each frame with the camera;
     * it only works when the chunk set changes). Chunks come out the same every time (seeded per chunk).
     */
    follow(x: number, z: number) {
        this.center = [x, z];
        const pl = this.planting;
        if (!pl?.window) return;
        const chunk = this.o.chunk, r = pl.window, [cx, cz] = chunkCount(pl, chunk);
        const i0 = Math.max(0, Math.floor((x - r - pl.area.x) / chunk)), i1 = Math.min(cx - 1, Math.floor((x + r - pl.area.x) / chunk));
        const j0 = Math.max(0, Math.floor((z - r - pl.area.z) / chunk)), j1 = Math.min(cz - 1, Math.floor((z + r - pl.area.z) / chunk));
        const key = `${i0},${i1},${j0},${j1}`;
        if (key === this.shown) return;
        this.shown = key;
        // density so a full window stays under the cap
        const side = (i1 - i0 + 1) * chunk, density = Math.min(this.o.q.density, this.o.q.maxTufts / Math.max(1, side * side));
        const keep: ChunkTufts[] = [], wanted = new Set<string>();
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        {
            // round window: skip corner chunks wholly outside
            const dx = Math.max(0, Math.abs(pl.area.x + (i + .5) * chunk - x) - chunk / 2), dz = Math.max(0, Math.abs(pl.area.z + (j + .5) * chunk - z) - chunk / 2);
            if (dx * dx + dz * dz > r * r) continue;
            const k = `${i}:${j}`;
            wanted.add(k);
            let c = this.cache.get(k);
            if (!c) this.cache.set(k, c = plantChunk(pl, density, chunk, i, j, this.o.sizeJitter));
            keep.push(c);
        }
        // forget chunks well outside
        for (const [k, c] of this.cache) if (!wanted.has(k) && Math.hypot(pl.area.x + (c.i + .5) * chunk - x, pl.area.z + (c.j + .5) * chunk - z) > r * 1.5 + chunk) this.cache.delete(k);
        this.upload(pack(pl, chunk, keep, density, density < this.o.q.density));
    }

    private upload(placed: Placed) {
        const gl = this.gl;
        this.placed = placed;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
        gl.bufferData(gl.ARRAY_BUFFER, placed.data, gl.DYNAMIC_DRAW);
    }

    /** Characters that bend grass: x y z radius each. Only the first `pushers` (quality) count. */
    push(pushers: Pusher[]) {
        this.material.push(pushers);
    }

    /** `time` in seconds */
    draw(view: View, light: Light, time: number) {
        const gl = this.gl, o = this.o, q = o.q, placed = this.placed, geo = this.geometry;
        if (!placed || !geo || !this.material.useTufts(view, light, time)) return;
        this.f32.view.set(view.viewMatrix);
        this.f32.projection.set(view.projectionMatrix);

        const cull = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.bindVertexArray(geo.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
        const planes = frustum(this.f32.projection, this.f32.view);
        const eye = view.worldPosition ?? { x: 0, y: 0, z: 0 };
        this.drawn = 0;
        for (const c of placed.chunks)
        {
            const d = Math.max(0, Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) - c.radius);
            if (d > q.distance || !visible(planes, c.x, c.y, c.z, c.radius + o.size[1] * 2)) continue;
            const n = Math.ceil(c.count * (1 - (1 - q.lod) * d / q.distance));
            gl.vertexAttribPointer(4, 4, gl.FLOAT, false, TUFT * 4, c.offset * TUFT * 4);
            gl.vertexAttribPointer(5, 4, gl.FLOAT, false, TUFT * 4, c.offset * TUFT * 4 + 16);
            if (geo.indexed !== undefined) gl.drawElementsInstanced(gl.TRIANGLES, geo.count, geo.indexed, 0, n);
            else gl.drawArraysInstanced(gl.TRIANGLES, 0, geo.count, n);
            this.drawn += n;
        }
        gl.bindVertexArray(null);
        if (cull) gl.enable(gl.CULL_FACE);
    }

    /** The floor under the grass with the same patches, light and clouds. `darken` scales its colour. */
    drawGround(view: View, light: Light, time: number, darken = .8) {
        const gl = this.gl, g = this.ground;
        if (!g || !this.material.useGround(view, light, time, darken)) return;
        gl.enable(gl.DEPTH_TEST);
        gl.bindVertexArray(g.vao);
        gl.drawElements(gl.TRIANGLES, g.count, g.indexed!, 0);
        gl.bindVertexArray(null);
    }

    destroy() {
        const gl = this.gl;
        for (const g of [this.geometry, this.ground]) if (g) { gl.deleteVertexArray(g.vao); g.buffers.forEach(b => gl.deleteBuffer(b)); }
        gl.deleteBuffer(this.instances);
        this.material.destroy();
    }

    // ---- internals ----

    /** One tuft: a quad, crossed quads or the given mesh. Attributes: 0 position, 1 normal, 2 uv, 4 tuft + 5 cover (instanced). */
    private buildGeometry() {
        const gl = this.gl, q = this.o.q;
        let positions: number[] = [], normals: number[] = [], uvs: number[] = [];
        let indices: Uint16Array | Uint32Array | undefined;
        const quad = (angle: number) => {
            const c = Math.cos(angle), s = Math.sin(angle);
            for (const [x, y] of [[-.5, 0], [.5, 0], [.5, 1], [-.5, 0], [.5, 1], [-.5, 1]])
            {
                positions.push(x * c, y, x * s);
                normals.push(0, 1, 0);
                uvs.push(x + .5, y);
            }
        };
        if (q.source === "mesh" && this.o.mesh)
        {
            const m = this.o.mesh;
            let top = 1e-6;
            for (let i = 1; i < m.positions.length; i += 3) top = Math.max(top, m.positions[i]);
            positions = Array.from(m.positions, v => v / top);
            normals = Array.from(m.normals);
            for (let i = 0; i < m.positions.length; i += 3) uvs.push(0, m.positions[i + 1] / top);
            indices = m.indices;
        }
        else if (q.source === "cross") for (let i = 0; i < q.planes; i++) quad(i * Math.PI / q.planes);
        else quad(0);

        if (this.geometry) { gl.deleteVertexArray(this.geometry.vao); this.geometry.buffers.forEach(b => gl.deleteBuffer(b)); }
        const vao = gl.createVertexArray()!, buffers: WebGLBuffer[] = [];
        gl.bindVertexArray(vao);
        const attribute = (location: number, data: number[], size: number) => {
            const b = gl.createBuffer()!;
            buffers.push(b);
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        };
        attribute(0, positions, 3);
        attribute(1, normals, 3);
        attribute(2, uvs, 2);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, TUFT * 4, 0);
        gl.vertexAttribDivisor(4, 1);
        gl.enableVertexAttribArray(5);
        gl.vertexAttribPointer(5, 4, gl.FLOAT, false, TUFT * 4, 16);
        gl.vertexAttribDivisor(5, 1);
        let indexed: number | undefined;
        if (indices)
        {
            const b = gl.createBuffer()!;
            buffers.push(b);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            indexed = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        }
        gl.bindVertexArray(null);
        this.geometry = { vao, buffers, count: indices ? indices.length : positions.length / 3, indexed };
    }

    /** grid over the planted area, following `height`, about 1 m cells */
    private buildGround() {
        const gl = this.gl, pl = this.planting!, a = pl.area;
        const nx = Math.min(256, Math.max(1, Math.ceil(a.width))), nz = Math.min(256, Math.max(1, Math.ceil(a.depth)));
        const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
        for (let j = 0, k = 0; j <= nz; j++) for (let i = 0; i <= nx; i++)
        {
            const x = a.x + a.width * i / nx, z = a.z + a.depth * j / nz;
            positions.set([x, pl.height ? pl.height(x, z) : 0, z], k);
            k += 3;
        }
        const indices = new Uint32Array(nx * nz * 6);
        for (let j = 0, k = 0; j < nz; j++) for (let i = 0; i < nx; i++)
        {
            const v = j * (nx + 1) + i;
            indices.set([v, v + nx + 1, v + 1, v + 1, v + nx + 1, v + nx + 2], k);
            k += 6;
        }
        if (this.ground) { gl.deleteVertexArray(this.ground.vao); this.ground.buffers.forEach(b => gl.deleteBuffer(b)); }
        const vao = gl.createVertexArray()!, pb = gl.createBuffer()!, ib = gl.createBuffer()!;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, pb);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        this.ground = { vao, buffers: [pb, ib], count: indices.length, indexed: gl.UNSIGNED_INT };
    }
}

function stripResolved(o: Resolved): Partial<GrassOptions> {
    const { q: _q, s: _s, ...rest } = o;
    return rest;
}

/** 6 planes (a b c d) of projection * view */
function frustum(p: Float32Array, v: Float32Array) {
    const m = Matrix4.create(p).multiply(Matrix4.create(v));
    const row = (r: number) => Array.from(m.getRow(r));
    const w = row(3), planes: number[][] = [];
    for (let r = 0; r < 3; r++)
    {
        const x = row(r);
        planes.push(w.map((e, i) => e + x[i]), w.map((e, i) => e - x[i]));
    }
    return planes.map(([a, b, c, d]) => { const l = Math.hypot(a, b, c) || 1; return [a / l, b / l, c / l, d / l]; });
}

function visible(planes: number[][], x: number, y: number, z: number, r: number) {
    for (const [a, b, c, d] of planes) if (a * x + b * y + c * z + d < -r) return false;
    return true;
}
