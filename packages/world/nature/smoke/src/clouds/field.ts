import { Clouds } from "./clouds";
import type { CloudFieldOptions, CloudKind, CloudWeather, PuffSink } from "./types";

/**
 * Hero clouds from the weather: a seeded cloud chance per cell (cells ride the wind `drift`), each one shows when
 * the cover there passes its own threshold and grows from nothing as it rises past it, so clouds form and dissolve.
 * The kind follows the weather (fair puffs, towers, storms with anvils, overcast sheets). Rebuilds its sink (a
 * `Smoke` of its own, wind 0) a few times a second with the same shapes.
 */
export class CloudField {
    readonly o: Required<CloudFieldOptions>;
    private clouds: Clouds;
    private wait = 0;
    /** clouds built last time */
    count = 0;

    constructor(private sink: PuffSink & { clear(): void }, private weather: CloudWeather, options: CloudFieldOptions = {}) {
        this.o = { cell: 2500, reach: 5, seed: 1, rate: 8, size: 1, ...options };
        this.clouds = new Clouds(sink);
    }

    /** `eye` the camera, `drift` how far the weather has blown (m) */
    update(dt: number, eye: ArrayLike<number>, drift: ArrayLike<number>) {
        this.wait -= dt;
        if (this.wait > 0) return;
        this.wait = 1 / this.o.rate;
        const { cell, reach, size } = this.o;
        this.sink.clear();
        this.count = 0;
        // cells in the blown frame: a cloud keeps its humidity as it travels
        const fx = Math.floor((eye[0] - drift[0]) / cell), fz = Math.floor((eye[2] - drift[1]) / cell);
        for (let j = -reach; j <= reach; j++) for (let i = -reach; i <= reach; i++)
        {
            const ci = fx + i, cj = fz + j, rnd = random(hash(ci, cj, this.o.seed));
            const x = (ci + .15 + rnd() * .7) * cell + drift[0], z = (cj + .15 + rnd() * .7) * cell + drift[1];
            const w = this.weather(x, z), need = rnd(), lean = rnd() - .5, pick = rnd();
            const kind = kindOf(w.kind, pick);
            if (!kind) continue;
            // grows in from 0 as the cover passes this cell's threshold
            const grow = Math.min(1, Math.max(0, (w.cover * 1.15 - need) / .2));
            if (grow <= .02) continue;
            const base = SIZE[kind], s = (base[0] + pick * (base[1] - base[0])) * size * (.25 + .75 * grow);
            const shape = random(hash(ci, cj, this.o.seed + 99));
            this.clouds.cloud([x, w.base, z], s, { kind, density: w.grey, lean: lean * (kind === "storm" ? 1.2 : .8), height: kind === "storm" ? 1 : .8 + grow * .6, random: shape });
            this.count++;
        }
    }
}

const SIZE: Record<CloudKind, [number, number]> = { fair: [90, 180], cumulus: [260, 520], storm: [1100, 1700], overcast: [300, 500], bank: [200, 320] };

function kindOf(weather: string, pick: number): CloudKind | null {
    switch (weather)
    {
        case "fair": return pick < .8 ? "fair" : "cumulus";
        case "towering": return pick < .7 ? "cumulus" : "fair";
        case "storm": return pick < .35 ? "storm" : pick < .75 ? "cumulus" : "overcast";
        case "overcast": return pick < .7 ? "overcast" : "bank";
        default: return null;
    }
}

const hash = (i: number, j: number, s: number) => (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(s, 83492791)) >>> 0;
/** mulberry32 */
function random(seed: number) {
    let a = seed || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
