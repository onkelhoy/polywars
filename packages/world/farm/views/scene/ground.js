// quick fake terrain for the view only: rolling hills, a tilt, a river line
import { Random } from '@papit/random';

export function fakeGround(seed, hills, river) {
    const r = new Random(seed), waves = [];
    for (let i = 0; i < 6; i++) waves.push({ a: r.float(0, Math.PI * 2), f: r.float(.004, .02) * (1 + i * .5), p: r.float(0, 7), h: hills / (1 + i) });
    const tilt = [r.float(-.04, .04), r.float(-.04, .04)];
    // river: a wavy line across the patch
    const ra = r.float(0, Math.PI), rc = [Math.cos(ra), Math.sin(ra)], ro = r.float(-120, 120);
    const riverD = (x, z) => (x * -rc[1] + z * rc[0]) - ro - Math.sin((x * rc[0] + z * rc[1]) * .015) * 25;
    const height = (x, z) => {
        let h = x * tilt[0] + z * tilt[1];
        for (const w of waves) h += Math.sin((x * Math.cos(w.a) + z * Math.sin(w.a)) * w.f + w.p) * w.h;
        if (river) { const d = Math.abs(riverD(x, z)); if (d < 20) h -= (1 - d / 20) ** 2 * 4; }
        return h;
    };
    return { height, water: (x, z) => river && Math.abs(riverD(x, z)) < 6 };
}
