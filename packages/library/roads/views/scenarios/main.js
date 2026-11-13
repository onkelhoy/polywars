import '@polywar/gallery';
import { gltfFromMesh } from '@polywar/renderer';
import { loadGLTF } from '@papit/game-mesh';
import { merge, bounds } from '@polywar/sweep';
import { SLEEPER_MODEL, bake } from '@polywar/rail';
import { buildWays } from '@polywar/ways';
import { Roads, sampler } from '@polywar/roads';
import { SCENARIOS, ground, N, SIZE } from './scenarios.js';

const $ = s => document.querySelector(s);
const sleeper = (await loadGLTF(`/assets/models/${SLEEPER_MODEL}.glb`)).meshes[0].primitives;

/** flat shaded ground grid (every 2nd node), water cells blue at their surface */
function groundMesh(g) {
    const p = [], n = [], c = [], s = 2, at = (i, j) => [(i / (N - 1) - .5) * SIZE, g.height[j * N + i], (j / (N - 1) - .5) * SIZE];
    const tri = (a, b, d, col) => {
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0]; const l = Math.hypot(nx, ny, nz) || 1;
        for (const q of [a, b, d]) { p.push(...q); n.push(nx / l, ny / l, nz / l); c.push(...col, 1); }
    };
    for (let j = 0; j < N - s; j += s) for (let i = 0; i < N - s; i += s)
    {
        const wet = g.water[j * N + i], col = wet ? [.25, .45, .6] : [.36, .52, .3];
        const a = at(i, j), b = at(i + s, j), d = at(i, j + s), e = at(i + s, j + s);
        if (wet) for (const q of [a, b, d, e]) q[1] += 2.4;
        tri(a, d, b, col); tri(b, d, e, col);
    }
    const positions = new Float32Array(p);
    return { positions, normals: new Float32Array(n), colors: new Float32Array(c), bounds: bounds(positions) };
}

const items = [], info = [];
for (const sc of SCENARIOS)
{
    const g = ground(sc), roads = new Roads(g, { cell: 4 }), byId = new Map(sc.sites.map(s => [s.id, s]));
    roads.build(sc.sites, sc.links.map(([cls, a, b]) => ({ cls, a: byId.get(a), b: byId.get(b) })));
    const heightAt = sampler(g);
    const wet = (x, z) => { const i = Math.round((x / SIZE + .5) * (N - 1)), j = Math.round((z / SIZE + .5) * (N - 1)); return g.water[j * N + i] > 0; };
    const w = buildWays({ ...roads.network, ground: heightAt, wet, surface: (x, z) => heightAt(x, z) + 2.4 });
    const parts = [groundMesh(g)];
    if (w.mesh) parts.push(w.mesh);
    if (w.sleepers.count) parts.push(...sleeper.map(m => bake(m, w.sleepers)));
    items.push({ name: sc.name, group: 'scenarios', kind: 'model', gltf: gltfFromMesh(merge(parts)) });
    const kinds = {}; for (const r of roads.network.roads) for (const s of r.spans) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
    info.push(`${sc.name}: ${roads.network.roads.length} roads, ${roads.network.junctions.length} junctions, spans ${JSON.stringify(kinds)}, ${w.structures.map(s => s.kind).join(' ')}`);
}
$('pw-gallery').items = items;
$('#info').value = info.join('\n');
