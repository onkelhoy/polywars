import type { Batch, Change, Placement, PlacementsJSON } from "./types";

/** stable 32 bit id from text (FNV-1a): the same generation gives the same ids on every client */
export function hashId(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}

/**
 * The one record of placed things (bridges, portals, benches, lamps, fences, ...).
 * Generated sources can be rebuilt from the world seed on each client: send only `changes` then.
 * Free placements (player built) go in `items` and travel as JSON or the compact `pack()`.
 */
export class Placements {
    private items = new Map<number, Placement>();
    private counters = new Map<string, number>();
    changes: Change[] = [];
    /** after any add / remove / move / load */
    onchange?: () => void;

    get size() { return this.items.size; }
    all(): Placement[] { return [...this.items.values()]; }
    get(id: number) { return this.items.get(id); }
    of(source: string) { return this.all().filter(p => p.source === source); }

    /** add one; the id is `hash(source:n)` with n counting per source, so the same build order gives the same ids */
    add(source: string, kind: string, x: number, y: number, z: number, yaw = 0, scale = 1, params?: Record<string, unknown>): Placement {
        const n = this.counters.get(source) ?? 0;
        this.counters.set(source, n + 1);
        let id = hashId(`${source}:${n}`);
        while (this.items.has(id)) id = (id + 1) >>> 0;
        const p: Placement = { id, source, kind, x, y, z, yaw, scale, ...(params ? { params } : {}) };
        this.items.set(id, p);
        return p;
    }

    /** drop every placement of a source (it regenerates) and restart its id counter; changes stay and are applied again by `applyChanges` */
    clear(source: string) {
        for (const [id, p] of this.items) if (p.source === source) this.items.delete(id);
        this.counters.delete(source);
    }

    remove(id: number) {
        const p = this.items.get(id);
        if (!p) return;
        this.items.delete(id);
        this.changes.push({ op: "remove", id, source: p.source });
        this.onchange?.();
    }

    move(id: number, x: number, y: number, z: number, yaw: number) {
        const p = this.items.get(id);
        if (!p) return;
        Object.assign(p, { x, y, z, yaw });
        this.changes = this.changes.filter(c => !(c.op === "move" && c.id === id));
        this.changes.push({ op: "move", id, source: p.source, x, y, z, yaw });
        this.onchange?.();
    }

    /** after a source regenerated: replay the recorded changes on it */
    applyChanges() {
        for (const c of this.changes)
        {
            const p = this.items.get(c.id);
            if (!p) continue;
            if (c.op === "remove") this.items.delete(c.id);
            else Object.assign(p, { x: c.x, y: c.y, z: c.z, yaw: c.yaw });
        }
        this.onchange?.();
    }

    /** instance batches per kind for `@polywar/scatter`: `model(kind)` gives the model name, undefined skips (generator kinds) */
    batches(model: (kind: string) => string | undefined = k => k, scatterKind: (kind: string) => string = () => "built"): Batch[] {
        const by = new Map<string, Placement[]>();
        for (const p of this.items.values()) { const m = model(p.kind); if (m) (by.get(m) ?? by.set(m, []).get(m)!).push(p); }
        return [...by].map(([m, list]) => {
            const data = new Float32Array(list.length * 8);
            list.forEach((p, i) => data.set([p.x, p.y, p.z, p.scale, p.yaw, 1, 0, 1], i * 8));
            return { model: m, kind: scatterKind(list[0].kind), data, count: list.length };
        });
    }

    /** `sources`: only these (e.g. player built ones; generated sources rebuild from the seed) */
    toJSON(sources?: string[]): PlacementsJSON {
        const keep = (s: string) => !sources || sources.includes(s);
        return { version: 1, items: this.all().filter(p => keep(p.source)), changes: this.changes.filter(c => keep(c.source)) };
    }

    /** replaces the given items (by id) and changes */
    load(json: PlacementsJSON) {
        for (const p of json.items) this.items.set(p.id, { ...p });
        this.changes = [...json.changes];
        this.applyChanges();
    }

    /**
     * Compact binary for the network: kind + source tables, then 7 numbers per item (id u32, kind u16, source u16, x y z yaw scale f32).
     * `params` are left out: send generator placements as JSON (few) or rebuild them from the seed.
     */
    pack(sources?: string[]): ArrayBuffer {
        const items = this.all().filter(p => !sources || sources.includes(p.source));
        const kinds = [...new Set(items.map(p => p.kind))], srcs = [...new Set(items.map(p => p.source))];
        const head = new TextEncoder().encode(JSON.stringify({ kinds, sources: srcs }));
        const buf = new ArrayBuffer(8 + head.length + (4 - head.length % 4) % 4 + items.length * 28), v = new DataView(buf);
        v.setUint32(0, head.length, true); v.setUint32(4, items.length, true);
        new Uint8Array(buf, 8, head.length).set(head);
        let o = 8 + head.length + (4 - head.length % 4) % 4;
        for (const p of items)
        {
            v.setUint32(o, p.id, true); v.setUint16(o + 4, kinds.indexOf(p.kind), true); v.setUint16(o + 6, srcs.indexOf(p.source), true);
            [p.x, p.y, p.z, p.yaw, p.scale].forEach((n, i) => v.setFloat32(o + 8 + i * 4, n, true));
            o += 28;
        }
        return buf;
    }

    /** add the items of a `pack()` (same ids) */
    unpack(buf: ArrayBuffer) {
        const v = new DataView(buf), hl = v.getUint32(0, true), n = v.getUint32(4, true);
        const { kinds, sources } = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
        let o = 8 + hl + (4 - hl % 4) % 4;
        for (let i = 0; i < n; i++, o += 28)
        {
            const f = (k: number) => v.getFloat32(o + 8 + k * 4, true);
            const p: Placement = { id: v.getUint32(o, true), kind: kinds[v.getUint16(o + 4, true)], source: sources[v.getUint16(o + 6, true)], x: f(0), y: f(1), z: f(2), yaw: f(3), scale: f(4) };
            this.items.set(p.id, p);
        }
        this.onchange?.();
    }
}
