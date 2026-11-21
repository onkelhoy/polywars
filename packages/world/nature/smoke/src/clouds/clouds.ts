import type { CloudKind, CloudOptions, Colour, PuffSink, SkyOptions } from "./types";

const WHITE: Colour = [.94, .94, .95];

/**
 * Low poly clouds, like painted ones: a few big round masses (`kind` sets their layout), round lobes only on
 * their upper outer surface, everything flat along one bottom line. Built from still puffs in a `PuffSink`
 * (`@polywar/smoke`), lit as one body per mass. They live until the sink is cleared and drift with its wind.
 */
export class Clouds {
    constructor(private sink: PuffSink) {}

    /** one cloud, `size` m. Kinds: `cumulus` a big lone tower, `fair` a small fluffy one, `bank` wide and low, `overcast` a dense grey layer */
    cloud(at: ArrayLike<number>, size: number, options: CloudOptions = {}) {
        const kind = options.kind ?? "cumulus", density = options.density ?? (kind === "overcast" ? .7 : .2);
        const masses = skeleton(kind, size, options.height ?? 1, (options.lean ?? 0) * size);
        const grey = kind === "overcast" ? .45 + density * .45 : density * .3;
        const colour = options.colour ?? [WHITE[0] - grey * .3, WHITE[1] - grey * .29, WHITE[2] - grey * .25] as Colour;
        const top = kind === "overcast" ? .6 - density * .2 : kind === "bank" ? .85 : 1, bright = 1 - grey * .6;
        let centre = [0, 0, 0];
        const put = (x: number, y: number, z: number, r: number) => this.sink.place([at[0] + x, at[1] + y, at[2] + z], r, {
            colour, bright, top, detail: 0,
            // nothing below the bottom line
            flat: Math.max(.08, Math.min(1, y / r)),
            centre: [at[0] + centre[0], at[1] + centre[1], at[2] + centre[2]],
        });
        for (const m of masses)
        {
            // a core fills it
            centre = [m[0], m[1] - m[3] * .2, m[2]];
            put(m[0], m[1], m[2], m[3] * .95);
            // lobes evenly over the upper surface (fibonacci sphere), none under, none buried in a neighbour
            const n = Math.round(4 + 7 * m[3] / size);
            for (let i = 0; i < n; i++)
            {
                const y = 1 - (i + .5) / n * 2, ring = Math.sqrt(1 - y * y), a = i * 2.39996 + m[0];
                const u = [Math.cos(a) * ring, y, Math.sin(a) * ring];
                if (u[1] < -.3) continue;
                const p = [m[0] + u[0] * m[3] * .62, m[1] + u[1] * m[3] * .62, m[2] + u[2] * m[3] * .62];
                if (masses.some(q => q !== m && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < q[3] * .85)) continue;
                put(p[0], p[1], p[2], m[3] * (.55 + Math.random() * .12));
            }
        }
    }

    /** a sky: `count` clouds round `at` from `near` to `far` m out, kinds mixed by `cover` 0..1 (more = flatter, greyer) */
    sky(at: ArrayLike<number>, options: SkyOptions = {}) {
        const count = options.count ?? 10, near = options.near ?? 1200, far = options.far ?? 3000, cover = options.cover ?? .3;
        for (let i = 0; i < count; i++)
        {
            const a = Math.random() * Math.PI * 2, k = near + Math.random() * (far - near), r = Math.random();
            const kind: CloudKind = r < cover * .6 ? "overcast" : r < cover ? "bank" : r < .55 + cover * .3 ? "fair" : "cumulus";
            const size = kind === "fair" ? 60 + Math.random() * 60 : kind === "cumulus" ? 180 + Math.random() * 200 : 140 + Math.random() * 120;
            this.cloud([at[0] + Math.cos(a) * k, (options.height ?? 220) + Math.random() * 80, at[2] + Math.sin(a) * k], size, { kind, density: cover, lean: (Math.random() - .5) * .8 });
        }
    }
}

/** the big masses a cloud is built on: [x, y, z, radius], y up from its bottom line */
function skeleton(kind: CloudKind, size: number, height: number, lean: number): number[][] {
    const r = () => Math.random(), S = size, out: number[][] = [];
    const add = (x: number, y: number, z: number, radius: number) => out.push([x, y, z, radius * S]);
    if (kind === "cumulus")
    {
        // a base row, shoulders, a body that climbs (and leans), a head
        for (let i = 0; i < 4; i++) { const x = (i / 3 - .5) * 1.6 * S, mid = 1 - Math.abs(i / 3 - .5); add(x, (.24 + .08 * mid) * S, (r() - .5) * .3 * S, .4 + .12 * mid); }
        add(-.6 * S, .62 * S, (r() - .5) * .3 * S, .36); add(.6 * S, .58 * S, (r() - .5) * .3 * S, .34);
        add(lean * .3, .95 * S * height, 0, .52); add(lean * .65, 1.38 * S * height, (r() - .5) * .2 * S, .46);
        for (let i = 0; i < 3; i++) add(lean + (i - 1) * .34 * S, (1.78 + (i === 1 ? .16 : 0)) * S * height, (r() - .5) * .3 * S, .34 + (i === 1 ? .06 : 0));
    }
    else if (kind === "fair")
    {
        add(0, .3 * S, 0, .5); add(-.45 * S, .2 * S, (r() - .5) * .3 * S, .34); add(.45 * S, .2 * S, (r() - .5) * .3 * S, .36);
        if (r() < .5) add((r() - .5) * .4 * S, .55 * S, 0, .3);
    }
    else if (kind === "bank")
    {
        for (let i = 0; i < 7; i++) { const t = i / 6 - .5, mid = 1 - Math.abs(t) * 2; add(t * 3.2 * S, (.18 + .1 * mid) * S, (r() - .5) * .5 * S, .3 + .15 * mid); }
        for (let i = 0; i < 2; i++) add((r() - .5) * 1.2 * S, .5 * S, (r() - .5) * .3 * S, .3);
    }
    else
    {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) add((i / 3 - .5) * 3 * S + (r() - .5) * .3 * S, (.16 + r() * .06) * S, (j / 2 - .5) * 2 * S, .42 + r() * .08);
    }
    return out;
}
