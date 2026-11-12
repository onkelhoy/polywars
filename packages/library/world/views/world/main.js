import '@polywar/3d-demo';
import { Renderer } from '@polywar/renderer';
import { loadNature } from '@polywar/nature';
import { MAPS } from '@polywar/terrain';
import { BIOMES, linear } from '@polywar/terrain-material';
import { WaterScreen } from '@polywar/water';
import { World } from '@polywar/world';

const $ = s => document.querySelector(s);
const demo = $('pw-3d-demo');
await demo.ready;
const layer = demo.layer;
const renderer = new Renderer(layer);
renderer.light.fogDensity = .0005;
renderer.light.fogColor = linear('#a9bfd3');
renderer.light.sunDirection = [.45, .64, .62];
const waterScreen = new WaterScreen(layer);
const nature = await loadNature();
const hash = decodeURIComponent(location.hash.slice(1));
const world = new World(layer, renderer, nature, hash || {});
window.world = world;
world.profile(true);
const { terrain, ecosystem: eco } = world;

// ---- nature sliders: [path, min, max, step] into the ecosystem options ----
const sliders = [
    ['density', 0, 4, .05], ['season.autumn', 0, 1, .01], ['season.snow', 0, .5, .01], ['cover.blend', 0, 200, 2],
    ['around.ring', 1, 3, .05], ['around.taller', 0, 2, .05], ['around.bare', 0, 1, .01],
    ['cities.clear', 0, 2, .05], ['cities.grass', 0, 1, .01], ['cities.height', 0, 1, .01],
];
const read = path => path.split('.').reduce((o, k) => o?.[k], eco.options);
let timer;
const later = f => { clearTimeout(timer); timer = setTimeout(f, 200); };
const syncs = [];
for (const [path, min, max, step] of sliders)
{
    const label = document.createElement('label'), input = Object.assign(document.createElement('input'), { type: 'range', min, max, step }), span = document.createElement('span');
    label.append(path, input, span);
    $('#nature').append(label);
    const sync = () => { input.value = read(path); span.textContent = +Number(read(path)).toFixed(3); };
    syncs.push(sync);
    input.oninput = () => {
        span.textContent = input.value;
        later(() => {
            const [head, key] = path.split('.');
            eco.set(key ? { [head]: { ...eco.options[head], [key]: Number(input.value) } } : { [head]: Number(input.value) });
        });
    };
}

// ---- selects / seeds ----
$('#map').innerHTML = Object.keys(MAPS).map(k => `<option>${k}</option>`).join('');
const refresh = () => {
    $('#terrain-seed').value = terrain.seed;
    $('#terrain-quality').value = terrain.options.quality;
    $('#eco-seed').value = eco.seed;
    syncs.forEach(f => f());
    code();
};
const code = () => {
    const c = world.code;
    if (document.activeElement !== $('#code')) $('#code').value = c;
    history.replaceState(null, '', c === 't1~e1' ? location.pathname : '#' + c);
};
$('#terrain-seed').onchange = () => terrain.set({ seed: Math.max(0, Math.floor(Number($('#terrain-seed').value))) });
$('#terrain-random').onclick = () => terrain.reseed();
$('#map').onchange = () => terrain.load({ ...MAPS[$('#map').value], seed: terrain.seed });
$('#terrain-quality').onchange = () => terrain.set({ quality: $('#terrain-quality').value, settings: {} });
$('#eco-seed').onchange = () => eco.set({ seed: Math.max(0, Math.floor(Number($('#eco-seed').value))) });
$('#eco-random').onclick = () => eco.reseed();
$('#apply').onclick = () => { try { world.load($('#code').value); } catch (e) { $('#info').value = String(e); } };
$('#code').onkeydown = e => { if (e.key === 'Enter') $('#apply').onclick(); };
$('#copy').onclick = () => navigator.clipboard?.writeText(world.code).catch(() => { });
$('#quality').onchange = () => world.setView({ quality: $('#quality').value });
$('#style').onchange = () => world.setView({ style: $('#style').value });
$('#grass').onchange = () => world.setView({ grass: $('#grass').checked });
$('#props').onchange = () => world.setView({ props: $('#props').checked });
$('#wind').oninput = () => world.scatter.set({ wind: { ...world.scatter.options.wind, strength: Number($('#wind').value) } });
$('#layer').onchange = () => minimap();

// ---- minimap: biomes or a cover map ----
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const minimap = () => {
    const d = terrain.data, c = eco.cover, kind = $('#layer').value;
    if (!d || !c) return;
    const m = kind === 'biome' ? d.n : c.m, canvas = $('#minimap');
    Object.assign(canvas, { width: m, height: m });
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(m, m), palette = BIOMES.map(b => hex(terrain.material.look.colors[b]));
    const grid = kind === 'biome' ? null : kind === 'trees' ? c.trees : c[kind];
    let top = 1e-6;
    if (grid) for (const v of grid) top = Math.max(top, v);
    for (let k = 0; k < m * m; k++)
    {
        if (!grid) { img.data.set([...palette[d.biome[k]], 255], k * 4); continue; }
        const v = grid[k] / top, water = d.water[Math.round(Math.floor(k / m) / (m - 1) * (d.n - 1)) * d.n + Math.round(k % m / (m - 1) * (d.n - 1))];
        img.data.set(water ? [30, 50, 90, 255] : [v * 255, v * 230, v * 120, 255], k * 4);
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#e8443a';
    for (const t of terrain.cities) ctx.fillRect((t.x / d.size + .5) * m - 1.5, (t.z / d.size + .5) * m - 1.5, 3, 3);
};

// ---- going places: high, or standing in the grass ----
const size = () => terrain.options.size;
const overview = () => demo.look([size() * .45, size() * .5, size() * .7], [0, 0, 0]);
const stand = (x, z) => {
    const y = terrain.heightAt(x, z) + 1.7;
    demo.look([x, y, z], [x + 12, terrain.heightAt(x + 12, z) + 1.2, z + 6]);
};
/** a land spot where `score(x, z)` is best, from a seeded handful of tries */
const find = score => {
    let best = null, top = -Infinity, s = 1;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4000; i++)
    {
        const x = (rand() - .5) * size() * .9, z = (rand() - .5) * size() * .9;
        if (terrain.waterAt(x, z)) continue;
        const v = score(x, z);
        if (v > top) { top = v; best = [x, z]; }
    }
    return best;
};
const at = (grid, x, z) => { const c = eco.cover, m = c.m, i = Math.round((x / c.size + .5) * (m - 1)), j = Math.round((z / c.size + .5) * (m - 1)); return grid[j * m + i]; };
$('#overview').onclick = overview;
$('#forest').onclick = () => { const p = find((x, z) => at(eco.cover.trees, x, z) + Math.random() * 20); if (p) stand(...p); };
$('#meadow').onclick = () => { const p = find((x, z) => at(eco.cover.flowers, x, z) * at(eco.cover.density, x, z) - at(eco.cover.trees, x, z) * .002 + Math.random() * .05); if (p) stand(...p); };
$('#dry').onclick = () => { const p = find((x, z) => { const d = at(eco.cover.dry, x, z), g = at(eco.cover.density, x, z); return -Math.abs(d - .6) * 2 + Math.min(g, .4) + Math.random() * .05; }); if (p) stand(...p); };
let town = -1;
$('#city').onclick = () => { const c = terrain.cities; if (!c.length) return; town = (town + 1) % c.length; stand(c[town].x - c[town].radius * 1.1, c[town].z); };
$('#minimap').onclick = e => {
    const r = e.target.getBoundingClientRect();
    stand(((e.clientX - r.left) / r.width - .5) * size(), ((e.clientY - r.top) / r.height - .5) * size());
};

// ---- play: first person on foot where the camera is (Esc back to the editor) ----
demo.walking = { ground: (x, z) => terrain.groundAt(x, z) };
$('#play').onclick = () => {
    const cam = demo.camera?.position;
    if (cam && Math.abs(cam[0]) > size() / 2 || cam && Math.abs(cam[2]) > size() / 2) stand(0, 0);
    demo.mode = 'walk';
};
demo.addEventListener('walkexit', () => world.grass.push([]));

let first = true;
world.onchange = () => { minimap(); refresh(); if (first) { first = false; overview(); } };
terrain.onprogress = p => { $('#info').value = `terrain · ${p.stage} ${(p.done * 100).toFixed(0)}%`; };

// ---- loop ----
let frames = 0, clock = 0, rate = 0;
demo.tick = dt => {
    // the walker bends the grass round the feet
    const feet = demo.mode === 'walk' && demo.layer.camera?.controllers?.[0]?.feet;
    if (feet) world.grass.push([[feet.x, feet.y, feet.z, .6]]);
    frames++; clock += dt;
    if (clock < .5) return;
    rate = frames / clock; frames = clock = 0;
    if (terrain.generating) return;
    const cam = demo.camera?.position, counts = Object.entries(eco.counts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ');
    $('#info').value = `${eco.total} props (${eco.batches.length} models) grown in ${eco.time.toFixed(0)} ms\n${counts}\n`
        + `${world.scatter.drawn} props drawn (lod ${world.scatter.perLod.join(" / ")}) · ${Math.round(world.scatter.triangles / 1000)}k tris · ${world.scatter.calls} calls · ${world.grass.drawn} tufts (${world.grass.count} planted)\n`
        + Object.entries(world.stats).map(([k, s]) => `${k} ${s.calls} calls ${Math.round(s.triangles / 1000)}k tris ${s.ms.toFixed(1)} ms`).join(' · ') + '\n'
        + `${demo.layer.width}×${demo.layer.height} px · ${rate.toFixed(0)} fps · ${cam ? terrain.biomeAt(cam[0], cam[2]) ?? '-' : '-'} below`;
};
demo.draw = camera => {
    const under = camera.worldPosition && terrain.underwater(camera.worldPosition);
    renderer.begin(camera, under ? [...linear(terrain.water.look.under.shallow).map(c => Math.pow(c, 1 / 2.2)), 1] : [...renderer.light.fogColor.map(c => Math.pow(c, 1 / 2.2)), 1]);
    world.draw(camera, renderer.light, demo.time);
    waterScreen.draw(!!under, demo.time, terrain.water.look.under.shallow);
};
refresh();
overview();
