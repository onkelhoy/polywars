import type { Layer3D } from "@papit/game-engine";
import { Ecosystem, DEFAULTS as ECOSYSTEM, decode as decodeEco, isCode as isEcoCode, type EcosystemSettings } from "@polywar/ecosystem";
import { DEFAULTS as GRASS_DEFAULTS, Grass, type GrassOptions } from "@polywar/grass";
import { modelUrl, type NatureList } from "@polywar/nature-assets";
import { Wire, type Instances, type Light, type Renderer, type View, type WireMesh } from "@polywar/renderer";
import { Scatter, frustum, visible } from "@polywar/scatter";
import { DEFAULTS as TERRAIN, Terrain, decode, isCode, type TerrainData, type TerrainSettings } from "@polywar/terrain";
import { BIOMES, coverMap } from "@polywar/terrain-material";
import { upload } from "@papit/game-mesh";
import { roadEdge, roadHooks, type RoadHooks } from "@polywar/ways";
import { generateSites } from "@polywar/sites";
import { cropRows, fencePosts, generateFarm, groundEdits, zoneAt, type FarmLayout } from "@polywar/farm";
import { hydrologyHooks, type HydrologyHooks } from "@polywar/hydrology";
import type { TerrainHooks } from "@polywar/terrain";

import { SLEEPER_MODEL } from "@polywar/rail";
import { buildWays, groundPaint, tiles } from "@polywar/ways";
import { fence } from "@polywar/bridges";
import { Placements } from "@polywar/placements";
import { furnish } from "@polywar/ways";
import type { ScatterBatch } from "@polywar/scatter";
import { merge, type Vec3 } from "@polywar/sweep";
import type { Mesh } from "@papit/game-mesh";

/** ways / fences cut into tiles of this many metres (culled, lod picked per tile) */
const TILE = 192;
/** tiles further than this (metres, eye to tile edge) draw their far lod; fences none past `FENCE_FAR` */
const WAYS_FAR = { low: 220, medium: 320, high: 480 }, FENCE_FAR = 300, TUNNEL_FAR = 140;
/** one tile: centre, radius, a mesh per lod (missing: nothing at that lod) */
type Tile = { c: [number, number, number]; r: number; lods: (Uploaded | undefined)[] };
/** a GPU mesh + its CPU indices (wireframe needs them) */
type Uploaded = ReturnType<typeof upload> & { indices?: ArrayLike<number> };
const put = (gl: WebGL2RenderingContext, m: Mesh): Uploaded => Object.assign(upload(gl, m), { indices: m.indices });

/** farm area radius at most, metres (the farm site is only its yard) */
const FARM_RADIUS = 220, FARM_MIN = 70;
/** crop rows: [between rows, along a row] metres, and the nature models drawn */
const CROP_SPACING: Record<string, [number, number]> = { wheat: [.9, .6], corn: [1.1, .8] };
const CROPS: Record<string, { models: string[]; scale: number; sway: number }> = { wheat: { models: ["Wheat"], scale: 1.4, sway: .7 }, corn: { models: ["Corn_1", "Corn_2"], scale: 1, sway: .5 } };
/** nature models for farm tree spots */
const FARM_TREES = { hedge: ["CommonTree_1", "CommonTree_2", "CommonTree_3", "BirchTree_1", "Bush_1", "Bush_2"], bank: ["Willow_1", "Willow_2", "Willow_3", "Bush_1", "BushBerries_1"] };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
import type { WorldSettings, WorldView } from "./types";
/** debug site sphere colour per kind */
const SITE_COLOUR: Record<string, [number, number, number]> = { city: [1, .2, .2], village: [1, .6, .2], farm: [1, 1, .3], peak: [.9, .9, .9], beach: [1, .9, .6], lake: [.3, .6, 1], pass: [.7, .5, 1], viewpoint: [.3, 1, .5] };

/** ground paint grid per quality (lanes / paths), texels per side */
const PAINT = { low: 1024, medium: 2048, high: 3072 };
/** cover map (grass control) texels per side per quality, and the baked ground albedo the tufts read */
const COVER = { low: 512, medium: 1024, high: 2048 };
const ALBEDO = { low: 1024, medium: 2048, high: 4096 };
/** grass draw distance per quality, metres: full density close, eased out with `falloff` (the camp's way), so far reach is cheap */
const DISTANCE = { low: 120, medium: 200, high: 260 };
/** grass planting window per quality, metres (a bit past the draw distance) */
const WINDOW = { low: 130, medium: 215, high: 275 };
/** tuft cap per quality: the window is big, so more than the grass presets */
const MAX_TUFTS = { low: 250_000, medium: 700_000, high: 1_200_000 };

/** the world's grass look (owner's code `g2.eyJ…`): bigger, fuller; density still follows the cover maps */
export const GRASS: Partial<GrassOptions> = {
    settings: { density: 32, sizeScale: 2.6, softBands: .25, lod: 0, falloff: 2 },
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
    /** farm buildings + fences (asset lods: `assets/models/buildings/farm/lod.json`) */
    readonly farmBuilt: Scatter;
    /** batches for `built`, gathered while the world grows */
    private builtBatches: ScatterBatch[] = [];
    /** everything placed on the world (bridges, portals, trail props, ...): one record, saved / sent per player changes */
    readonly placements = new Placements();
    /** bridges and tunnel mouths built on the roads (where nature and trail props react) */
    structures: { kind: string; road: number; x: number; y: number; z: number; to: Vec3 }[] = [];
    private v: WorldView;
    private data?: TerrainData;
    /** sites + roads, built inside the terrain pipeline (before erosion) */
    readonly roads: RoadHooks;
    /** lakes, streams and rivers, carved inside the terrain pipeline (before roads) */
    readonly hydrology: HydrologyHooks;
    private wayTiles: Tile[] = [];
    private fenceTiles: Tile[] = [];
    private tunnelTiles: Tile[] = [];
    private siteMesh?: ReturnType<typeof upload>;
    private extraFarms: { x: number; z: number; radius: number }[] = [];
    /** farms on the farm sites (laid out in the terrain pipeline, after roads) */
    farms: { layout: FarmLayout; edits: ReturnType<typeof groundEdits>; zone: ReturnType<typeof zoneAt> }[] = [];
    /** made on first use of `view.wire` */
    private wire?: Wire;
    /** after the nature is grown (terrain or ecosystem change) */
    onchange?: (world: World) => void;

    constructor(readonly layer: Layer3D, readonly renderer: Renderer, readonly nature: NatureList, settings: Partial<WorldSettings> | string = {}, view: Partial<WorldView> = {}) {
        this.v = { quality: "medium", grass: true, props: true, roads: true, rivers: true, sites: false, style: "pixel", wire: "off", ...view };
        const s = typeof settings === "string" ? World.parse(settings) : settings;
        this.extraFarms = s.farms ?? [];
        this.ecosystem = new Ecosystem(nature, s.ecosystem ?? {});
        this.scatter = new Scatter(renderer, (name, lod) => modelUrl(nature, name, lod), { quality: this.v.quality });
        const models = nature.base.replace(/[^/]+\/$/, "");
        this.built = new Scatter(renderer, (name, lod) => lod ? undefined : `${models}${name}.glb`, { quality: this.v.quality, lods: [], distance: { sleeper: 120, trail: 180, rock: 400, default: 400 } });
        this.farmBuilt = new Scatter(renderer, (name, lod) => lod && !name.startsWith("buildings/farm/") ? undefined : `${models}${name}${lod ? `.lod${lod}` : ""}.glb`, { quality: this.v.quality, distance: { farm: 1500, farmprop: 220, default: 400 } });
        this.grass = new Grass(layer, this.grassOptions());
        this.ecosystem.onchange = () => this.planted();
        this.roads = roadHooks(raw => generateSites(raw, raw.cities, s.sites ?? {}), s.roads ?? {}, JSON.stringify(s.sites ?? {}));
        this.hydrology = hydrologyHooks(s.hydrology ?? {});
        this.terrain = new Terrain(layer, s.terrain ?? {}, combine(this.hydrology, this.roads, { key: "farms", fix: d => this.layFarms(d) }, { key: "seal", fix: d => this.hydrology.seal(d as any) }));
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
            this.farmBuilt.set({ quality: this.v.quality });
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
        this.terrain.showRivers = this.v.rivers;
        // tufts take the ground's colour: bake it once the cover map is in (and after look changes: `world.rebake()`)
        if (this.bake && this.data) { const a = this.terrain.bakeAlbedo(ALBEDO[this.v.quality], light); if (a) { this.grass.ground(a); this.bake = false; } }
        this.terrain.draw(view, light, time, wire ? { fill, mesh: (m, drop) => ground.push([m, drop]) } : {});
        p?.end();
        if (wire) { for (const [m, wallDrop] of ground) wire.draw(view, m, { wallDrop }); this.renderer.reset(); }
        if (!this.data) return;
        const solid: Uploaded[] = [];
        if (this.v.roads)
        {
            // tiles in view, far ones at their low lod; fences only near
            const planes = frustum(view.projectionMatrix, view.viewMatrix), e = view.worldPosition ?? { x: 0, y: 0, z: 0 }, far = WAYS_FAR[this.v.quality];
            const pick = (list: Tile[], cut: number, max = Infinity) => {
                for (const t of list)
                {
                    if (!visible(planes, t.c[0], t.c[1], t.c[2], t.r)) continue;
                    const d = Math.hypot(t.c[0] - e.x, t.c[1] - e.y, t.c[2] - e.z) - t.r;
                    if (d > max) continue;
                    const m = t.lods[d > cut ? Math.min(1, t.lods.length - 1) : 0];
                    if (m) solid.push(m);
                }
            };
            pick(this.wayTiles, far);
            pick(this.fenceTiles, Infinity, FENCE_FAR);
            // inside a tunnel (under the ground) the tube is all there is to see: no limit then
            pick(this.tunnelTiles, Infinity, e.y < this.terrain.groundAt(e.x, e.z) ? Infinity : TUNNEL_FAR);
        }
        if (fill) for (const m of solid) this.renderer.draw(m, IDENTITY);
        if (wire) { for (const m of solid) wire.draw(view, m); this.renderer.reset(); }
        if (this.v.sites && this.siteMesh) this.renderer.draw(this.siteMesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], { unlit: true }, this.renderer.gl.LINES);
        p?.begin("props");
        if (this.v.roads) this.built.draw(view, time, wire ? { fill, part: (m, model, instances) => parts.push([m, model, { ...instances }]) } : {});
        if (this.v.props) this.farmBuilt.draw(view, time, wire ? { fill, part: (m, model, instances) => parts.push([m, model, { ...instances }]) } : {});
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
        this.farmBuilt.destroy();
        this.grass.destroy();
        this.wire?.destroy();
        this.dropTiles(this.wayTiles); this.dropTiles(this.fenceTiles); this.dropTiles(this.tunnelTiles);
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
        this.buildSites();
        this.furnish();
        this.placeFarms();
        this.built.place(this.builtBatches);
        const edge = this.roads.roads ? roadEdge(this.roads.roads) : undefined, keep = this.placements.all().filter(p => p.source === "trails" || p.kind === "portal");
        // no trees on roads, at tunnel mouths or right on trail props (ecosystem: <= 0 means on the road)
        // 16 m buckets of the kept spots (each also in its neighbours' reach through the 3x3 lookup)
        const C = 16, cells = new Map<number, typeof keep>(), key = (i: number, j: number) => (i + 4096) * 8192 + j + 4096;
        for (const p of keep) { const k = key(Math.floor(p.x / C), Math.floor(p.z / C)); (cells.get(k) ?? cells.set(k, []).get(k)!).push(p); }
        const farm = this.farmAt.bind(this);
        const road = (edge || this.farms.length) ? ((x: number, z: number) => {
            if (farm(x, z)) return 0;
            if (!edge) return 99;
            let d = edge(x, z);
            const i = Math.floor(x / C), j = Math.floor(z / C);
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const p of cells.get(key(i + a, j + b)) ?? [])
            { const r = p.kind === "portal" ? 14 : 2.5, q = Math.hypot(p.x - x, p.z - z) - r; if (q < d) d = q; }
            return d;
        }) : undefined;
        this.ecosystem.grow({ ...data, biomes: BIOMES, rockSlope: look.rock.slope, snowHeight: look.snow.height, groundAt: (x, z) => this.terrain.groundAt(x, z), road });
    }

    /** road surfaces: one sweep per ground span (bridges / tunnels are drawn by their own builders), a bit over the drawn ground */
    private buildRoads() {
        this.dropTiles(this.wayTiles); this.dropTiles(this.tunnelTiles);
        this.wayTiles = []; this.tunnelTiles = [];
        this.structures = [];
        this.terrain.material.paths(null);
        const r = this.roads.roads;
        if (!r) return;
        const w = buildWays({ roads: r.network.roads, junctions: r.network.junctions, ground: (x, z) => this.terrain.groundAt(x, z), wet: (x, z) => this.wetAt(x, z), surface: (x, z) => this.surfaceAt(x, z) });
        // lanes / paths are painted onto the ground (no mesh)
        const d = this.terrain.data;
        if (d) this.terrain.material.paths(this.farmPaint(groundPaint(r.network.roads, d.size, PAINT[this.v.quality])));
        this.structures = w.structures;
        const far = buildWays({ roads: r.network.roads, junctions: r.network.junctions, ground: (x, z) => this.terrain.groundAt(x, z), wet: (x, z) => this.wetAt(x, z), surface: (x, z) => this.surfaceAt(x, z) }, undefined, 1);
        this.wayTiles = this.tile([w.mesh, far.mesh]);
        this.tunnelTiles = w.inside ? this.tile([w.inside]) : [];
        if (w.sleepers.count) this.builtBatches.push({ model: SLEEPER_MODEL, kind: "sleeper", ...w.sleepers });
    }

    /** meshes (one per lod) cut into tiles and uploaded */
    private tile(lods: (Mesh | undefined)[]): Tile[] {
        const cut = lods.map(m => m ? tiles(m, TILE) : new Map<string, Mesh>()), keys = new Set(cut.flatMap(c => [...c.keys()]));
        return [...keys].map(k => {
            const meshes = cut.map(c => c.get(k)), b = meshes.find(m => m)!.bounds;
            const c: [number, number, number] = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
            const r = Math.max(...meshes.filter(m => m).map(m => Math.hypot(Math.max(Math.abs(m!.bounds.min.x - c[0]), Math.abs(m!.bounds.max.x - c[0])), Math.max(Math.abs(m!.bounds.min.y - c[1]), Math.abs(m!.bounds.max.y - c[1])), Math.max(Math.abs(m!.bounds.min.z - c[2]), Math.abs(m!.bounds.max.z - c[2])))));
            return { c, r, lods: meshes.map(m => m ? put(this.layer.gl, m) : undefined) };
        });
    }
    private dropTiles(list: Tile[]) { for (const t of list) for (const m of t.lods) m?.destroy(); }

    /** grid node under (x, z) of the current terrain, -1 outside */
    private node(x: number, z: number) {
        const d = this.terrain.data;
        if (!d) return -1;
        const i = Math.round((x + d.size / 2) / d.cell), j = Math.round((z + d.size / 2) / d.cell);
        return i < 0 || j < 0 || i >= d.n || j >= d.n ? -1 : j * d.n + i;
    }
    /** lake / swamp water, or ground less than .4 m over a water surface next to it */
    private wetAt(x: number, z: number) {
        const d = this.terrain.data, k = this.node(x, z);
        if (!d || k < 0) return false;
        if (d.water[k] === 2 || d.water[k] === 3) return true;
        for (const o of [1, -1, d.n, -d.n]) { const m = k + o; if (m >= 0 && m < d.water.length && d.water[m] >= 2 && this.terrain.groundAt(x, z) - d.surface[m] < .4) return true; }
        return false;
    }
    private surfaceAt(x: number, z: number) {
        const d = this.terrain.data!, k = this.node(x, z);
        let s = -Infinity;
        for (const o of [0, 1, -1, d.n, -d.n]) { const m = k + o; if (m >= 0 && m < d.water.length && d.water[m] >= 2) s = Math.max(s, d.surface[m]); }
        return Number.isFinite(s) ? s : this.terrain.groundAt(x, z);
    }

    /** structures + trail furniture into the placement record, then their instances into the built scatter */
    private furnish() {
        const P = this.placements, r = this.roads.roads;
        P.clear("structures"); P.clear("trails");
        for (const st of this.structures) P.add("structures", st.kind.startsWith("bridge-") ? `bridge:${st.kind.slice(7)}` : st.kind, st.x, st.y, st.z, Math.atan2(st.to[0] - st.x, st.to[2] - st.z), 1, { road: st.road, to: st.to });
        if (r)
        {
            const { items, fences } = furnish({
                ways: r.network.roads, spots: this.roads.sites, ground: (x, z) => this.terrain.groundAt(x, z), clear: roadEdge(r, 10),
                mouths: this.structures.filter(s => s.kind === "portal").map(s => ({ x: s.x, y: s.y, z: s.z, dx: s.to[0] - s.x, dz: s.to[2] - s.z })),
            }, { seed: this.ecosystem.seed });
            for (const it of items) P.add("trails", it.kind, it.x, it.y, it.z, it.yaw, it.scale ?? 1);
            for (const run of fences) P.add("trails", "fence:run", run[0][0], run[0][1], run[0][2], 0, 1, { points: run });
        }
        P.applyChanges();
        // generated fences (posts on the ground, rails follow the slope)
        const runs = P.all().filter(p => p.kind === "fence:run").map(p => fence(p.params!.points as Vec3[]));
        // farm fences: posts on the ground, rails follow the slope, one run per line
        for (const { layout } of this.farms) for (const l of layout.fences) runs.push(fence(fencePosts(l).map(([x, z]) => [x, this.terrain.groundAt(x, z), z] as Vec3)));
        this.dropTiles(this.fenceTiles);
        this.fenceTiles = runs.length ? this.tile([merge(runs)]) : [];
        this.builtBatches.push(...P.batches(k => k.includes(":") || k === "portal" ? undefined : k, k => k.startsWith("nature/") ? "rock" : "trail"));
    }

    /** farm sites: lay out a farm each and press its flatten pads into the height grid */
    private layFarms(d: { n: number; cell: number; size: number; height: Float32Array; water: Uint8Array }) {
        this.farms = [];
        const base = d.height.slice(), h0 = d.size / 2;
        const at = (a: Float32Array | Uint8Array, x: number, z: number) => {
            const fx = Math.max(0, Math.min(d.n - 1.001, (x + h0) / d.cell)), fz = Math.max(0, Math.min(d.n - 1.001, (z + h0) / d.cell));
            const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * d.n + i;
            return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + d.n] * (1 - u) + a[k + d.n + 1] * u) * v;
        };
        const ground = { height: (x: number, z: number) => at(base, x, z), water: (x: number, z: number) => d.water[Math.round((z + h0) / d.cell) * d.n + Math.round((x + h0) / d.cell)] > 0 };
        const ways = this.roads.roads?.network.roads ?? [];
        const edge = this.roads.roads ? roadEdge(this.roads.roads) : undefined;
        const lay = (x: number, z: number, room: number, seed: number) => {
            // entry: the nearest road point, pulled onto the farm's edge
            let entry: { x: number; z: number } | undefined, best = room * 1.5;
            for (const w of ways) for (const p of w.points) { const dd = Math.hypot(p[0] - x, p[2] - z); if (dd < best) { best = dd; entry = { x: p[0], z: p[2] }; } }
            if (entry) { const l = Math.hypot(entry.x - x, entry.z - z) || 1; entry = { x: x + (entry.x - x) / l * Math.min(l, room), z: z + (entry.z - z) / l * Math.min(l, room) }; }
            else entry = { x: x - room, z };
            const layout = generateFarm({ x, z, radius: room, entry }, { ...ground, blocked: edge && ((x, z) => edge(x, z) < 4) }, { seed });
            const edits = groundEdits(ground, layout.edits);
            // flatten pads only: the rest of the farm keeps the ground
            for (const e of layout.edits) {
                if (e.kind !== "flatten") continue;
                const r = Math.hypot(e.w, e.d) / 2 + e.blend;
                for (let j = Math.max(0, Math.floor((e.z - r + h0) / d.cell)); j <= Math.min(d.n - 1, Math.ceil((e.z + r + h0) / d.cell)); j++)
                    for (let i = Math.max(0, Math.floor((e.x - r + h0) / d.cell)); i <= Math.min(d.n - 1, Math.ceil((e.x + r + h0) / d.cell)); i++)
                        d.height[j * d.n + i] = edits.height(i * d.cell - h0, j * d.cell - h0);
            }
            this.farms.push({ layout, edits, zone: zoneAt(layout) });
            placed.push({ x, z, r: room });
        };
        const placed: { x: number; z: number; r: number }[] = [];
        for (const f of this.extraFarms) lay(f.x, f.z, f.radius, 1);
        const towns = this.roads.sites.filter(s => s.kind === "city" || s.kind === "village");
        // heaviest farm sites first; a farm too close to a placed one is dropped (its land is that farm's)
        for (const s of this.roads.sites.filter(s => s.kind === "farm").sort((a, b) => b.weight - a.weight)) {
            let room = FARM_RADIUS;
            for (const o of towns) room = Math.min(room, Math.hypot(o.x - s.x, o.z - s.z) - o.radius);
            for (const o of placed) room = Math.min(room, Math.hypot(o.x - s.x, o.z - s.z) - o.r);
            if (room < FARM_MIN) continue;
            lay(s.x, s.z, room, s.id + 1);
        }
    }

    /** true on farm ground that keeps no trees (yard, fields, pastures, paths) */
    private farmAt(x: number, z: number) {
        for (const f of this.farms) {
            const a = f.layout.area;
            if (Math.abs(x - a.x) > a.radius || Math.abs(z - a.z) > a.radius) continue;
            const zn = f.zone(x, z);
            if (zn === "yard" || zn === "field" || zn === "pasture" || f.edits.grass(x, z) < .5) return true;
        }
        return false;
    }

    /** farm paint (dirt, soil, gravel) stamped into the ways paint grid */
    private farmPaint(p: { data: Uint8Array; n: number; size: number }) {
        const cell = p.size / p.n, h0 = p.size / 2, G = { dirt: 0, soil: 40, gravel: 255 };
        for (const f of this.farms) {
            const a = f.layout.area, r = a.radius + 5;
            for (let j = Math.max(0, Math.floor((a.z - r + h0) / cell)); j <= Math.min(p.n - 1, Math.ceil((a.z + r + h0) / cell)); j++)
                for (let i = Math.max(0, Math.floor((a.x - r + h0) / cell)); i <= Math.min(p.n - 1, Math.ceil((a.x + r + h0) / cell)); i++) {
                    const paint = f.edits.paint((i + .5) * cell - h0, (j + .5) * cell - h0);
                    if (!paint) continue;
                    const k = (j * p.n + i) * 2;
                    p.data[k] = 255; p.data[k + 1] = G[paint];
                }
        }
        return p;
    }

    /** farm hedge / bank tree spots as nature batches */
    private farmTrees(): ScatterBatch[] {
        const batch = new Map<string, number[]>();
        let seed = 7;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (const { layout } of this.farms) for (const t of layout.trees) {
            const list = FARM_TREES[t.kind], model = list[Math.floor(rand() * list.length)], bush = model.startsWith("Bush");
            (batch.get(model) ?? batch.set(model, []).get(model)!).push(t.x, this.terrain.groundAt(t.x, t.z), t.z, bush ? .8 + rand() * .6 : 2 + rand() * 1.4, rand() * 6.28, .9 + rand() * .2, bush ? .3 : .4, 0);
        }
        const out: ScatterBatch[] = [...batch].map(([model, list]) => ({ model, kind: model.startsWith("Bush") ? "bush" : "tree", data: new Float32Array(list), count: list.length / 8 }));
        // crops in rows: [model(s), kind (draw distance), scale]
        const crops = new Map<string, number[]>();
        for (const { layout } of this.farms) for (const [crop, xz] of cropRows(layout, CROP_SPACING)) {
            const c = CROPS[crop]; if (!c) continue;
            for (let i = 0; i < xz.length; i += 3) {
                const x = xz[i] + (rand() - .5) * .15, z = xz[i + 1] + (rand() - .5) * .15, model = c.models[Math.floor(rand() * c.models.length)];
                (crops.get(model) ?? crops.set(model, []).get(model)!).push(x, this.terrain.groundAt(x, z), z, c.scale * (.9 + rand() * .2), xz[i + 2] + (rand() - .5) * .6, .92 + rand() * .16, c.sway, 0);
            }
        }
        for (const [model, list] of crops) out.push({ model, kind: model.startsWith("Corn") ? "bush" : "plant", data: new Float32Array(list), count: list.length / 8 });
        return out;
    }

    /** farm buildings + fences into the built scatter */
    private placeFarms() {
        const batch = new Map<string, { model: string; kind: string; list: number[] }>();
        const add = (model: string, kind: string, x: number, z: number, scale: number, yaw: number, lift = 0) => {
            let b = batch.get(model);
            if (!b) batch.set(model, b = { model, kind, list: [] });
            // shader yaw turns the other way
            b.list.push(x, this.terrain.groundAt(x, z) + lift, z, scale, -yaw, 1, 0, 0);
        };
        for (const { layout } of this.farms) {
            for (const b of layout.buildings) add(`buildings/farm/${b.asset}`, "farm", b.x, b.z, 1, b.yaw);
            for (const p of layout.props) add(p.asset, "farmprop", p.x, p.z, p.scale, p.yaw, p.lift);
        }
        this.farmBuilt.place([...batch.values()].map(b => ({ model: b.model, kind: b.kind, data: new Float32Array(b.list), count: b.list.length / 8 })));
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
        this.scatter.place([...this.ecosystem.batches, ...this.farmTrees()]);
        this.plantGrass();
        this.onchange?.(this);
    }

    private bake = false;
    /** redo the tufts' colours from the ground (after a terrain look change) */
    rebake() { this.bake = true; }

    /**
     * The cover map (grass density / dry / height / flowers) from the ecosystem and the farms: the terrain paints its
     * grass ground from it, the tufts plant from it and take the baked ground colour. One source for both.
     */
    private plantGrass() {
        const d = this.data;
        if (!d) return;
        const farm = (x: number, z: number) => { let k = 1; for (const f of this.farms) if (Math.abs(x - f.layout.area.x) < f.layout.area.radius + 10 && Math.abs(z - f.layout.area.z) < f.layout.area.radius + 10) k *= f.edits.grass(x, z); return k; };
        this.terrain.cover(coverMap(d.size, COVER[this.v.quality], (x, z, out) => {
            this.ecosystem.grassAt(x, z, out);
            if (out.density > 0) out.density *= farm(x, z);
        }));
        this.bake = true;
        const out = { density: 0, height: 1, dry: 0, flowers: 0 };
        this.grass.plant({
            area: { x: -d.size / 2, z: -d.size / 2, width: d.size, depth: d.size },
            seed: this.ecosystem.seed,
            height: (x, z) => this.terrain.groundAt(x, z),
            grow: (x, z) => this.terrain.coverAt(x, z, out),
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
