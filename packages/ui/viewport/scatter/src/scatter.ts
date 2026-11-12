import { Model, INSTANCE_STRIDE, type Renderer } from "@polywar/renderer";
import { frustum, visible } from "./frustum";
import type { Quality, ScatterBatch, ScatterOptions, View } from "./types";

export const QUALITY: Record<Quality, number> = { low: .5, medium: 1, high: 1.6 };

export const DEFAULTS: ScatterOptions = {
    quality: "medium",
    distance: { tree: 950, rock: 420, cactus: 500, bush: 340, deadwood: 260, plant: 110, flower: 85, grass: 70, water: 140, default: 200 },
    fade: .15,
    lods: [.12, .3, .6],
    wind: { direction: [1, .3], strength: .03 },
    surface: { bands: 3, soft: .35, grit: .04 },
    gloss: {},
};

type Chunk = { x: number; y: number; z: number; radius: number; half: number; first: number; count: number };
/** `models[lod]`: lod 0 the full model; a missing level draws the next better one */
type Group = { name: string; kind: string; models: (Model | undefined)[]; buffer: WebGLBuffer; chunks: Chunk[]; count: number; height: number };

/**
 * Many static glTF props, instanced. Each model's props are sorted into square chunks (row order) on the GPU;
 * a frame draws only chunks in the view and in range of the prop's kind, neighbouring chunks in one call.
 */
export class Scatter {
    private o: ScatterOptions;
    private groups: Group[] = [];
    private models = new Map<string, Promise<Model | undefined>>();
    /** props / draw calls / triangles last frame, props per lod */
    drawn = 0;
    calls = 0;
    triangles = 0;
    perLod: number[] = [];

    /** `url(model, lod)` says where a model's glb is (lod 0 = full detail; return undefined if a level has none) */
    constructor(readonly renderer: Renderer, readonly url: (model: string, lod: number) => string | undefined, options: Partial<ScatterOptions> = {}) {
        this.o = { ...DEFAULTS, ...options, distance: { ...DEFAULTS.distance, ...options.distance }, surface: { ...DEFAULTS.surface, ...options.surface } };
    }

    get options(): Readonly<ScatterOptions> { return this.o; }
    set(options: Partial<ScatterOptions>) { this.o = { ...this.o, ...options, distance: { ...this.o.distance, ...options.distance } }; }

    /** total props */
    get count() { return this.groups.reduce((s, g) => s + g.count, 0); }

    /** draw distance of a kind (quality applied) */
    distance(kind: string) { return (this.o.distance[kind] ?? this.o.distance.default ?? 200) * QUALITY[this.o.quality]; }

    /** Replace every prop. Models load on first use (cached); props draw once theirs is in. */
    async place(batches: ScatterBatch[]) {
        const gl = this.renderer.gl;
        this.groups.forEach(g => gl.deleteBuffer(g.buffer));
        this.groups = batches.filter(b => b.count > 0).map(b => this.group(b));
        await Promise.all(this.groups.map(g => Promise.all(Array.from({ length: this.o.lods.length + 1 }, async (_, lod) => {
            const model = await this.load(g.name, lod);
            g.models[lod] = model;
            if (lod === 0 && model) g.height = model.bounds.max[1] || 1;
        }))));
    }

    draw(view: View, time: number) {
        const r = this.renderer, planes = frustum(view.projectionMatrix, view.viewMatrix);
        const eye = view.worldPosition ?? { x: 0, y: 0, z: 0 };
        const w = this.o.wind, l = Math.hypot(...w.direction) || 1, wind: [number, number, number] = [w.direction[0] / l, w.direction[1] / l, w.strength];
        this.drawn = this.calls = this.triangles = 0;
        this.perLod = this.o.lods.map(() => 0).concat(0);
        for (const g of this.groups)
        {
            if (!g.models[0]) continue;
            const far = this.distance(g.kind), fade: [number, number] = [far * (1 - this.o.fade), far];
            const surface = { ...this.o.surface, gloss: this.o.gloss[g.kind] ?? 0 };
            const steps = this.o.lods.map(f => f * far);
            // runs of neighbouring visible chunks at one lod
            let first = -1, count = 0, level = 0;
            const flush = () => {
                let lod = level;
                while (lod > 0 && !g.models[lod]) lod--;
                if (count) for (const p of g.models[lod]!.parts)
                {
                    r.drawInstanced(p.mesh, p.matrix, { buffer: g.buffer, first, count, time, wind, swayHeight: g.height, fade, surface }, { maps: p.maps });
                    this.calls++;
                    this.triangles += p.mesh.count / 3 * count;
                }
                this.drawn += count;
                this.perLod[lod] += count;
                first = -1; count = 0;
            };
            for (const c of g.chunks)
            {
                const centre = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z), d = centre - c.radius;
                if (d > far || !visible(planes, c.x, c.y, c.z, c.radius)) { flush(); continue; }
                // lod by the chunk's nearest ground point
                const near = centre - c.half;
                let l = 0;
                while (l < steps.length && near > steps[l]) l++;
                if (first >= 0 && (l !== level || first + count !== c.first)) flush();
                if (first < 0) { first = c.first; level = l; }
                count += c.count;
            }
            flush();
        }
    }

    destroy() {
        this.groups.forEach(g => this.renderer.gl.deleteBuffer(g.buffer));
        this.groups = [];
        this.models.forEach(m => m.then(model => model?.destroy()));
        this.models.clear();
    }

    private load(name: string, lod: number) {
        const url = this.url(name, lod);
        if (!url) return Promise.resolve(undefined);
        let m = this.models.get(url);
        if (!m) this.models.set(url, m = Model.load(this.renderer.gl, url).catch(e => { if (lod === 0) console.warn(`scatter: ${name}`, e); return undefined; }));
        return m;
    }

    /** sort a batch into chunks (row order) and upload it */
    private group(b: ScatterBatch): Group {
        const S = INSTANCE_STRIDE, size = Math.min(64, Math.max(16, this.distance(b.kind) / 4));
        const cells = new Map<number, number[]>();
        let top = 0;
        for (let i = 0; i < b.count; i++)
        {
            const x = b.data[i * S], z = b.data[i * S + 2];
            top = Math.max(top, b.data[i * S + 3]);
            const key = (Math.floor(z / size) + 4096) * 8192 + Math.floor(x / size) + 4096;
            let list = cells.get(key);
            if (!list) cells.set(key, list = []);
            list.push(i);
        }
        const data = new Float32Array(b.count * S), chunks: Chunk[] = [];
        let at = 0;
        for (const key of [...cells.keys()].sort((a, c) => a - c))
        {
            const list = cells.get(key)!, cx = (key % 8192 - 4096 + .5) * size, cz = (Math.floor(key / 8192) - 4096 + .5) * size;
            let y = 0;
            for (const i of list) { data.set(b.data.subarray(i * S, i * S + S), at * S); at++; y += b.data[i * S + 1]; }
            chunks.push({ x: cx, y: y / list.length, z: cz, /* props reach up: about 6 m per unit of scale */ radius: size * Math.SQRT1_2 + top * 6, half: size * Math.SQRT1_2, first: at - list.length, count: list.length });
        }
        const gl = this.renderer.gl, buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return { name: b.model, kind: b.kind, models: [], buffer, chunks, count: b.count, height: 1 };
    }
}
