import '@polywar/viewport';
import { Matrix4 } from '@papit/matrix';
import { Model, Renderer } from '@polywar/renderer';
import { WATER_LOOK, WATER_LOOKS, WaterSample, WaterScreen, merge } from '@polywar/water';

// the water at real scale: a 600 m coast with a lake, a river, rocks, a cow and a house; fly mode dives under
const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const layer = demo.layer, gl = layer.gl;
const renderer = new Renderer(layer);
renderer.light.fogColor = [.66, .76, .86];
renderer.light.fogDensity = .00025;
let scene = new WaterSample(layer), look = structuredClone(WATER_LOOK);
const screen = new WaterScreen(layer);

// ---- models: real sizes, standing on the ground ----
const place = (x, z, yaw, y, k = 1) => {
    const c = Math.cos(yaw) * k, s = Math.sin(yaw) * k;
    return Matrix4.create([c, 0, -s, 0, 0, k, 0, 0, s, 0, c, 0, x, y, z, 1]);
};
/** hooves: the lowest vertices, one cluster per quarter round the centre (mesh space x z) */
const hooves = model => {
    const { min, max } = model.bounds, low = min[1] + (max[1] - min[1]) * .06, cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
    const sums = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const mesh of model.gltf.meshes) for (const p of mesh.primitives)
        for (let i = 0; i < p.positions.length; i += 3) if (p.positions[i + 1] < low)
        {
            const q = (p.positions[i] > cx ? 1 : 0) + (p.positions[i + 2] > cz ? 2 : 0);
            sums[q][0] += p.positions[i]; sums[q][1] += p.positions[i + 2]; sums[q][2]++;
        }
    return sums.filter(s => s[2]).map(([x, z, n]) => [x / n, z / n]);
};
const props = [], legs = [];
// assets in real metres: the farm pack is about 3.4 times too big, scaled to a 1.45 m cow here
const load = async (url, spots, height) => {
    try
    {
        const m = await Model.load(gl, url), { min, max } = m.bounds, k = height ? height / (max[1] - min[1]) : 1;
        const feet = url.includes('animals') ? hooves(m) : [];
        for (const [x, z, yaw] of spots)
        {
            props.push({ model: m, spot: [x, z], matrix: place(x, z, yaw, scene.heightAt(x, z) - min[1] * k, k) });
            const c = Math.cos(yaw), s = Math.sin(yaw);
            for (const [lx, lz] of feet)
            {
                const wx = x + (c * lx + s * lz) * k, wz = z + (-s * lx + c * lz) * k, w = scene.surfaceAt(wx, wz);
                if (w !== null && scene.heightAt(wx, wz) < w) legs.push(wx, wz, .05);
            }
        }
    }
    catch (e) { console.warn('could not load', url, e); }
};
// cows: two standing ankle deep at the beach (walk out from land until the water is `depth`), one on the grass
const wade = (z, depth) => { let x = 0; while (x > -200 && scene.heightAt(x, z) > -depth) x -= .25; return x; };
load('/assets/models/animals/farm/Cow.glb', [[wade(6, .3), 6, 1.2], [wade(30, .15), 30, 2.6], [30, -10, .4]], 1.45);
load('/assets/models/buildings/farm/Silo_House.glb', [[20, 40, 0]]);

window.water = { scene, legs, props };
// ---- cameras ----
const cams = {
    close: [[-80, 2.5, 30], [-70, 0, 20]],
    cow: [[-4, 1.6, 2.5], [0, .3, 0]],
    river: [[-10, 8, 25], [-20, 0, 8]],
    mid: [[-200, 60, 160], [-50, 0, 0]],
    far: [[-900, 400, 700], [0, 0, 0]],
    under: [[-110, -4, 10], [-70, -2, 10]],
};
document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => {
    let [from, to] = cams[b.dataset.cam];
    // the cow camera looks at the first cow
    if (b.dataset.cam === 'cow' && props[0]) { const m = props[0].spot; from = [m[0] - 4, 1.6, m[1] + 2.5]; to = [m[0], .3, m[1]]; }
    demo.mode = b.dataset.cam === 'under' ? 'fly' : demo.mode;
    demo.look(from, to);
});
demo.look(...cams.close);

// ---- sun ----
const sun = { elevation: 35, azimuth: 200 };
const light = () => {
    const e = sun.elevation * Math.PI / 180, a = sun.azimuth * Math.PI / 180;
    renderer.light.sunDirection = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
};
light();

// ---- tweaks: every number / colour in the look, ranges by name ----
const RANGES = {
    opacity: [0, 1, .01], clarity: [.2, 40, .1], sky: [0, 1, .01], horizon: [0, 1, .01], 'paint.amount': [0, 1, .01], 'paint.scale': [1, 120, 1],
    'glints.dark': [0, .5, .01], 'glints.scale': [.2, 6, .05], 'glints.length': [.2, 10, .1], 'glints.lane': [0, 1, .01], 'glints.strength': [0, 2, .05], 'glints.specks': [0, 1, .01], 'glints.speed': [0, 2, .01], 'glints.far': [0, 4000, 10], 'glints.density': [0, 1, .01], 'glints.melt': [0, 1, .01], 'glints.glow': [0, 1, .01], 'glints.fade': [.5, 40, .5], 'glints.wind': [0, 360, 1],
    'foam.rim': [0, 3, .01], 'foam.wobble': [0, 3, .05], 'foam.wobbleScale': [.5, 40, .5], 'foam.lines': [0, 8, 1], 'foam.width': [.02, 1, .01], 'foam.spacing': [.3, 10, .1], 'foam.speed': [0, .5, .01], 'foam.amount': [0, 1, .01], 'foam.far': [0, 2000, 10],
    'streaks.amount': [0, 1, .01], 'streaks.length': [.3, 15, .1], 'streaks.width': [.02, 1, .01],
    'under.clarity': [.5, 60, .5], 'under.density': [0, 1, .005], 'under.sun': [0, 1, .005], 'under.caustics': [0, 2, .05],
};
const get = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
const set = (path, value) => {
    const [a, b] = path.split('.');
    if (b) look[a][b] = value; else look[a] = value;
    scene.material.set(look);
};
const inputs = [];
const row = (parent, name, input, after) => {
    const label = document.createElement('label'), span = document.createElement('span');
    label.append(name, input, span);
    parent.append(label);
    const show = () => span.textContent = input.type === 'range' ? +Number(input.value).toFixed(3) : '';
    input.addEventListener('input', () => { after(input.type === 'range' ? Number(input.value) : input.type === 'checkbox' ? input.checked : input.value); show(); });
    return show;
};
const build = () => {
    $('#tweaks').innerHTML = '';
    inputs.length = 0;
    const groups = {};
    const walk = (o, prefix = '') => {
        for (const [k, v] of Object.entries(o))
        {
            const path = prefix + k;
            if (v && typeof v === 'object') { walk(v, path + '.'); continue; }
            const group = prefix ? prefix.slice(0, -1) : 'surface';
            if (!groups[group]) { const d = Object.assign(document.createElement('details'), { innerHTML: `<summary>${group}</summary>`, open: group === 'surface' || group === 'glints' }); $('#tweaks').append(d); groups[group] = d; }
            const input = document.createElement('input');
            if (typeof v === 'string') input.type = 'color';
            else { const [min, max, step] = RANGES[path] ?? [0, 1, .01]; Object.assign(input, { type: 'range', min, max, step }); }
            const show = row(groups[group], k, input, value => set(path, value));
            inputs.push(() => { input.value = get(look, path); show(); });
        }
    };
    walk(look);
    inputs.forEach(f => f());
};
build();

const sceneRows = [['sun elevation', 2, 90, 1, () => sun.elevation, v => { sun.elevation = v; light(); }], ['sun azimuth', 0, 360, 1, () => sun.azimuth, v => { sun.azimuth = v; light(); }],
    ['blur', 0, 3, .05, () => screen.options.blur, v => screen.options.blur = v], ['wobble', 0, 3, .05, () => screen.options.wobble, v => screen.options.wobble = v],
    ['bubbles', 0, 3, .05, () => screen.options.bubbles, v => screen.options.bubbles = v], ['rinse s', 0, 4, .1, () => screen.options.rinse, v => screen.options.rinse = v],
    ['tint', 0, 1, .01, () => screen.options.tint, v => screen.options.tint = v]];
const sceneSync = [];
for (const [name, min, max, step, read, write] of sceneRows)
{
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value: read() });
    const show = row($('#scene'), name, input, write);
    show();
    sceneSync.push(() => { input.value = read(); show(); });
}
const fx = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true });
row($('#scene'), 'screen fx', fx, v => screen.options.enabled = v);

$('#look').innerHTML = Object.keys(WATER_LOOKS).map(k => `<option>${k}</option>`).join('');
const apply = next => { look = merge(structuredClone(WATER_LOOK), next); scene.material.set(look); build(); };
$('#look').onchange = () => apply(WATER_LOOKS[$('#look').value]);

// ---- presets: save the look (and the sun) as JSON, load one back ----
$('#export').onclick = () => {
    const blob = new Blob([JSON.stringify({ ...look, sun }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `water-${$('#look').value}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
};
$('#import').onclick = () => $('#file').click();
$('#file').onchange = async () => {
    const file = $('#file').files[0];
    if (!file) return;
    const { sun: s, ...next } = JSON.parse(await file.text());
    if (s) { Object.assign(sun, s); light(); sceneSync.forEach(f => f()); }
    apply(next);
    $('#file').value = '';
};

// ---- the sun: a marker where it is in the sky, drag it to move the sun ----
const marker = $('#sun');
let cam;
const rayAt = (x, y) => {
    // screen point to a world direction (the view rotation transposed)
    const r = demo.getBoundingClientRect(), m = cam.viewMatrix, p = cam.projectionMatrix;
    const vx = ((x - r.left) / r.width * 2 - 1) / p[0], vy = (1 - (y - r.top) / r.height * 2) / p[5], vz = -1;
    return [m[0] * vx + m[1] * vy + m[2] * vz, m[4] * vx + m[5] * vy + m[6] * vz, m[8] * vx + m[9] * vy + m[10] * vz];
};
marker.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); marker.setPointerCapture(e.pointerId); marker.dragging = true; };
marker.onpointerup = e => { marker.dragging = false; marker.releasePointerCapture(e.pointerId); };
marker.onpointermove = e => {
    if (!marker.dragging || !cam) return;
    const [x, y, z] = rayAt(e.clientX, e.clientY), len = Math.hypot(x, y, z);
    sun.elevation = Math.max(2, Math.min(90, Math.asin(y / len) * 180 / Math.PI));
    sun.azimuth = (Math.atan2(z, x) * 180 / Math.PI + 360) % 360;
    light();
    sceneSync.forEach(f => f());
};
const placeSun = camera => {
    const m = camera.viewMatrix, p = camera.projectionMatrix, [dx, dy, dz] = renderer.light.sunDirection;
    const vx = m[0] * dx + m[4] * dy + m[8] * dz, vy = m[1] * dx + m[5] * dy + m[9] * dz, vz = m[2] * dx + m[6] * dy + m[10] * dz;
    const x = p[0] * vx / -vz, y = p[5] * vy / -vz;
    const show = vz < 0 && Math.abs(x) < 1.2 && Math.abs(y) < 1.2;
    marker.hidden = !show;
    if (show) { const r = demo.getBoundingClientRect(); marker.style.left = `${r.left + (x + 1) / 2 * r.width}px`; marker.style.top = `${r.top + (1 - y) / 2 * r.height}px`; }
    $('#sunInfo').textContent = show ? '' : 'sun is off screen: turn toward it, or use the sliders';
};

// ---- frame ----
demo.draw = camera => {
    cam = camera;
    placeSun(camera);
    const eye = camera.worldPosition, surface = scene.under(eye), t = demo.time;
    const deep = look.under.deep, bg = surface !== null ? [...hexLinear(look.under.shallow), 1] : [...renderer.light.fogColor.map(c => c ** (1 / 2.2)), 1]; // the sky: the fog colour, so the horizon melts into it
    renderer.begin(camera, bg);
    scene.drawGround(camera, renderer.light, t);
    for (const p of props) p.model.draw(renderer, p.matrix);
    scene.drawWater(camera, renderer.light, t, legs);
    screen.draw(surface !== null, t, surface !== null ? look.under.shallow : deep);
    $('#info').textContent = `eye ${eye.x.toFixed(1)} ${eye.y.toFixed(1)} ${eye.z.toFixed(1)} m${surface !== null ? `  ·  ${(surface - eye.y).toFixed(1)} m under` : ''}\nfly mode: WASD + mouse, dive below the surface`;
};
const hexLinear = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => c / 255); };
