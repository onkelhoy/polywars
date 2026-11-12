import { decode, encode, isCode } from "./code";
import { cover, type Cover } from "./cover";
import { GRASS_MODE } from "./hash";
import { place, type Placed } from "./place";
import { DEFAULTS, resolve } from "./presets";
import { bilinear, near, sample, smoothstep } from "./sample";
import type { Batch, EcosystemOptions, EcosystemSettings, GrassCover, Ground, NatureList } from "./types";

/**
 * Nature for a terrain: cover maps (grass + prop densities, borders blended) and seeded props from the nature list.
 * `grow(ground)` builds both; `grassAt(x, z)` says how grass grows at a spot (props included: none under rocks, rings round trees).
 * Pure CPU, no drawing: `@polywar/scatter` draws `batches`, `@polywar/grass` plants from `grassAt`.
 */
export class Ecosystem {
    private o: EcosystemOptions;
    private ground?: Ground;
    cover?: Cover;
    private placed?: Placed;
    /** ms the last grow took */
    time = 0;

    constructor(readonly list: NatureList, options: Partial<EcosystemOptions> | string = {}) {
        this.o = typeof options === "string" ? this.parse(options) : resolve(options);
    }

    get options(): Readonly<EcosystemOptions> { return this.o; }
    get seed() { return this.o.seed; }
    get batches(): Batch[] { return this.placed?.batches ?? []; }
    /** props placed per group */
    get counts(): Record<string, number> { return this.placed?.counts ?? {}; }
    get total() { return this.placed?.hash.count ?? 0; }

    toJSON(): EcosystemSettings { return structuredClone(this.o); }
    /** share code: only what differs from the defaults */
    get code(): string { return encode(this.o, DEFAULTS); }

    /** Replace all settings (settings, JSON text or a share code) and regrow. */
    load(settings: Partial<EcosystemSettings> | string) {
        this.o = typeof settings === "string" ? this.parse(settings) : resolve(settings);
        if (this.ground) this.grow(this.ground);
    }

    /** Merge settings (groups / biomes by name) and regrow. */
    set(options: Partial<EcosystemOptions>) {
        this.o = resolve({ ...this.o, ...options, groups: { ...this.o.groups, ...options.groups }, biomes: { ...this.o.biomes, ...options.biomes } });
        if (this.ground) this.grow(this.ground);
    }

    reseed(seed = Math.floor(Math.random() * 1e9)) { this.set({ seed }); }

    grow(ground: Ground) {
        const t = performance.now();
        this.ground = ground;
        this.cover = cover(ground, this.o);
        this.placed = place(ground, this.cover, this.list, this.o);
        this.time = performance.now() - t;
        this.onchange?.();
    }

    /** called after every grow */
    onchange?: () => void;

    /** Grass at a spot. `out` is reused when given. */
    grassAt(x: number, z: number, out: GrassCover = { density: 0, height: 1, dry: 0, flowers: 0 }): GrassCover {
        const g = this.ground, c = this.cover, p = this.placed;
        out.density = 0; out.height = 1; out.dry = 0; out.flowers = 0;
        if (!g || !c || !p) return out;
        if (near(g, g.water, x, z) !== 0) return out;
        let density = bilinear(c.density, c.m, c.size, x, z);
        if (density <= .002) return out;
        let height = bilinear(c.height, c.m, c.size, x, z), dry = bilinear(c.dry, c.m, c.size, x, z);
        // bare rock on steep faces, none on snow
        const rs = g.rockSlope ?? .55;
        density *= 1 - smoothstep(rs - .12, rs, sample(g, g.slope, x, z));
        const t = sample(g, g.temperature, x, z), snow = this.o.season.snow;
        density *= smoothstep(snow - .05, snow + .03, t);
        if (g.snowHeight !== undefined) density *= 1 - smoothstep(g.snowHeight - 30, g.snowHeight, sample(g, g.height, x, z));
        if (density <= .002) return out;

        const h = p.hash, a = this.o.around;
        h.near(x, z, h.reach * a.ring, (id, d) => {
            const mode = h.grass[id];
            if (mode === GRASS_MODE.keep) return;
            const solid = h.solid[id];
            if (d < solid * 1.2) density *= smoothstep(solid * .8, solid * 1.2, d);
            if (mode !== GRASS_MODE.ring) return;
            const canopy = h.canopy[id], r = canopy * a.ring;
            if (d >= r) return;
            if (h.bare[id]) { density *= smoothstep(canopy * .25, canopy * .9, d); return; }
            const k = 1 - d / r;
            height *= 1 + a.taller * k;
            density = Math.min(1, density * (1 + .5 * k));
            dry *= 1 - .5 * k;
        });
        out.density = density;
        out.height = height;
        out.dry = dry;
        out.flowers = bilinear(c.flowers, c.m, c.size, x, z);
        return out;
    }

    private parse(text: string): EcosystemOptions {
        return resolve(isCode(text) ? decode(text, DEFAULTS) : JSON.parse(text));
    }
}
