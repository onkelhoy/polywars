import type { Layer3D } from "@papit/game-engine";
import { Matrix4 } from "@papit/matrix";
import { TUFT, chunkCount, densityShare, pack, place, plantChunk, type ChunkTufts, type Placed } from "./place";
import { GrassMaterial } from "@polywar/grass-material";
import { decode, encode, isCode } from "./code";
import { DEFAULTS, look, resolve, type Resolved } from "./presets";
import type { GrassOptions, GrassSettings, Light, Planting, Pusher, Quality, View } from "./types";

type Geometry = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number; indexed?: number };

/**
 * GPU grass. Plant an area, then `draw` each frame. On a terrain, `ground(albedo)` gives the tufts the ground's colour.
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
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };
    /** tufts drawn last frame */
    drawn = 0;
    /** window planting: chunks kept by key, the keys in the buffer now, the last followed point */
    private cache = new Map<string, ChunkTufts>();
    private shown = "";
    private center?: [number, number];
    private windowDensity?: number;

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
        if (this.planting && (q.density !== b.density || q.distance !== b.distance || q.maxTufts !== b.maxTufts || q.falloff !== b.falloff || q.lod !== b.lod || this.o.chunk !== before.chunk || this.o.sizeJitter !== before.sizeJitter)) this.plant(this.planting);
    }

    /** Grow grass over an area. Replaces what was planted. With a `window` nothing grows until `follow`. */
    plant(planting: Planting) {
        this.planting = planting;
        this.cache.clear();
        this.shown = "";
        this.windowDensity = undefined;
        if (planting.window)
        {
            this.placed = undefined;
            if (this.center) this.follow(...this.center);
            return;
        }
        this.upload(place(planting, this.o.q.density, this.o.chunk, this.o.q.maxTufts, this.o.sizeJitter));
    }

    /**
     * Window planting: keep the chunks within `window` metres of x / z planted (call it each frame with the camera;
     * it only works when the chunk set changes). Chunks come out the same every time (seeded per chunk).
     * At most `budget` new chunks are planted per call; the old set stays drawn until the window is complete, then one upload.
     */
    follow(x: number, z: number, budget = 3) {
        this.center = [x, z];
        const pl = this.planting;
        if (!pl?.window) return;
        const chunk = this.o.chunk, r = pl.window, [cx, cz] = chunkCount(pl, chunk);
        const i0 = Math.max(0, Math.floor((x - r - pl.area.x) / chunk)), i1 = Math.min(cx - 1, Math.floor((x + r - pl.area.x) / chunk));
        const j0 = Math.max(0, Math.floor((z - r - pl.area.z) / chunk)), j1 = Math.min(cz - 1, Math.floor((z + r - pl.area.z) / chunk));
        const key = `${i0},${i1},${j0},${j1}`;
        if (key === this.shown) return;
        this.shown = key;
        // round window: skip corner chunks wholly outside
        const inside: [number, number][] = [];
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        {
            const dx = Math.max(0, Math.abs(pl.area.x + (i + .5) * chunk - x) - chunk / 2), dz = Math.max(0, Math.abs(pl.area.z + (j + .5) * chunk - z) - chunk / 2);
            if (dx * dx + dz * dz <= r * r) inside.push([i, j]);
        }
        // with a falloff each chunk is planted at its share (stepped in 1/8ths so moving rarely replants); the
        // density is lowered so a full window (the chunks really kept) stays under the cap
        const q = this.o.q, falloff = q.falloff ?? 0;
        const shareOf = ([i, j]: [number, number]) => {
            if (!falloff) return 1;
            const d = Math.max(0, Math.hypot(pl.area.x + (i + .5) * chunk - x, pl.area.z + (j + .5) * chunk - z) - chunk * Math.SQRT1_2);
            return Math.max(1 / 64, Math.ceil(densityShare(d, q.distance, q.lod, falloff) * 8) / 8);
        };
        const shares = inside.map(shareOf);
        // one density per planting (from the first full window), so chunks never replant with a new layout
        this.windowDensity ??= Math.min(q.density, q.maxTufts / Math.max(1, shares.reduce((a, sh) => a + sh * chunk * chunk, 0)));
        const density = this.windowDensity;
        const keep: ChunkTufts[] = [], wanted = new Set<string>();
        let missing = false;
        inside.forEach(([i, j], n) =>
        {
            // planted once at full density (shuffled, same every time): a share is a prefix, so moving only adds / drops tufts
            const share = shares[n], k = `${i}:${j}`;
            wanted.add(k);
            // the cache keeps a prefix (`share` of the full count); a closer chunk replants (same tufts) and keeps more
            let c = this.cache.get(k);
            if ((!c || (c.share ?? 1) < share) && budget > 0)
            {
                const full = plantChunk(pl, density, chunk, i, j, this.o.sizeJitter), count = Math.ceil(full.count * share);
                this.cache.set(k, c = { i, j, share, count, data: full.data.slice(0, count * TUFT), total: full.count } as ChunkTufts);
                budget--;
            }
            if (!c) { missing = true; return; }
            if ((c.share ?? 1) < share) missing = true;
            const total = (c as ChunkTufts & { total: number }).total, count = Math.min(c.count, Math.ceil(total * share));
            keep.push({ i, j, count, share: count / Math.max(1, total), data: count === c.count ? c.data : c.data.slice(0, count * TUFT) });
        });
        // not done: try again next call (the old window stays drawn)
        if (missing) { this.shown = ""; return; }
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

    /**
     * No grass in a circle any more (a blast mark, dug ground): tufts there vanish now and are never planted again
     * (kept in `planting.holes`).
     */
    clear(x: number, z: number, radius: number) {
        const pl = this.planting;
        if (!pl) return;
        (pl.holes ??= []).push([x, z, radius]);
        const r2 = radius * radius, hide = (data: ArrayLike<number> & { [i: number]: number }, count: number) => {
            let hit = false;
            for (let k = 0; k < count; k++)
            {
                const o = k * TUFT;
                if ((data[o] - x) ** 2 + (data[o + 2] - z) ** 2 < r2 && data[o + 3]) { data[o + 3] = 0; data[o + 4] = 0; hit = true; }
            }
            return hit;
        };
        for (const c of this.cache.values()) hide(c.data as number[], c.count);
        const placed = this.placed;
        if (placed && hide(placed.data, placed.count))
        {
            const gl = this.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, placed.data);
        }
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
            const n = Math.ceil(c.count * Math.min(1, densityShare(d, q.distance, q.lod, q.falloff) / c.share));
            gl.vertexAttribPointer(4, 4, gl.FLOAT, false, TUFT * 4, c.offset * TUFT * 4);
            gl.vertexAttribPointer(5, 4, gl.FLOAT, false, TUFT * 4, c.offset * TUFT * 4 + 16);
            if (geo.indexed !== undefined) gl.drawElementsInstanced(gl.TRIANGLES, geo.count, geo.indexed, 0, n);
            else gl.drawArraysInstanced(gl.TRIANGLES, 0, geo.count, n);
            this.drawn += n;
        }
        gl.bindVertexArray(null);
        if (cull) gl.enable(gl.CULL_FACE);
    }

    /**
     * Tufts take the colour of the ground under them: `albedo` from `@polywar/terrain-material` `bakeAlbedo` (the terrain's
     * cover map makes that ground grassy). `strength` 0..1, `lift` brightens. null: the grass's own colours.
     */
    ground(albedo: { texture: WebGLTexture; size: number } | null, strength = 1, lift = 1.25) {
        this.material.ground(albedo, strength, lift);
    }

    destroy() {
        const gl = this.gl;
        for (const g of [this.geometry]) if (g) { gl.deleteVertexArray(g.vao); g.buffers.forEach(b => gl.deleteBuffer(b)); }
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
