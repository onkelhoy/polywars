import type { Layer3D } from "@papit/game-engine";
import { Ecosystem, DEFAULTS as ECOSYSTEM, decode as decodeEco, isCode as isEcoCode, type EcosystemSettings } from "@polywar/ecosystem";
import { DEFAULTS as GRASS_DEFAULTS, Grass, type GrassOptions } from "@polywar/grass";
import { modelUrl, type NatureList } from "@polywar/nature";
import { Wire, type Instances, type Light, type Renderer, type View, type WireMesh } from "@polywar/renderer";
import { Scatter } from "@polywar/scatter";
import { DEFAULTS as TERRAIN, Terrain, decode, isCode, type TerrainData, type TerrainSettings } from "@polywar/terrain";
import { BIOMES } from "@polywar/terrain-material";
import { upload } from "@papit/game-mesh";
import { roadEdge, roadHooks, type RoadHooks } from "@polywar/roads";
import { generateSites } from "@polywar/sites";
import { hydrologyHooks, type HydrologyHooks } from "@polywar/hydrology";
import type { TerrainHooks } from "@polywar/terrain";

import { SLEEPER_MODEL, track } from "@polywar/rail";
import { PORTAL, bridgeFor, portal } from "@polywar/bridges";
import type { ScatterBatch } from "@polywar/scatter";
import { merge, sweep, type Profile, type Vec3 } from "@polywar/sweep";
import type { Mesh } from "@papit/game-mesh";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const strip = (top: [number, number, number], side: [number, number, number], edge = 1.12): Profile => ({ points: [[-edge, -.3], [-1, 0], [1, 0], [edge, -.3]], colors: [side, top, side] });
/** surface per road class (1940s): concrete slabs on highways, gravel roads, dirt lanes and paths, ballast under rail */
const ROAD_STYLE: Record<string, { profile: Profile; step: number; lift: number; bands?: { every: number; shade: number } }> = {
    highway: { profile: strip([.62, .61, .58], [.42, .4, .36]), step: 4, lift: .15, bands: { every: 6, shade: .08 } },
    road: { profile: strip([.55, .5, .43], [.4, .36, .3]), step: 4, lift: .12 },
    lane: { profile: strip([.47, .38, .28], [.38, .31, .23]), step: 3, lift: .1 },
    path: { profile: strip([.5, .41, .3], [.42, .34, .25], 1.2), step: 2, lift: .08 },
    rail: { profile: strip([.42, .4, .38], [.33, .31, .29], 1.3), step: 4, lift: 0 },
};
import type { WorldSettings, WorldView } from "./types";
/** debug site sphere colour per kind */
const SITE_COLOUR: Record<string, [number, number, number]> = { city: [1, .2, .2], village: [1, .6, .2], farm: [1, 1, .3], peak: [.9, .9, .9], beach: [1, .9, .6], lake: [.3, .6, 1], pass: [.7, .5, 1], viewpoint: [.3, 1, .5] };

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
    /** built things (sleepers, bridges, trail props, ...): asset models by path under `assets/models/` */
    readonly built: Scatter;
    /** batches for `built`, gathered while the world grows */
    private builtBatches: ScatterBatch[] = [];
    /** bridges and tunnel mouths built on the roads (where nature and trail props react) */
    structures: { kind: string; road: number; x: number; y: number; z: number; to: Vec3 }[] = [];
    private v: WorldView;
    private data?: TerrainData;
    /** sites + roads, built inside the terrain pipeline (before erosion) */
    readonly roads: RoadHooks;
    /** lakes, streams and rivers, carved inside the terrain pipeline (before roads) */
    readonly hydrology: HydrologyHooks;
    private roadMesh?: ReturnType<typeof upload>;
    private riverMesh?: ReturnType<typeof upload>;
    private siteMesh?: ReturnType<typeof upload>;
    /** made on first use of `view.wire` */
    private wire?: Wire;
    /** after the nature is grown (terrain or ecosystem change) */
    onchange?: (world: World) => void;

    constructor(readonly layer: Layer3D, readonly renderer: Renderer, readonly nature: NatureList, settings: Partial<WorldSettings> | string = {}, view: Partial<WorldView> = {}) {
        this.v = { quality: "medium", grass: true, props: true, roads: true, rivers: true, sites: false, style: "pixel", wire: "off", ...view };
        const s = typeof settings === "string" ? World.parse(settings) : settings;
        this.ecosystem = new Ecosystem(nature, s.ecosystem ?? {});
        this.scatter = new Scatter(renderer, (name, lod) => modelUrl(nature, name, lod), { quality: this.v.quality });
        const models = nature.base.replace(/[^/]+\/$/, "");
        this.built = new Scatter(renderer, (name, lod) => lod ? undefined : `${models}${name}.glb`, { quality: this.v.quality, lods: [], distance: { sleeper: 120, default: 400 } });
        this.grass = new Grass(layer, this.grassOptions());
        this.ecosystem.onchange = () => this.planted();
        this.roads = roadHooks(raw => generateSites(raw, raw.cities, s.sites ?? {}), s.roads ?? {}, JSON.stringify(s.sites ?? {}));
        this.hydrology = hydrologyHooks(s.hydrology ?? {});
        this.terrain = new Terrain(layer, s.terrain ?? {}, combine(this.hydrology, this.roads));
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
            this.built.set({ quality: this.v.quality });
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
        const p = this.profiler, wire = this.v.wire !== "off" ? this.wire ??= new Wire(this.layer) : undefined, fill = this.v.wire !== "only";
        // wire: collect what gets drawn, lines after each system (they use their own programs)
        const ground: [WireMesh, number][] = [], parts: [WireMesh, ArrayLike<number>, Instances][] = [];
        p?.begin("terrain");
        this.terrain.draw(view, light, time, wire ? { fill, mesh: (m, drop) => ground.push([m, drop]) } : {});
        p?.end();
        if (wire) { for (const [m, wallDrop] of ground) wire.draw(view, m, { wallDrop }); this.renderer.reset(); }
        if (!this.data) return;
        if (this.v.rivers && this.riverMesh) this.renderer.draw(this.riverMesh, IDENTITY);
        if (this.v.roads && this.roadMesh) this.renderer.draw(this.roadMesh, IDENTITY);
        if (this.v.sites && this.siteMesh) this.renderer.draw(this.siteMesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], { unlit: true }, this.renderer.gl.LINES);
        p?.begin("props");
        if (this.v.roads) this.built.draw(view, time);
        if (this.v.props) this.scatter.draw(view, time, wire ? { fill, part: (m, model, instances) => parts.push([m, model, { ...instances }]) } : {});
        p?.end();
        if (wire) { for (const [m, model, instances] of parts) wire.draw(view, m, { model, instances }); this.renderer.reset(); }
        p?.begin("grass");
        if (this.v.grass && fill)
        {
            const e = view.worldPosition;
            // high up nothing is in grass range: don't plant under the camera
            if (e && e.y - this.terrain.groundAt(e.x, e.z) < DISTANCE[this.v.quality]) this.grass.follow(e.x, e.z);
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
        this.built.destroy();
        this.grass.destroy();
        this.wire?.destroy();
    }

    // ---- internals ----

    private grassOptions(): Partial<GrassOptions> {
        return { ...GRASS, settings: { ...GRASS.settings, maxTufts: MAX_TUFTS[this.v.quality], distance: DISTANCE[this.v.quality] }, quality: this.v.quality, style: this.v.style };
    }

    private grow(data: TerrainData) {
        this.data = data;
        const look = this.terrain.material.look;
        this.builtBatches = [];
        this.buildRoads();
        this.buildRivers();
        this.buildSites();
        this.built.place(this.builtBatches);
        const road = this.roads.roads ? roadEdge(this.roads.roads) : undefined;
        this.ecosystem.grow({ ...data, biomes: BIOMES, rockSlope: look.rock.slope, snowHeight: look.snow.height, groundAt: (x, z) => this.terrain.groundAt(x, z), road });
    }

    /** road surfaces: one sweep per ground span (bridges / tunnels are drawn by their own builders), a bit over the drawn ground */
    private buildRoads() {
        this.roadMesh = undefined;
        const r = this.roads.roads;
        if (!r) return;
        const meshes: Mesh[] = [], sleepers: { data: Float32Array; count: number }[] = [], ground = (x: number, z: number) => this.terrain.groundAt(x, z);
        this.structures = [];
        for (const road of r.network.roads)
        {
            const style = ROAD_STYLE[road.class] ?? ROAD_STYLE.road, rail = road.class === "rail";
            const spans = road.spans.length ? road.spans : [{ kind: "ground", from: 0, to: road.points.length - 1 }];
            for (const span of spans)
            {
                if (span.to - span.from < 1) continue;
                const raw = road.points.slice(span.from, span.to + 1).map(p => [p[0], p[1], p[2]] as Vec3);
                if (span.kind === "bridge")
                {
                    const b = bridgeFor(road.class, raw, { width: road.width, ground: ground, use: rail ? "rail" : road.class === "path" ? "path" : "road" });
                    meshes.push(b.mesh);
                    this.structures.push({ kind: `bridge-${b.type}`, road: road.id, x: raw[0][0], y: raw[0][1], z: raw[0][2], to: raw[raw.length - 1] });
                    if (rail) { const t = track(raw); meshes.push(t.lods[0]); sleepers.push(t.sleepers); }
                    continue;
                }
                if (span.kind === "tunnel")
                {
                    const size = PORTAL[rail ? "rail" : road.class === "highway" || road.class === "road" ? "road" : "lane"];
                    for (const [a, b] of [[raw[0], raw[1]], [raw[raw.length - 1], raw[raw.length - 2]]])
                    {
                        meshes.push(portal(a, [b[0] - a[0], b[2] - a[2]], { ...size, width: Math.max(size.width, road.width + 2) }));
                        this.structures.push({ kind: "portal", road: road.id, x: a[0], y: a[1], z: a[2], to: b });
                    }
                    continue;
                }
                const pts = raw.map(([x, y, z]) => [x, Math.max(y, this.terrain.groundAt(x, z)) + style.lift, z] as Vec3);
                if (!rail) { meshes.push(sweep(pts, { width: road.width, profile: style.profile, bank: { max: .04, gain: 4 }, step: style.step, bands: style.bands })); continue; }
                const t = track(pts);
                meshes.push(t.lods[0]);
                sleepers.push(t.sleepers);
            }
        }
        if (meshes.length) this.roadMesh = upload(this.layer.gl, merge(meshes));
        const count = sleepers.reduce((n, s) => n + s.count, 0), data = new Float32Array(count * 8);
        let at = 0;
        for (const s of sleepers) { data.set(s.data.subarray(0, s.count * 8), at); at += s.count * 8; }
        if (count) this.builtBatches.push({ model: SLEEPER_MODEL, kind: "sleeper", data, count });
    }

    /** water ribbons along streams and rivers: flat across (no bank), width per point, at the water surface */
    private buildRivers() {
        this.riverMesh = undefined;
        const meshes: Mesh[] = [];
        for (const s of this.hydrology.network.streams)
        {
            if (s.points.length < 2) continue;
            const t = Math.min(1, (s.order - 1) / 3), c: [number, number, number] = [.25 - .1 * t, .5 - .12 * t, .62 - .05 * t];
            const pts = s.points.map(([x, y, z]) => [x, Math.max(y, this.terrain.groundAt(x, z) - .3) + .08, z] as Vec3);
            meshes.push(sweep(pts, { width: s.points.map(p => Math.max(1, p[3])), profile: { points: [[-1, 0], [1, 0]], color: c }, bank: "flat", step: 3 }));
        }
        if (meshes.length) this.riverMesh = upload(this.layer.gl, merge(meshes));
    }

    /** debug: wire sphere (3 rings + 2 tilted) per site, coloured by kind */
    private buildSites() {
        this.siteMesh = undefined;
        const pos: number[] = [], col: number[] = [], N = 32;
        for (const s of this.roads.sites)
        {
            const c = SITE_COLOUR[s.kind] ?? [1, 1, 1], r = s.radius, y = this.terrain.groundAt(s.x, s.z);
            const ring = (f: (a: number) => number[]) => { for (let i = 0; i < N; i++) { const a = f(i / N * Math.PI * 2), b = f((i + 1) / N * Math.PI * 2); pos.push(s.x + a[0] * r, y + a[1] * r, s.z + a[2] * r, s.x + b[0] * r, y + b[1] * r, s.z + b[2] * r); col.push(...c, 1, ...c, 1); } };
            ring(a => [Math.cos(a), 0, Math.sin(a)]);
            ring(a => [Math.cos(a), Math.sin(a), 0]);
            ring(a => [0, Math.sin(a), Math.cos(a)]);
            for (const h of [.5, -.5]) ring(a => [Math.cos(a) * .866, h, Math.sin(a) * .866]);
        }
        if (!pos.length) return;
        const positions = new Float32Array(pos), normals = new Float32Array(pos.length);
        for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
        const h = this.terrain.data?.size ?? 1;
        this.siteMesh = upload(this.layer.gl, { positions, normals, colors: new Float32Array(col), bounds: { min: { x: -h, y: -h, z: -h }, max: { x: h, y: h, z: h }, radius: h * 2 } });
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

/** `gpu`: GPU ms (timer queries, NaN where the browser has none) */
type Stat = { calls: number; triangles: number; ms: number; gpu: number };

/** Wraps the gl draw functions to count calls / triangles per named section (CPU time and GPU time per section too). */
class Profiler {
    stats: Record<string, Stat> = {};
    private now?: Stat;
    private at = 0;
    private timer: any;
    private queries: { q: WebGLQuery; s: Stat }[] = [];

    constructor(private gl: WebGL2RenderingContext) {
        this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
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
        const s = this.stats[name] ??= { calls: 0, triangles: 0, ms: 0, gpu: this.timer ? 0 : NaN };
        s.calls = s.triangles = 0;
        this.now = s;
        this.at = performance.now();
        if (this.timer)
        {
            const q = this.gl.createQuery()!;
            this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, q);
            this.queries.push({ q, s });
        }
    }

    end() {
        if (this.now) this.now.ms = this.now.ms * .9 + (performance.now() - this.at) * .1;
        this.now = undefined;
        if (this.timer) { this.gl.endQuery(this.timer.TIME_ELAPSED_EXT); this.poll(); }
    }

    /** read finished queries (a few frames late), oldest first */
    private poll() {
        const gl = this.gl, disjoint = gl.getParameter(this.timer.GPU_DISJOINT_EXT);
        while (this.queries.length)
        {
            const { q, s } = this.queries[0];
            if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
            if (!disjoint) s.gpu = s.gpu * .9 + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 * .1;
            gl.deleteQuery(q);
            this.queries.shift();
        }
    }
}

/** several terrain hooks as one, run in order (keys joined) */
function combine(...hooks: TerrainHooks[]): TerrainHooks {
    return {
        get key() { return hooks.map(h => h.key ?? "").join("|"); },
        features: async raw => {
            let hard: Float32Array | undefined;
            for (const h of hooks)
            {
                const f = await h.features?.(raw);
                if (f && f.hard) { if (!hard) hard = f.hard; else for (let i = 0; i < hard.length; i++) hard[i] = Math.max(hard[i], f.hard[i]); }
            }
            return hard ? { hard } : undefined;
        },
        fix: async data => { for (const h of hooks) await h.fix?.(data); },
    };
}
