import type { Layer3D } from "@papit/game-engine";
import { Ecosystem, DEFAULTS as ECOSYSTEM, decode as decodeEco, isCode as isEcoCode, type EcosystemSettings } from "@polywar/ecosystem";
import { DEFAULTS as GRASS_DEFAULTS, Grass, type GrassOptions } from "@polywar/grass";
import { modelUrl, type NatureList } from "@polywar/nature";
import type { Light, Renderer, View } from "@polywar/renderer";
import { Scatter } from "@polywar/scatter";
import { DEFAULTS as TERRAIN, Terrain, decode, isCode, type TerrainData, type TerrainSettings } from "@polywar/terrain";
import { BIOMES } from "@polywar/terrain-material";
import { upload } from "@papit/game-mesh";
import { roadEdge, roadHooks, type RoadHooks } from "@polywar/roads";
import { generateSites } from "@polywar/sites";

/** debug road lines per class (unlit, bright) */
const ROAD_COLOUR: Record<string, [number, number, number]> = { highway: [1, .75, 0], road: [1, 1, 1], lane: [1, .45, .1], path: [1, .2, .8], rail: [0, .9, 1] };
import type { WorldSettings, WorldView } from "./types";

/** grass draw distance per quality, metres (further than the grass presets) */
const DISTANCE = { low: 34, medium: 60, high: 90 };
/** grass planting window per quality, metres (a bit past the draw distance) */
const WINDOW = { low: 42, medium: 70, high: 100 };
/** tuft cap per quality: the window is big, so more than the grass presets */
const MAX_TUFTS = { low: 50_000, medium: 220_000, high: 450_000 };

/** the world's grass look (owner's code `g2.eyJ…`): bigger, fuller; density still follows the cover maps */
export const GRASS: Partial<GrassOptions> = {
    settings: { density: 32, sizeScale: 2.6, softBands: .25 },
    look: { bands: 3 },
    bladeShare: .25,
    variation: .16,
    patches: GRASS_DEFAULTS.patches.map((p, i) => i === 0 ? { ...p, scale: .023 } : p),
};

/**
 * A whole world: terrain (with water), ecosystem (props + grass cover), drawn with `@polywar/scatter` and `@polywar/grass`.
 * One share code: `<terrain code>~<ecosystem code>`, e.g. `t1~e1` for the defaults.
 * Terrain changes regrow the nature; nature changes keep the terrain.
 */
export class World {
    readonly terrain: Terrain;
    readonly ecosystem: Ecosystem;
    readonly grass: Grass;
    readonly scatter: Scatter;
    private v: WorldView;
    private data?: TerrainData;
    /** sites + roads, built inside the terrain pipeline (before erosion) */
    readonly roads: RoadHooks;
    private roadMesh?: ReturnType<typeof upload>;
    /** after the nature is grown (terrain or ecosystem change) */
    onchange?: (world: World) => void;

    constructor(readonly layer: Layer3D, readonly renderer: Renderer, readonly nature: NatureList, settings: Partial<WorldSettings> | string = {}, view: Partial<WorldView> = {}) {
        this.v = { quality: "medium", grass: true, props: true, roads: true, style: "pixel", ...view };
        const s = typeof settings === "string" ? World.parse(settings) : settings;
        this.ecosystem = new Ecosystem(nature, s.ecosystem ?? {});
        this.scatter = new Scatter(renderer, (name, lod) => modelUrl(nature, name, lod), { quality: this.v.quality });
        this.grass = new Grass(layer, this.grassOptions());
        this.ecosystem.onchange = () => this.planted();
        this.roads = roadHooks(raw => generateSites(raw, raw.cities, s.sites ?? {}), s.roads ?? {}, JSON.stringify(s.sites ?? {}));
        this.terrain = new Terrain(layer, s.terrain ?? {}, this.roads);
        this.terrain.onchange = data => this.grow(data);
    }

    /** `t1~e1` style code (or JSON text) to settings */
    static parse(text: string): Partial<WorldSettings> {
        const t = text.trim();
        if (t.startsWith("{")) return JSON.parse(t);
        const [terrain, ecosystem] = t.split("~");
        if (terrain && !isCode(terrain)) throw new Error(`not a world code: "${t}"`);
        if (ecosystem && !isEcoCode(ecosystem)) throw new Error(`not an ecosystem code: "${ecosystem}"`);
        return {
            terrain: terrain ? decode<TerrainSettings>(terrain, TERRAIN) : {},
            ecosystem: ecosystem ? decodeEco<EcosystemSettings>(ecosystem, ECOSYSTEM) : {},
        };
    }

    get view(): Readonly<WorldView> { return this.v; }
    /** what gets drawn (per player) */
    setView(view: Partial<WorldView>) {
        const before = this.v;
        this.v = { ...this.v, ...view };
        if (this.v.quality !== before.quality || this.v.style !== before.style)
        {
            this.scatter.set({ quality: this.v.quality });
            this.grass.set(this.grassOptions());
            this.plantGrass();
        }
    }

    get code(): string { return `${this.terrain.code}~${this.ecosystem.code}`; }
    toJSON(): WorldSettings { return { terrain: this.terrain.toJSON(), ecosystem: this.ecosystem.toJSON() }; }

    /** Settings, JSON text or a world code. A missing part goes back to its defaults. */
    load(settings: Partial<WorldSettings> | string) {
        const s = typeof settings === "string" ? World.parse(settings) : settings;
        // nature regrows on the current ground now, and again if the terrain changes
        this.ecosystem.load(s.ecosystem ?? {});
        return this.terrain.load(s.terrain ?? {});
    }

    /** biome under a spot, ground height, ... are the terrain's; `heightAt` is the ground as drawn */
    heightAt(x: number, z: number) { return this.terrain.groundAt(x, z); }

    draw(view: View, light: Light, time: number) {
        const p = this.profiler;
        p?.begin("terrain");
        this.terrain.draw(view, light, time);
        p?.end();
        if (!this.data) return;
        if (this.v.roads && this.roadMesh) this.renderer.draw(this.roadMesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], { unlit: true }, this.renderer.gl.LINES);
        p?.begin("props");
        if (this.v.props) this.scatter.draw(view, time);
        p?.end();
        p?.begin("grass");
        if (this.v.grass)
        {
            const e = view.worldPosition;
            if (e) this.grass.follow(e.x, e.z);
            this.grass.draw(view, light, time);
        }
        p?.end();
    }

    /** Count draw calls / triangles and CPU ms per system (dev): `world.profile(true)`, read `world.stats`. */
    profile(on: boolean) { this.profiler = on ? new Profiler(this.renderer.gl) : undefined; }
    get stats() { return this.profiler?.stats ?? {}; }
    private profiler?: Profiler;

    destroy() {
        this.terrain.destroy();
        this.scatter.destroy();
        this.grass.destroy();
    }

    // ---- internals ----

    private grassOptions(): Partial<GrassOptions> {
        return { ...GRASS, settings: { ...GRASS.settings, maxTufts: MAX_TUFTS[this.v.quality], distance: DISTANCE[this.v.quality] }, quality: this.v.quality, style: this.v.style };
    }

    private grow(data: TerrainData) {
        this.data = data;
        const look = this.terrain.material.look;
        this.buildRoads();
        const road = this.roads.roads ? roadEdge(this.roads.roads) : undefined;
        this.ecosystem.grow({ ...data, biomes: BIOMES, rockSlope: look.rock.slope, snowHeight: look.snow.height, groundAt: (x, z) => this.terrain.groundAt(x, z), road });
    }

    /** debug: road centre lines (no road geometry), a bit over the drawn ground, coloured by class */
    private buildRoads() {
        this.roadMesh = undefined;
        const r = this.roads.roads;
        if (!r) return;
        const pos: number[] = [], col: number[] = [];
        const at = (p: number[]) => [p[0], Math.max(p[1], this.terrain.groundAt(p[0], p[2])) + .4, p[2]];
        for (const road of r.network.roads)
        {
            const c = ROAD_COLOUR[road.class] ?? [1, 0, 0];
            for (let i = 0; i < road.points.length - 1; i++) { pos.push(...at(road.points[i]), ...at(road.points[i + 1])); col.push(...c, 1, ...c, 1); }
        }
        const positions = new Float32Array(pos), normals = new Float32Array(pos.length);
        for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
        const h = this.terrain.data?.size ?? 1;
        this.roadMesh = upload(this.layer.gl, { positions, normals, colors: new Float32Array(col), bounds: { min: { x: -h, y: -h, z: -h }, max: { x: h, y: h, z: h }, radius: h * 2 } });
    }

    /** ecosystem grown: hand props to the scatter and replant the grass */
    private planted() {
        this.scatter.place(this.ecosystem.batches);
        this.plantGrass();
        this.onchange?.(this);
    }

    private plantGrass() {
        const d = this.data;
        if (!d) return;
        const out = { density: 0, height: 1, dry: 0, flowers: 0 };
        this.grass.plant({
            area: { x: -d.size / 2, z: -d.size / 2, width: d.size, depth: d.size },
            seed: this.ecosystem.seed,
            height: (x, z) => this.terrain.groundAt(x, z),
            grow: (x, z) => this.ecosystem.grassAt(x, z, out),
            window: WINDOW[this.v.quality],
        });
    }
}

type Stat = { calls: number; triangles: number; ms: number };

/** Wraps the gl draw functions to count calls / triangles per named section (CPU time per section too). */
class Profiler {
    stats: Record<string, Stat> = {};
    private now?: Stat;
    private at = 0;

    constructor(gl: WebGL2RenderingContext) {
        // wrap once per context; a new profiler takes over the wrappers
        const g = gl as any;
        if (g.__profiler) { g.__profiler.at = this; return; }
        const owner = g.__profiler = { at: this as Profiler };
        const wrap = (name: string, n: (a: any[]) => [number, number]) => {
            const orig = g[name].bind(gl);
            g[name] = (...a: any[]) => { owner.at.count(...n(a)); return orig(...a); };
        };
        wrap("drawArrays", a => [a[2], 1]);
        wrap("drawElements", a => [a[1], 1]);
        wrap("drawArraysInstanced", a => [a[2], a[3]]);
        wrap("drawElementsInstanced", a => [a[1], a[4]]);
    }

    count(n: number, instances = 1) { if (this.now) { this.now.calls++; this.now.triangles += n / 3 * instances; } }

    begin(name: string) {
        const s = this.stats[name] ??= { calls: 0, triangles: 0, ms: 0 };
        s.calls = s.triangles = 0;
        this.now = s;
        this.at = performance.now();
    }

    end() {
        if (this.now) this.now.ms = this.now.ms * .9 + (performance.now() - this.at) * .1;
        this.now = undefined;
    }
}
