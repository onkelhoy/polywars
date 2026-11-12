import '@polywar/3d-demo';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer } from '@polywar/renderer';
import { Grass } from '@polywar/grass';
import { BIOMES, DEFAULTS, MAPS, Terrain } from '@polywar/terrain';
import { TERRAIN_LOOKS, linear } from '@polywar/terrain-material';

const $ = s => document.querySelector(s);
const demo = $('pw-3d-demo');
await demo.ready;
const layer = demo.layer;
const renderer = new Renderer(layer);
renderer.light.fogDensity = .00012;
renderer.light.fogColor = [.62, .72, .82];
const terrain = new Terrain(layer);
const marker = upload(layer.gl, new MeshBuilder().sphere([.95, .3, .2], {}, 1).build());
let grass;

// ---- tweaks: [path, min, max, step] into the terrain options; booleans have no range ----
const numbers = [
    ['size', 256, 8192, 64], ['height', 20, 2000, 10], ['sea', 0, .6, .01], ['settings.resolution', 64, 1024, 64], ['settings.droplets', 0, 3, .05],
    ['edge.width', 0, 1, .01], ['edge.direction', 0, 360, 1], ['edge.noise', 0, 2, .05], ['edge.level', 0, .6, .01],
    ['base.scale', 50, 4000, 10], ['base.height', 0, 1, .01], ['base.octaves', 1, 8, 1], ['base.gain', .1, .9, .01], ['base.lacunarity', 1.5, 3, .05], ['base.warp', 0, 3, .05],
    ['hills.scale', 20, 1500, 10], ['hills.height', 0, .6, .01],
    ['mountains.coverage', 0, 1, .01], ['mountains.scale', 100, 5000, 10], ['mountains.ridge', 50, 3000, 10], ['mountains.height', 0, 1.5, .01], ['mountains.sharpness', .5, 5, .05], ['mountains.octaves', 1, 8, 1],
    ['plateaus.coverage', 0, 1, .01], ['plateaus.scale', 100, 4000, 10], ['plateaus.level', 0, 1, .01], ['plateaus.sharpness', .005, .3, .005], ['plateaus.steps', 0, 8, 1],
    ['erosion.lifetime', 4, 120, 1], ['erosion.inertia', 0, .9, .01], ['erosion.capacity', .5, 16, .1], ['erosion.minCapacity', 0, .1, .001], ['erosion.erode', 0, 1, .01],
    ['erosion.deposit', 0, 1, .01], ['erosion.evaporate', .001, .1, .001], ['erosion.gravity', .5, 20, .1], ['erosion.radius', 1, 60, 1],
    ['rivers.enabled'], ['rivers.catchment', 10000, 2000000, 10000], ['rivers.width', 1, 30, .5], ['rivers.maxWidth', 2, 120, 1], ['rivers.depth', 0, 10, .1], ['rivers.length', 0, 2000, 10], ['rivers.cut', 0, 100, 1],
    ['lakes.depth', 0, 50, .5], ['lakes.area', 0, 50000, 100], ['lakes.level', 0, 1, .01],
    ['climate.temperature', 0, 1, .01], ['climate.moisture', 0, 1, .01], ['climate.scale', 100, 8000, 50], ['climate.variation', 0, 1, .01], ['climate.lapse', 0, 1.5, .01],
    ['climate.reach', 0, 1000, 5], ['climate.gradient.direction', 0, 360, 1], ['climate.gradient.strength', 0, 1, .01],
    ['biomes.beach.height', 0, 30, .5], ['biomes.beach.width', 0, 300, 5], ['biomes.mountain.height', 0, 1, .01], ['biomes.mountain.slope', 0, 1, .01], ['biomes.snow', 0, 1, .01],
    ['biomes.hills', 0, 1, .01], ['biomes.hot', 0, 1, .01], ['biomes.desert', 0, 1, .01], ['biomes.savanna', 0, 1, .01], ['biomes.forest', 0, 1, .01],
    ['cities.count', 0, 30, 1], ['cities.radius', 10, 400, 5], ['cities.spacing', 0, 2000, 10], ['cities.maxSlope', .01, .5, .01], ['cities.flatten', 0, 1, .05], ['cities.water', 0, 2, .05],
    ['mesh.detail', .02, 1, .01], ['mesh.adaptive', 0, 1, .01], ['lod.levels', 1, 6, 1], ['lod.distance', 50, 2000, 10], ['lod.factor', 1.5, 6, .1], ['mesh.chunk', 16, 512, 16], ['mesh.edges', 0, 10, .1], ['mesh.skirt', 0, 20000, 100],
    ['look.variation', 0, .3, .01], ['look.flat'], ['look.bands', 0, 6, 1], ['look.lighting.wrap', -1, 1, .05], ['look.lighting.steepness', .5, 4, .05],
    ['look.rock.slope', 0, 1, .01], ['look.rock.softness', 0, .3, .01], ['look.snow.height', 0, 2000, 5], ['look.snow.softness', 0, 200, 1], ['look.snow.slope', 0, 1, .01],
    ['water.opacity', 0, 1, .01], ['water.clarity', .5, 30, .5], ['water.sky', 0, 1, .01], ['water.sparkle.strength', 0, 2, .05], ['water.sparkle.size', 0, 1, .01], ['water.sparkle.scale', 1, 30, .5], ['water.sparkle.far', 0, 1000, 10],
    ['water.foam.width', 0, 80, 1], ['water.foam.spacing', 1, 30, .5], ['water.foam.speed', 0, 1, .01], ['water.foam.amount', 0, 1, .01], ['water.foam.shore', 0, 10, .1], ['water.foam.far', 0, 2000, 10], ['water.streaks.amount', 0, 1, .01], ['water.streaks.length', 1, 60, 1], ['water.streaks.width', .2, 5, .1],
    ['water.under.caustics', 0, 2, .05], ['look.contours', 0, 100, 1],
    ['sun.elevation', 5, 90, 1], ['sun.azimuth', 0, 360, 1], ['fog', 0, 6, .05],
];
const colors = [...BIOMES.map(b => 'look.colors.' + b), 'look.rock.color', 'look.snow.color', 'water.shallow', 'water.deep', 'water.fresh.shallow', 'water.fresh.deep', 'water.foam.color', 'water.under.color'];
const sun = { elevation: 40, azimuth: 35 };

/** effective value: the option, else (look) the material's current look */
const read = path => {
    const keys = path.split('.');
    if (keys[0] === 'sun') return sun[keys[1]];
    if (keys[0] === 'fog') return renderer.light.fogDensity * 1e4;
    const head = keys[0] === 'look' ? terrain.material.look : keys[0] === 'water' ? terrain.water.look : keys[0] === 'settings' ? terrain.options.q : null;
    let v = head ?? terrain.options;
    for (const k of head ? keys.slice(1) : keys) v = v?.[k];
    return v;
};
const write = (path, value) => {
    const [head, ...rest] = path.split('.');
    if (head === 'sun') { sun[rest[0]] = value; return light(); }
    if (head === 'fog') { renderer.light.fogDensity = value / 1e4; return; }
    if (!rest.length) return terrain.set({ [head]: value });
    const root = structuredClone(terrain.options[head]) ?? {};
    let v = root;
    // a look field starts from what the material shows now
    let shown = head === 'water' ? terrain.water.look : terrain.material.look;
    for (const k of rest.slice(0, -1)) { shown = shown?.[k]; v = v[k] ??= structuredClone((head === 'look' || head === 'water') && shown ? shown : {}); }
    v[rest.at(-1)] = value;
    terrain.set({ [head]: root });
};

const inputs = [];
const group = name => {
    let d = $(`#numbers details[data-group="${name}"]`);
    if (!d) { d = Object.assign(document.createElement('details'), { innerHTML: `<summary>${name}</summary>` }); d.dataset.group = name; $('#numbers').append(d); }
    return d;
};
let timer;
const later = f => { clearTimeout(timer); timer = setTimeout(f, 120); };
for (const [path, min, max, step] of numbers)
{
    const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span');
    const bool = min === undefined, parts = path.split('.');
    Object.assign(input, bool ? { type: 'checkbox' } : { type: 'range', min, max, step });
    label.append(parts.slice(parts[0] === 'look' && parts.length > 2 ? 1 : parts.length > 1 ? 1 : 0).join('.') || path, input);
    if (!bool) label.append(span);
    const sync = () => { const v = read(path); bool ? input.checked = !!v : (input.value = v, span.textContent = +Number(v).toFixed(4)); };
    input.oninput = () => {
        const v = bool ? input.checked : Number(input.value);
        span.textContent = +v.toFixed(4);
        // looks are instant, the rest regenerates (or remeshes) after a short pause
        if (parts[0] === 'look' || parts[0] === 'water' || parts[0] === 'sun' || parts[0] === 'fog') { write(path, v); code(); }
        else later(() => { write(path, v); code(); });
    };
    inputs.push(sync);
    group(parts.length > 1 ? parts[0] : 'map').append(label);
}
const colorGroup = Object.assign(document.createElement('details'), { innerHTML: '<summary>biomes</summary>', open: true });
$('#colors').append(colorGroup);
for (const path of colors)
{
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'color';
    label.append(path.replace('look.colors.', '').replace('look.', ''), input);
    inputs.push(() => input.value = read(path));
    input.oninput = () => { write(path, input.value); code(); };
    colorGroup.append(label);
}

// ---- selects ----
$('#map').innerHTML = Object.keys(MAPS).map(k => `<option>${k}</option>`).join('');
$('#look').innerHTML = Object.keys(TERRAIN_LOOKS).map(k => `<option>${k}</option>`).join('');
const selects = () => {
    const o = terrain.options;
    $('#seed').value = o.seed;
    $('#quality').value = o.quality;
    $('#edge').value = o.edge.type;
    $('#shape').value = o.edge.shape;
    $('#erosion').checked = o.erosion.enabled;
    $('#debug').value = terrain.material.look.debug ?? '';
};
$('#seed').onchange = () => { terrain.set({ seed: Math.max(0, Math.floor(Number($('#seed').value))) }); code(); };
$('#random').onclick = () => { terrain.reseed(); selects(); code(); };
$('#map').onchange = () => { const seed = terrain.seed; terrain.load({ ...MAPS[$('#map').value], seed }); refresh(); overview(); };
$('#quality').onchange = () => { terrain.set({ quality: $('#quality').value, settings: {} }); refresh(); };
$('#edge').onchange = () => { terrain.set({ edge: { ...terrain.options.edge, type: $('#edge').value } }); code(); };
$('#shape').onchange = () => { terrain.set({ edge: { ...terrain.options.edge, shape: $('#shape').value } }); code(); };
$('#erosion').onchange = () => { terrain.set({ erosion: { ...terrain.options.erosion, enabled: $('#erosion').checked } }); code(); };
$('#look').onchange = () => { const { sea, ...look } = TERRAIN_LOOKS[$('#look').value]; terrain.set({ look: { ...look, debug: $('#debug').value } }); refresh(); };
$('#debug').onchange = () => { terrain.set({ look: { ...terrain.options.look, debug: $('#debug').value } }); code(); minimap(); };

// ---- share code (live in the url) and settings json ----
const code = () => {
    const c = terrain.code;
    if (document.activeElement !== $('#code')) $('#code').value = c;
    history.replaceState(null, '', !c.includes('.') ? location.pathname : '#' + c);
};
const refresh = () => { selects(); inputs.forEach(f => f()); code(); };
const load = text => {
    try { terrain.load(text); } catch (e) { $('#text').value = String(e); return; }
    refresh();
};
const json = () => JSON.stringify(terrain, null, 2);
const download = (name, blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
};
$('#export').onclick = () => download(`terrain-${terrain.seed}.json`, new Blob([json()], { type: 'application/json' }));
$('#copy').onclick = async () => { $('#text').value = json(); await navigator.clipboard?.writeText(json()).catch(() => { }); };
$('#import').onclick = () => $('#file').click();
$('#file').onchange = async () => { const f = $('#file').files[0]; if (f) { const t = await f.text(); $('#text').value = t; load(t); } $('#file').value = ''; };
$('#copy-code').onclick = () => navigator.clipboard?.writeText(terrain.code).catch(() => { });
$('#apply-code').onclick = () => load($('#code').value);
$('#code').onkeydown = e => { if (e.key === 'Enter') load($('#code').value); };
$('#apply').onclick = () => load($('#text').value);
$('#reset').onclick = () => load({});

// ---- maps as images: 16 bit height in red + green, biome colours; the data json has every grid ----
const image = kind => {
    const d = terrain.data, n = d.n, c = Object.assign(document.createElement('canvas'), { width: n, height: n }), ctx = c.getContext('2d');
    const img = ctx.createImageData(n, n), o = terrain.options, palette = BIOMES.map(b => hex(terrain.material.look.colors[b]));
    for (let k = 0; k < n * n; k++)
    {
        if (kind === 'height')
        {
            const v = Math.round(Math.min(1, Math.max(0, (d.height[k] + o.height * .2) / (o.height * 1.2))) * 65535);
            img.data.set([v >> 8, v & 255, 0, 255], k * 4);
        }
        else img.data.set([...palette[d.biome[k]], 255], k * 4);
    }
    ctx.putImageData(img, 0, 0);
    return c;
};
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
$('#png-height').onclick = () => image('height').toBlob(b => download(`terrain-${terrain.seed}-height.png`, b));
$('#png-biome').onclick = () => image('biome').toBlob(b => download(`terrain-${terrain.seed}-biome.png`, b));
$('#data').onclick = () => {
    const d = terrain.data, grids = {};
    for (const [k, v] of Object.entries(d)) grids[k] = ArrayBuffer.isView(v) ? Array.from(v, x => Math.round(x * 100) / 100) : v;
    download(`terrain-${terrain.seed}-data.json`, new Blob([JSON.stringify({ settings: terrain.toJSON(), biomes: BIOMES, ...grids })], { type: 'application/json' }));
};

// ---- minimap: biome colours, cities, click to fly there ----
const minimap = () => {
    if (!terrain.data) return;
    const src = image('biome'), m = $('#minimap'), s = 256;
    Object.assign(m, { width: s, height: s });
    const ctx = m.getContext('2d');
    ctx.drawImage(src, 0, 0, s, s);
    ctx.fillStyle = '#e8443a';
    for (const c of terrain.cities) { ctx.beginPath(); ctx.arc((c.x / terrain.options.size + .5) * s, (c.z / terrain.options.size + .5) * s, 3, 0, 7); ctx.fill(); }
};
$('#minimap').onclick = e => {
    const r = e.target.getBoundingClientRect(), size = terrain.options.size;
    const x = ((e.clientX - r.left) / r.width - .5) * size, z = ((e.clientY - r.top) / r.height - .5) * size;
    focus(x, z, size * .08);
};

// ---- camera ----
const overview = () => { const s = terrain.options.size; demo.look([s * .45, s * .5, s * .7], [0, 0, 0]); };
const focus = (x, z, d) => { const y = Math.max(terrain.heightAt(x, z), terrain.options.sea * terrain.options.height); demo.look([x + d * .6, y + d * .6, z + d], [x, y, z]); };
let cityIndex = -1;
$('#overview').onclick = overview;
$('#city').onclick = () => { const c = terrain.cities; if (!c.length) return; cityIndex = (cityIndex + 1) % c.length; focus(c[cityIndex].x, c[cityIndex].z, c[cityIndex].radius * 3); };

// ---- grass on grassland around the first city: terrain heights and biomes drive the planting ----
const plantGrass = () => {
    grass?.destroy(); grass = undefined;
    const c = terrain.cities[0];
    if (!$('#grass').checked || !c) return;
    grass = new Grass(layer, { quality: 'low' });
    const r = 40;
    grass.plant({
        area: { x: c.x - r, z: c.z - r, width: r * 2, depth: r * 2 }, seed: 1,
        height: (x, z) => terrain.heightAt(x, z),
        mask: (x, z) => ['grassland', 'plateau', 'savanna'].includes(terrain.biomeAt(x, z)) ? 1 : 0,
    });
};
$('#grass').onchange = plantGrass;

const light = () => {
    const e = sun.elevation * Math.PI / 180, a = sun.azimuth * Math.PI / 180;
    renderer.light.sunDirection = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
    renderer.light.fogColor = linear('#a9bfd3');
};

terrain.onprogress = p => { $('#progress').value = p.done; $('#info').value = `generating · ${p.stage} ${(p.done * 100).toFixed(0)}%`; };
let generatedAt = 0, started = performance.now();
terrain.onchange = () => { generatedAt = performance.now() - started; $('#progress').value = 1; minimap(); plantGrass(); inputs.forEach(f => f()); };
const set = terrain.set.bind(terrain);
terrain.set = o => { started = performance.now(); return set(o); };

// ---- loop ----
let frames = 0, clock = 0, rate = 0;
demo.tick = dt => {
    frames++; clock += dt;
    if (clock > .5) { rate = frames / clock; frames = clock = 0; }
    if (terrain.generating) return;
    const d = terrain.data, cam = demo.camera?.position;
    const t = terrain.triangles;
    const counts = d ? `${d.n - 1}² cells · ${(d.cell).toFixed(1)} m · ${terrain.cities.length} cities · ${terrain.rivers.length} rivers\n${(t.used / 1000).toFixed(0)}k triangles drawn · full grid ${(t.full / 1000).toFixed(0)}k (${(t.used / t.full * 100).toFixed(1)}%)` : '';
    const under = cam ? `${terrain.biomeAt(cam[0], cam[2]) ?? '-'} below` : '';
    $('#info').value = `${counts}\n${terrain.drawn} chunks · ${rate.toFixed(0)} fps · built in ${(generatedAt / 1000).toFixed(2)} s · ${under}`;
};
demo.draw = camera => {
    const under = camera.worldPosition && terrain.underwater(camera.worldPosition);
    renderer.begin(camera, under ? [...linear(terrain.water.look.under.color).map(c => Math.pow(c, 1 / 2.2)), 1] : [...renderer.light.fogColor.map(c => Math.pow(c, 1 / 2.2)), 1]);
    terrain.draw(camera, renderer.light, demo.time);
    if (grass) { grass.drawGround(camera, renderer.light, demo.time); grass.draw(camera, renderer.light, demo.time); }
    if ($('#markers').checked) for (const c of terrain.cities)
    {
        const k = Math.max(3, c.radius * .08);
        renderer.draw(marker, [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, c.x, c.y + k, c.z, 1]);
    }
};

light();
if (location.hash.length > 1) load(decodeURIComponent(location.hash.slice(1)));
refresh();
overview();
