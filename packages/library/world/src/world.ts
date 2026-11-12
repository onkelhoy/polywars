import type { Layer3D } from "@papit/game-engine";
import { Ecosystem, DEFAULTS as ECOSYSTEM, decode as decodeEco, isCode as isEcoCode, type EcosystemSettings } from "@polywar/ecosystem";
import { DEFAULTS as GRASS_DEFAULTS, Grass, type GrassOptions } from "@polywar/grass";
import { modelUrl, type NatureList } from "@polywar/nature";
import type { Light, Renderer, View } from "@polywar/renderer";
import { Scatter } from "@polywar/scatter";
import { DEFAULTS as TERRAIN, Terrain, decode, isCode, type TerrainData, type TerrainSettings } from "@polywar/terrain";
import { BIOMES } from "@polywar/terrain-material";
import type { WorldSettings, WorldView } from "./types";

/** grass draw window per quality, metres (about the grass draw distance) */
const WINDOW = { low: 30, medium: 50, high: 75 };
/** tuft cap per quality: the window is big, so more than the grass presets */
const MAX_TUFTS = { low: 30_000, medium: 120_000, high: 260_000 };

/** the world's grass look (owner's code `g2.eyJ…`): bigger, fuller; density still follows the cover maps */
export const GRASS: Partial<GrassOptions> = {
    settings: { density: 32, sizeScale: 1.75, softBands: .25 },
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
    /** after the nature is grown (terrain or ecosystem change) */
    onchange?: (world: World) => void;

    constructor(readonly layer: Layer3D, readonly renderer: Renderer, readonly nature: NatureList, settings: Partial<WorldSettings> | string = {}, view: Partial<WorldView> = {}) {
        this.v = { quality: "medium", grass: true, props: true, style: "pixel", ...view };
        const s = typeof settings === "string" ? World.parse(settings) : settings;
        this.ecosystem = new Ecosystem(nature, s.ecosystem ?? {});
        this.scatter = new Scatter(renderer, name => modelUrl(nature, name), { quality: this.v.quality });
        this.grass = new Grass(layer, this.grassOptions());
        this.ecosystem.onchange = () => this.planted();
        this.terrain = new Terrain(layer, s.terrain ?? {});
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

    /** biome under a spot, ground height, ... are the terrain's */
    heightAt(x: number, z: number) { return this.terrain.heightAt(x, z); }

    draw(view: View, light: Light, time: number) {
        this.terrain.draw(view, light, time);
        if (!this.data) return;
        if (this.v.props) this.scatter.draw(view, time);
        if (this.v.grass)
        {
            const e = view.worldPosition;
            if (e) this.grass.follow(e.x, e.z);
            this.grass.draw(view, light, time);
        }
    }

    destroy() {
        this.terrain.destroy();
        this.scatter.destroy();
        this.grass.destroy();
    }

    // ---- internals ----

    private grassOptions(): Partial<GrassOptions> {
        return { ...GRASS, settings: { ...GRASS.settings, maxTufts: MAX_TUFTS[this.v.quality] }, quality: this.v.quality, style: this.v.style };
    }

    private grow(data: TerrainData) {
        this.data = data;
        const look = this.terrain.material.look;
        this.ecosystem.grow({ ...data, biomes: BIOMES, rockSlope: look.rock.slope, snowHeight: look.snow.height });
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
            height: (x, z) => this.terrain.heightAt(x, z),
            grow: (x, z) => this.ecosystem.grassAt(x, z, out),
            window: WINDOW[this.v.quality],
        });
    }
}
