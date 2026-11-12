import { Model, INSTANCE_STRIDE, type Renderer } from "@polywar/renderer";
import { frustum, visible } from "./frustum";
import type { Quality, ScatterBatch, ScatterOptions, View } from "./types";

export const QUALITY: Record<Quality, number> = { low: .5, medium: 1, high: 1.6 };

export const DEFAULTS: ScatterOptions = {
    quality: "medium",
    distance: { tree: 650, rock: 320, cactus: 380, bush: 260, deadwood: 200, plant: 110, flower: 85, grass: 70, water: 140, default: 200 },
    fade: .15,
    wind: { direction: [1, .3], strength: .03 },
    surface: { bands: 3, soft: .35, grit: .04 },
    gloss: {},
};

type Chunk = { x: number; y: number; z: number; radius: number; first: number; count: number };
type Group = { name: string; kind: string; model?: Model; buffer: WebGLBuffer; chunks: Chunk[]; count: number; height: number };

/**
 * Many static glTF props, instanced. Each model's props are sorted into square chunks (row order) on the GPU;
 * a frame draws only chunks in the view and in range of the prop's kind, neighbouring chunks in one call.
 */
export class Scatter {
    private o: ScatterOptions;
    private groups: Group[] = [];
    private models = new Map<string, Promise<Model | undefined>>();
    /** props / draw calls last frame */
    drawn = 0;
    calls = 0;

    /** `url(model)` says where a model's glb is */
    constructor(readonly renderer: Renderer, readonly url: (model: string) => string, options: Partial<ScatterOptions> = {}) {
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
        await Promise.all(this.groups.map(async g => {
            g.model = await this.load(g.name);
            if (g.model) g.height = g.model.bounds.max[1] || 1;
        }));
    }

    draw(view: View, time: number) {
        const r = this.renderer, planes = frustum(view.projectionMatrix, view.viewMatrix);
        const eye = view.worldPosition ?? { x: 0, y: 0, z: 0 };
        const w = this.o.wind, l = Math.hypot(...w.direction) || 1, wind: [number, number, number] = [w.direction[0] / l, w.direction[1] / l, w.strength];
        this.drawn = this.calls = 0;
        for (const g of this.groups)
        {
            if (!g.model) continue;
            const far = this.distance(g.kind), fade: [number, number] = [far * (1 - this.o.fade), far];
            const parts = g.model.parts;
            // runs of neighbouring visible chunks
            let first = -1, count = 0;
            const flush = () => {
                if (count) for (const p of parts) { r.drawInstanced(p.mesh, p.matrix, { buffer: g.buffer, first, count, time, wind, swayHeight: g.height, fade, surface: { ...this.o.surface, gloss: this.o.gloss[g.kind] ?? 0 } }, { maps: p.maps }); this.calls++; }
                this.drawn += count;
                first = -1; count = 0;
            };
            for (const c of g.chunks)
            {
                const d = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) - c.radius;
                if (d > far || !visible(planes, c.x, c.y, c.z, c.radius)) { flush(); continue; }
                if (first < 0) first = c.first;
                else if (first + count !== c.first) { flush(); first = c.first; }
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

    private load(name: string) {
        let m = this.models.get(name);
        if (!m) this.models.set(name, m = Model.load(this.renderer.gl, this.url(name)).catch(e => { console.warn(`scatter: ${name}`, e); return undefined; }));
        return m;
    }

    /** sort a batch into chunks (row order) and upload it */
    private group(b: ScatterBatch): Group {
        const S = INSTANCE_STRIDE, size = Math.min(128, Math.max(16, this.distance(b.kind) / 4));
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
            chunks.push({ x: cx, y: y / list.length, z: cz, /* props reach up: about 6 m per unit of scale */ radius: size * Math.SQRT1_2 + top * 6, first: at - list.length, count: list.length });
        }
        const gl = this.renderer.gl, buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return { name: b.model, kind: b.kind, buffer, chunks, count: b.count, height: 1 };
    }
}
