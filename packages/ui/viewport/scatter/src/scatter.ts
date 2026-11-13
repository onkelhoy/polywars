import { Model, INSTANCE_STRIDE, CARD_STRIDE, type Instances, type Renderer, type WireMesh } from "@polywar/renderer";
import { frustum, visible } from "./frustum";
import type { Quality, ScatterBatch, ScatterOptions, View } from "./types";

export const QUALITY: Record<Quality, number> = { low: .5, medium: 1, high: 1.6 };

export const DEFAULTS: ScatterOptions = {
    quality: "medium",
    distance: { tree: 950, rock: 420, cactus: 500, bush: 340, deadwood: 260, plant: 110, flower: 85, grass: 70, water: 140, default: 200 },
    fade: .15,
    lods: [.005, .105, .21, .42, .63],
    wind: { direction: [1, .3], strength: .03 },
    surface: { bands: 3, soft: .35, grit: .04 },
    gloss: {},
};

/** square ground cell, `CELL` metres, shared by all groups (culled once a frame) */
const CELL = 64, HALF = CELL * Math.SQRT1_2;
type Cell = { index: number; x: number; y: number; z: number; n: number; reach: number };
type Chunk = { cell: number; first: number; count: number };
/** `models[lod]`: lod 0 the full model; a missing level draws the next better one; `cards[lod]`: that level is a flat camera facing card */
/** a flat card's shape and colour: `halfWidth bottom top topWidth` (1 quad, 0 triangle), `r g b` */
type Card = { shape: [number, number, number, number]; rgb: [number, number, number] };
type Group = { name: string; kind: string; models: (Model | undefined)[]; cards: (Card | undefined)[]; data: Float32Array; chunks: Chunk[]; count: number; height: number };

/**
 * Many static glTF props, instanced. Each model's props are sorted into square chunks (row order) on the GPU;
 * a frame picks the chunks in the view and in range (lod by distance), packs their props into one stream buffer
 * (only when the pick changes) and draws each model's lod in one call per part. Flat card lods of every model draw together in one call.
 */
export class Scatter {
    private o: ScatterOptions;
    private groups: Group[] = [];
    private models = new Map<string, Promise<Model | undefined>>();
    /** this frame's props, packed per group and lod (CPU copy + GPU stream buffer) */
    private stream = new Float32Array(0);
    private buffer: WebGLBuffer;
    /** this frame's cards (`CARD_STRIDE` floats each) */
    private cardStream = new Float32Array(0);
    private cardBuffer: WebGLBuffer;
    private cardCount = 0;
    private sign = 0;
    private cells: Cell[] = [];
    private cellOf = new Map<number, Cell>();
    /** per cell this frame: distance of its nearest ground point, -1 out of view */
    private near = new Float32Array(0);
    private packed = -1;
    /** props / draw calls / triangles last frame, props per lod */
    drawn = 0;
    calls = 0;
    triangles = 0;
    perLod: number[] = [];

    /** `url(model, lod)` says where a model's glb is (lod 0 = full detail; return undefined if a level has none) */
    constructor(readonly renderer: Renderer, readonly url: (model: string, lod: number) => string | undefined, options: Partial<ScatterOptions> = {}) {
        this.o = { ...DEFAULTS, ...options, distance: { ...DEFAULTS.distance, ...options.distance }, surface: { ...DEFAULTS.surface, ...options.surface } };
        this.buffer = renderer.gl.createBuffer()!;
        this.cardBuffer = renderer.gl.createBuffer()!;
    }

    get options(): Readonly<ScatterOptions> { return this.o; }
    set(options: Partial<ScatterOptions>) { this.o = { ...this.o, ...options, distance: { ...this.o.distance, ...options.distance } }; }

    /** total props */
    get count() { return this.groups.reduce((s, g) => s + g.count, 0); }

    /** draw distance of a kind (quality applied) */
    distance(kind: string) { return (this.o.distance[kind] ?? this.o.distance.default ?? 200) * QUALITY[this.o.quality]; }

    /** Replace every prop. Models load on first use (cached); props draw once theirs is in. */
    async place(batches: ScatterBatch[]) {
        this.packed = -1;
        this.cells = [];
        this.cellOf.clear();
        this.groups = batches.filter(b => b.count > 0).map(b => this.group(b));
        await Promise.all(this.groups.map(g => Promise.all(Array.from({ length: this.o.lods.length + 1 }, async (_, lod) => {
            const model = await this.load(g.name, lod);
            g.models[lod] = model;
            // a flat model (no depth) is a card: drawn turned to the camera
            g.cards[lod] = model && card(model);
            if (lod === 0 && model) g.height = model.bounds.max[1] || 1;
        }))));
    }

    /**
     * `fill` false skips the shaded draws; `part` sees every instanced part drawn (e.g. a `Wire`); far cards are left out of it.
     */
    draw(view: View, time: number, hooks: { fill?: boolean; part?: (mesh: WireMesh, model: ArrayLike<number>, instances: Instances) => void } = {}) {
        const fill = hooks.fill ?? true;
        const r = this.renderer, planes = frustum(view.projectionMatrix, view.viewMatrix);
        const eye = view.worldPosition ?? { x: 0, y: 0, z: 0 };
        const w = this.o.wind, l = Math.hypot(...w.direction) || 1, wind: [number, number, number] = [w.direction[0] / l, w.direction[1] / l, w.strength];
        const S = INSTANCE_STRIDE, levels = this.o.lods.length + 1;
        this.drawn = this.calls = this.triangles = 0;
        this.perLod = new Array(levels).fill(0);
        // 1. pick chunks: per group and lod, the visible chunks (a signature of the pick: no upload when it is the same)
        const picks: { g: Group; lod: number; chunks: Chunk[]; count: number }[] = [];
        let total = 0, sign = 0;
        if (this.near.length < this.cells.length) this.near = new Float32Array(this.cells.length);
        const near = this.near;
        for (const c of this.cells)
        {
            const centre = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z);
            near[c.index] = visible(planes, c.x, c.y, c.z, HALF + c.reach) ? Math.max(0, centre - HALF) : -1;
        }
        for (let gi = 0; gi < this.groups.length; gi++)
        {
            const g = this.groups[gi];
            if (!g.models[0]) continue;
            const far = this.distance(g.kind), steps = this.o.lods.map(f => f * far);
            const lists: Chunk[][] = Array.from({ length: levels }, () => []), counts = new Array(levels).fill(0);
            for (let ci = 0; ci < g.chunks.length; ci++)
            {
                const c = g.chunks[ci], d = near[c.cell];
                if (d < 0 || d > far) continue;
                // lod by the cell's nearest ground point; a missing level draws the next better one
                let lod = 0;
                while (lod < steps.length && d > steps[lod]) lod++;
                while (lod > 0 && !g.models[lod]) lod--;
                lists[lod].push(c);
                counts[lod] += c.count;
                sign = (sign * 31 + gi * 7919 + ci * 4 + lod) | 0;
            }
            for (let lod = 0; lod < levels; lod++) if (counts[lod])
            {
                picks.push({ g, lod, chunks: lists[lod], count: counts[lod] });
                total += counts[lod];
            }
        }
        // 2. pack the picked props into one stream buffer, cards into their own (only when the pick changed)
        const gl = r.gl;
        if (sign !== this.sign || total !== this.packed)
        {
            const C = CARD_STRIDE;
            let at = 0, cards = 0;
            for (const p of picks) if (p.g.cards[p.lod]) cards += p.count;
            if (this.stream.length < (total - cards) * S) this.stream = new Float32Array(Math.ceil((total - cards) * 1.25) * S);
            if (this.cardStream.length < cards * C) this.cardStream = new Float32Array(Math.ceil(cards * 1.25) * C);
            const cs = this.cardStream;
            let ci = 0;
            for (const p of picks)
            {
                const card = p.g.cards[p.lod], far = this.distance(p.g.kind);
                for (const c of p.chunks)
                {
                    if (!card)
                    {
                        this.stream.set(p.g.data.subarray(c.first * S, (c.first + c.count) * S), at * S);
                        at += c.count;
                        continue;
                    }
                    for (let i = c.first; i < c.first + c.count; i++, ci++)
                    {
                        const o = ci * C;
                        cs.set(p.g.data.subarray(i * S, i * S + 7), o);
                        cs[o + 7] = far;
                        cs.set(card.shape, o + 8);
                        cs.set(card.rgb, o + 12);
                        cs[o + 15] = p.g.height;
                    }
                }
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            gl.bufferData(gl.ARRAY_BUFFER, this.stream.subarray(0, at * S), gl.STREAM_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.cardBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, cs.subarray(0, cards * C), gl.STREAM_DRAW);
            this.cardCount = cards;
            this.sign = sign;
            this.packed = total;
        }
        // 3. one call per group, lod and part; then every card in one call
        let first = 0;
        for (const { g, lod, count } of picks)
        {
            this.drawn += count;
            this.perLod[lod] += count;
            if (g.cards[lod]) continue;
            const far = this.distance(g.kind), fade: [number, number] = [far * (1 - this.o.fade), far];
            const surface = { ...this.o.surface, gloss: this.o.gloss[g.kind] ?? 0 };
            for (const p of g.models[lod]!.parts)
            {
                const instances: Instances = { buffer: this.buffer, first, count, time, wind, swayHeight: g.height, fade, surface };
                if (fill) r.drawInstanced(p.mesh, p.matrix, instances, { maps: p.maps });
                hooks.part?.({ vao: p.mesh.vao, count: p.mesh.count, indices: p.data.indices }, p.matrix, instances);
                this.calls++;
                this.triangles += p.mesh.count / 3 * count;
            }
            first += count;
        }
        if (this.cardCount && fill)
        {
            r.drawCards({ buffer: this.cardBuffer, count: this.cardCount, time, wind, fadePart: this.o.fade, surface: { ...this.o.surface, gloss: 0 } });
            this.calls++;
            this.triangles += this.cardCount * 2;
        }
    }

    destroy() {
        this.renderer.gl.deleteBuffer(this.buffer);
        this.renderer.gl.deleteBuffer(this.cardBuffer);
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

    /** sort a batch into chunks (row order, one per shared grid cell) */
    private group(b: ScatterBatch): Group {
        const S = INSTANCE_STRIDE, size = CELL;
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
            const list = cells.get(key)!;
            let y = 0;
            for (const i of list) { data.set(b.data.subarray(i * S, i * S + S), at * S); at++; y += b.data[i * S + 1]; }
            chunks.push({ cell: this.cell(key, y / list.length, top * 6), first: at - list.length, count: list.length });
        }
        return { name: b.model, kind: b.kind, models: [], cards: [], data, chunks, count: b.count, height: 1 };
    }

    /** the shared cell of a key: centre height averaged, reach (props up, metres) the most of any group */
    private cell(key: number, y: number, reach: number) {
        let c = this.cellOf.get(key);
        if (!c)
        {
            this.cellOf.set(key, c = { index: this.cells.length, x: (key % 8192 - 4096 + .5) * CELL, z: (Math.floor(key / 8192) - 4096 + .5) * CELL, y, n: 0, reach: 0 });
            this.cells.push(c);
        }
        c.y = (c.y * c.n + y) / ++c.n;
        c.reach = Math.max(c.reach, reach);
        return c.index;
    }
}

/** a flat model (no depth, one part) as a card: width and height from its bounds, colour from its first vertex; undefined = not flat */
function card(model: Model): Card | undefined {
    const { min, max } = model.bounds;
    if (max[2] - min[2] >= 1e-4) return undefined;
    const p = model.gltf.meshes[0]?.primitives[0];
    if (!p) return undefined;
    const c = p.colors ?? [1, 1, 1];
    // 3 corners: a triangle (point on top), else a quad
    const top = p.positions.length / 3 === 3 ? 0 : 1;
    return { shape: [Math.max(-min[0], max[0]), min[1], max[1], top], rgb: [c[0], c[1], c[2]] };
}
