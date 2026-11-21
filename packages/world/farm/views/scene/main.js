import '@polywar/viewport';
import { upload } from '@papit/game-mesh';
import { Renderer } from '@polywar/renderer';
import { Scatter } from '@polywar/scatter';
import { generateFarm, groundEdits, fenceSegments, cropRows, DEFAULTS } from '@polywar/farm';
import { fakeGround } from './ground.js';

// the farm on a quick fake terrain: ground edits baked into the patch, everything instanced
const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.layer.gl;
const renderer = new Renderer(demo.layer);
renderer.light.fogDensity = .0015;
renderer.light.fogColor = [.62, .72, .82];
// names: "Barn" (farm folder), "props/village/bale" (path under models), "CommonTree_1" (nature)
const url = (name, lod) => {
    const path = name.includes('/') ? name : NATURE.has(name) ? `nature/${name}` : `buildings/farm/${name}`;
    if (lod && path.startsWith('props/')) return undefined;
    return `/assets/models/${path}${lod ? `.lod${lod}` : ''}.glb`;
};
const TREES = { hedge: ['CommonTree_1', 'CommonTree_2', 'BirchTree_1', 'Bush_1'], bank: ['Willow_1', 'Willow_2', 'Bush_1', 'BushBerries_1'] };
const CROPS = { wheat: { models: ['Wheat'], scale: 1.4, spacing: [.9, .6] }, corn: { models: ['Corn_1', 'Corn_2'], scale: 1, spacing: [1.1, .8] } };
const NATURE = new Set([...Object.values(TREES).flat(), ...Object.values(CROPS).flatMap(c => c.models)]);
const scatter = new Scatter(renderer, url, { distance: { building: 1500, fence: 450, tree: 900, bush: 300, prop: 250, crop: 160, default: 300 } });
const PATCH = 640, STEP = 2;
const PAINT = { soil: [.36, .25, .15], dirt: [.5, .4, .27], gravel: [.55, .53, .5] };
let ground = null, stats = '';

function terrain(height, paint, grass, water) {
    const n = PATCH / STEP + 1, pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), col = new Float32Array(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = -PATCH / 2 + i * STEP, z = -PATCH / 2 + j * STEP, wet = water(x, z);
        const y = wet ? height(x, z) - .3 : height(x, z);
        pos.set([x, y, z], k * 3);
        const dx = height(x + 1, z) - height(x - 1, z), dz = height(x, z + 1) - height(x, z - 1), l = Math.hypot(dx, 2, dz);
        nor.set([-dx / l, 2 / l, -dz / l], k * 3);
        const p = paint(x, z), g = grass(x, z);
        // green where grass grows, dry where the farm asked for none
        let c = p ? PAINT[p] : [.3 + (1 - g) * .2, .45 - (1 - g) * .1, .2];
        if (wet) c = [.2, .4, .6];
        col.set([...c, 1], k * 4);
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let t = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.set([a, c, b, b, c, d], t); t += 6;
    }
    return upload(gl, { positions: pos, normals: nor, colors: col, indices: idx });
}

async function build() {
    const fake = fakeGround(+$('#tseed').value, +$('#hills').value, $('#river').checked);
    const radius = +$('#radius').value, t = performance.now();
    const farm = generateFarm({ x: 0, z: 0, radius, entry: { x: -radius, z: 0 } }, fake, { seed: +$('#seed').value });
    const g = $('#edits').checked ? groundEdits(fake, farm.edits) : { height: fake.height, paint: () => null, grass: () => 1 };
    const t1 = performance.now();
    ground?.destroy?.();
    ground = terrain(g.height, g.paint, g.grass, fake.water);
    const t2 = performance.now();
    // instances: 8 floats x y z scale yaw tint sway _ (shader yaw turns the other way)
    const batches = new Map();
    const add = (model, kind, x, z, y, scale, yaw, sway = 0) => {
        let b = batches.get(model);
        if (!b) batches.set(model, b = { model, kind, list: [] });
        b.list.push(x, y, z, scale, -yaw, 1, sway, 0);
    };
    for (const b of farm.buildings) add(b.asset, 'building', b.x, b.z, g.height(b.x, b.z), 1, b.yaw);
    for (const p of farm.props) add(p.asset, 'prop', p.x, p.z, g.height(p.x, p.z) + (p.lift ?? 0), p.scale, p.yaw);
    const fence = DEFAULTS.fence;
    let segs = 0;
    for (const l of farm.fences) for (const s of fenceSegments(l, fence.length)) { add(fence.asset, 'fence', s.x, s.z, g.height(s.x, s.z), s.length / fence.length, s.yaw); segs++; }
    let r = 1;
    const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (const t of farm.trees) {
        const list = TREES[t.kind], m = list[Math.floor(rand() * list.length)], bush = m.startsWith('Bush');
        add(m, bush ? 'bush' : 'tree', t.x, t.z, g.height(t.x, t.z), bush ? .8 + rand() * .6 : 2 + rand() * 1.4, rand() * 6.28, .4);
    }
    let crops = 0;
    const rows = cropRows(farm, Object.fromEntries(Object.entries(CROPS).map(([k, c]) => [k, c.spacing])));
    for (const [crop, xz] of rows) {
        const c = CROPS[crop];
        for (let i = 0; i < xz.length; i += 3) { add(c.models[Math.floor(rand() * c.models.length)], 'crop', xz[i], xz[i + 1], g.height(xz[i], xz[i + 1]), c.scale * (.9 + rand() * .2), xz[i + 2] + (rand() - .5) * .6, .6); crops++; }
    }
    await scatter.place([...batches.values()].map(b => ({ ...b, data: new Float32Array(b.list), count: b.list.length / 8 })));
    stats = `farm ${(t1 - t).toFixed(0)} ms, ground ${(t2 - t1).toFixed(0)} ms\nbuildings ${farm.buildings.length}, props ${farm.props.length}, fences ${segs}\nfields ${farm.fields.length}, crops ${crops}, trees ${farm.trees.length}\npastures ${farm.pastures.map(p => p.animal).join(' ')}`;
}

for (const el of document.querySelectorAll('aside input')) el.onchange = build;
$('#quality').onchange = e => scatter.set({ quality: e.target.value });
await build();

let frames = 0, clock = 0;
demo.tick = dt => {
    frames++; clock += dt;
    if (clock < .5) return;
    $('#info').value = `${stats}\n${scatter.drawn} drawn, ${scatter.calls} calls, ${(frames / clock).toFixed(0)} fps`;
    frames = clock = 0;
};
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
demo.draw = camera => {
    renderer.begin(camera, [...renderer.light.fogColor.map(c => Math.pow(c, 1 / 2.2)), 1]);
    renderer.draw(ground, I);
    scatter.draw(camera, demo.time);
};
demo.look([-120, 60, 120], [0, 0, 0]);
