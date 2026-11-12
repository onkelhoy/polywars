import type { Layer3D } from "@papit/game-engine";
import { Matrix4 } from "@papit/matrix";
import { TerrainMaterial, type Biome, type Light, type TerrainLook, type View } from "@polywar/terrain-material";
import { decode, encode, isCode } from "./code";
import { Cancelled } from "./pace";
import { Generator } from "./generate";
import { Ground } from "./lod";
import { BIOME, free, skirt, waterMesh, type Mesh } from "./mesh";
import { DEFAULTS, meshError, resolve, type Resolved } from "./presets";
import { biomeAt, heightAt, slopeAt, waterAt } from "./query";
import type { Progress, TerrainData, TerrainOptions, TerrainSettings } from "./types";

/**
 * A generated low poly map: noise shape, droplet erosion, sea and lakes, climate, biomes and town spots,
 * drawn with `@polywar/terrain-material`. Same seed and settings give the same map.
 *
 * `set` regenerates only the stages a change touches (colours redraw at once, biome thresholds reclassify,
 * erosion settings re-erode ...). Generation runs in slices so the page stays responsive; `ready` resolves with the data.
 */
export class Terrain {
    private o: Resolved;
    readonly material: TerrainMaterial;
    readonly gl: WebGL2RenderingContext;
    private generator = new Generator();
    private ground?: Ground;
    private skirtMesh?: Mesh;
    private ocean: Mesh | null = null;
    private lakes: Mesh | null = null;
    private meshKey = "";
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };
    /** the current map, undefined until the first generation is done */
    data?: TerrainData;
    /** resolves with the data once the latest change is generated */
    ready: Promise<TerrainData>;
    progress: Progress = { stage: "", done: 0 };
    generating = false;
    /** chunks drawn last frame */
    drawn = 0;
    /** ground triangles drawn last frame, and what the full grid would have */
    triangles = { used: 0, full: 0 };
    /** called after each finished generation */
    onchange?: (data: TerrainData, terrain: Terrain) => void;
    /** called while generating */
    onprogress?: (progress: Progress, terrain: Terrain) => void;

    constructor(readonly layer: Layer3D, options: Partial<TerrainOptions> = {}) {
        this.gl = layer.gl;
        this.o = resolve(options);
        this.material = new TerrainMaterial(layer, this.look());
        this.ready = this.regenerate();
    }

    get options(): Readonly<Resolved> { return this.o; }

    /** bounds x y z, base at y 0, centred on x / z (`Drawable` for previews) */
    get size(): [number, number, number] { return [this.o.size, this.o.height, this.o.size]; }

    get seed() { return this.o.seed; }
    set seed(seed: number) { this.set({ seed }); }

    /** Current settings as plain JSON: `new Terrain(layer, settings)` or `terrain.load(settings)` brings the same map back. */
    toJSON(): TerrainSettings {
        const { q: _q, ...rest } = this.o;
        return structuredClone(rest);
    }

    /** Share code of the settings (only what differs from the defaults). */
    get code(): string { return encode(this.toJSON(), DEFAULTS); }

    /** Replace all settings (missing fields fall back to the defaults). Takes settings, JSON text or a share code. */
    load(settings: Partial<TerrainSettings> | string) {
        const data: Partial<TerrainSettings> = typeof settings !== "string" ? settings : isCode(settings) ? decode(settings, DEFAULTS) : JSON.parse(settings);
        return this.set({ ...DEFAULTS, ...data });
    }

    /** Merge options; redoes only what the change needs. Returns `ready`. */
    set(options: Partial<TerrainOptions>) {
        const { q: _q, ...before } = this.o;
        this.o = resolve({ ...before, ...options });
        this.material.set(this.look());
        if (this.generator.dirty(this.o)) this.ready = this.regenerate();
        else if (this.data && this.meshKey !== this.meshOptions()) this.build(this.data);
        return this.ready;
    }

    /** new random seed */
    reseed() { return this.set({ seed: Math.floor(Math.random() * 2 ** 31) }); }

    // ---- queries (world metres) ----
    heightAt(x: number, z: number) { return this.data ? heightAt(this.data, x, z) : 0; }
    biomeAt(x: number, z: number): Biome | null { return this.data ? biomeAt(this.data, x, z) : null; }
    slopeAt(x: number, z: number) { return this.data ? slopeAt(this.data, x, z) : 0; }
    waterAt(x: number, z: number) { return this.data ? waterAt(this.data, x, z) : null; }
    get cities() { return this.data?.cities ?? []; }

    draw(view: View, light: Light, time = 0) {
        const gl = this.gl, m = this.material;
        if (!this.data) return;
        const cull = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        this.drawn = 0;
        if (m.useGround(view, light))
        {
            this.f32.view.set(view.viewMatrix);
            this.f32.projection.set(view.projectionMatrix);
            const planes = frustum(this.f32.projection, this.f32.view);
            const eye = view.worldPosition ?? { x: 0, y: 0, z: 0 };
            this.drawn = this.ground?.draw(eye, (x, y, z, r) => visible(planes, x, y, z, r), m => this.mesh(m)) ?? 0;
            this.triangles.used = this.ground?.triangles ?? 0;
            if (this.skirtMesh) this.mesh(this.skirtMesh);
        }
        for (const [w, lake] of [[this.lakes, true], [this.ocean, false]] as const)
        {
            if (!w || !m.useWater(view, light, time, lake)) continue;
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            this.mesh(w);
            gl.depthMask(true);
            gl.disable(gl.BLEND);
        }
        if (cull) gl.enable(gl.CULL_FACE);
    }

    destroy() {
        this.clear();
        this.material.destroy();
        this.data = undefined;
    }

    // ---- internals ----

    /** material settings: sea level, height range and snow line follow the map, `look` overrides */
    private look(): Partial<TerrainLook> {
        const o = this.o, l = o.look;
        return {
            ...l,
            sea: { ...this.material?.look.sea, ...l.sea, level: o.sea * o.height },
            range: l.range ?? [0, o.height],
            snow: { color: "#f2f4f7", height: o.height * .82, softness: o.height * .05, slope: .6, ...l.snow },
        };
    }

    private meshOptions() { return JSON.stringify([this.o.mesh, this.o.lod, this.o.edge.type, this.o.edge.level]); }

    private async regenerate(): Promise<TerrainData> {
        this.generating = true;
        try
        {
            const data = await this.generator.generate(this.o, (stage, done) => { this.progress = { stage, done }; this.onprogress?.(this.progress, this); });
            this.data = data;
            this.build(data);
            this.generating = false;
            this.onchange?.(data, this);
            return data;
        }
        catch (e)
        {
            // a newer change took over: hand back its result
            if (e instanceof Cancelled) return this.ready;
            this.generating = false;
            throw e;
        }
    }

    private build(d: TerrainData) {
        const gl = this.gl, o = this.o;
        this.clear();
        this.ground = new Ground(gl, d, meshError(o.mesh.adaptive), o.mesh.edges, o.mesh.chunk, o.lod);
        this.triangles = { used: 0, full: this.ground.full };
        const step = Math.max(1, Math.round((d.n - 1) / 256));
        const edge = o.edge.type;
        if (edge !== "none" && o.mesh.skirt > 0)
            this.skirtMesh = skirt(gl, d, edge === "ocean" ? -.12 * o.height : o.edge.level * o.height, o.mesh.skirt, BIOME(edge === "ocean" ? "ocean" : "grassland"));
        this.ocean = waterMesh(gl, d, 1, step * 2, edge === "ocean" ? o.mesh.skirt : 0);
        this.lakes = waterMesh(gl, d, 2, step);
        this.meshKey = this.meshOptions();
    }

    private clear() {
        const gl = this.gl;
        this.ground?.destroy();
        free(gl, [...[this.skirtMesh, this.ocean, this.lakes].filter((m): m is Mesh => !!m)]);
        this.ground = undefined; this.skirtMesh = undefined; this.ocean = this.lakes = null;
    }

    private mesh(m: Mesh) {
        const gl = this.gl;
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }
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
