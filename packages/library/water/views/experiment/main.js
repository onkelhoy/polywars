import '@polywar/3d-demo';
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
const place = (x, z, yaw = 0, y) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return Matrix4.create([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y ?? scene.heightAt(x, z), z, 1]);
};
const props = [];
const load = async (url, spots) => {
    try
    {
        const m = await Model.load(gl, url);
        for (const [x, z, yaw] of spots) props.push({ model: m, matrix: place(x, z, yaw, scene.heightAt(x, z) - m.bounds.min[1]) });
    }
    catch (e) { console.warn('could not load', url, e); }
};
load('/assets/models/animals/farm/Cow.glb', [[-58, 6, 1.2], [-40, 30, 2.6], [30, -10, .4]]);
load('/assets/models/buildings/farm/Silo_House.glb', [[20, 40, 0]]);

// ---- cameras ----
const cams = {
    close: [[-80, 2.5, 30], [-70, 0, 20]],
    cow: [[-66, 3, 14], [-58, 1, 6]],
    river: [[-10, 8, 25], [-20, 0, 8]],
    mid: [[-200, 60, 160], [-50, 0, 0]],
    far: [[-900, 400, 700], [0, 0, 0]],
    under: [[-110, -4, 10], [-70, -2, 10]],
};
document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => {
    const [from, to] = cams[b.dataset.cam];
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
    opacity: [0, 1, .01], clarity: [.2, 40, .1], sky: [0, 1, .01],
    'glints.dark': [0, .5, .01], 'glints.scale': [.2, 6, .05], 'glints.length': [.2, 10, .1], 'glints.lane': [0, 1, .01], 'glints.strength': [0, 2, .05], 'glints.specks': [0, 1, .01], 'glints.speed': [0, 2, .01], 'glints.far': [0, 1000, 10],
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
for (const [name, min, max, step, read, write] of sceneRows)
{
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value: read() });
    row($('#scene'), name, input, write)();
}
const fx = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true });
row($('#scene'), 'screen fx', fx, v => screen.options.enabled = v);

$('#look').innerHTML = Object.keys(WATER_LOOKS).map(k => `<option>${k}</option>`).join('');
$('#look').onchange = () => { look = merge(structuredClone(WATER_LOOK), WATER_LOOKS[$('#look').value]); scene.material.set(look); build(); };

// ---- frame ----
demo.draw = camera => {
    const eye = camera.worldPosition, surface = scene.under(eye), t = demo.time;
    const deep = look.under.deep, bg = surface !== null ? [...hexLinear(look.under.shallow), 1] : demo.background;
    renderer.begin(camera, bg);
    scene.drawGround(camera, renderer.light, t);
    for (const p of props) p.model.draw(renderer, p.matrix);
    scene.drawWater(camera, renderer.light, t);
    screen.draw(surface !== null, t, surface !== null ? look.under.shallow : deep);
    $('#info').textContent = `eye ${eye.x.toFixed(1)} ${eye.y.toFixed(1)} ${eye.z.toFixed(1)} m${surface !== null ? `  ·  ${(surface - eye.y).toFixed(1)} m under` : ''}\nfly mode: WASD + mouse, dive below the surface`;
};
const hexLinear = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => c / 255); };
