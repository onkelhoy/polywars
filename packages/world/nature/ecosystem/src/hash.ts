/** What grass does at a prop: 0 keep, 1 none (under it), 2 ring (taller around, or a bare spot) */
export const GRASS_MODE = { keep: 0, none: 1, ring: 2 } as const;

/**
 * Placed props in a grid of `cell` metre buckets: x z, `solid` (ground it covers), `space` (room it keeps),
 * `canopy` (radius), group index, grass mode, bare flag.
 */
export class PropHash {
    readonly x: number[] = []; readonly z: number[] = [];
    readonly solid: number[] = []; readonly space: number[] = []; readonly canopy: number[] = [];
    readonly group: number[] = []; readonly grass: number[] = []; readonly bare: boolean[] = [];
    /** biggest `space`, `canopy` and `solid` so far: how far a search must reach */
    reach = 0;
    private buckets = new Map<number, number[]>();

    constructor(readonly cell = 6) { }

    get count() { return this.x.length; }

    private key(i: number, j: number) { return (i + 32768) * 65536 + (j + 32768); }

    add(x: number, z: number, solid: number, space: number, canopy: number, group: number, grass: number, bare: boolean) {
        const id = this.x.length;
        this.x.push(x); this.z.push(z); this.solid.push(solid); this.space.push(space); this.canopy.push(canopy);
        this.group.push(group); this.grass.push(grass); this.bare.push(bare);
        this.reach = Math.max(this.reach, space, canopy, solid);
        const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
        let b = this.buckets.get(k);
        if (!b) this.buckets.set(k, b = []);
        b.push(id);
        return id;
    }

    /** calls `f(id, distance)` for every prop within `r` metres; stop by returning true */
    near(x: number, z: number, r: number, f: (id: number, d: number) => boolean | void) {
        const c = this.cell, i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        {
            const b = this.buckets.get(this.key(i, j));
            if (!b) continue;
            for (const id of b)
            {
                const d = Math.hypot(this.x[id] - x, this.z[id] - z);
                if (d <= r && f(id, d)) return true;
            }
        }
        return false;
    }
}
