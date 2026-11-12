import { Camera, GameEngine, GameObject, fps, orbit } from '@papit/game-engine';
import { MeshBuilder, loadGLTF, upload } from '@papit/game-mesh';
import { Renderer } from '@polywar/3d-asset-preview';
import { Grass } from '@polywar/grass';

const $ = s => document.querySelector(s);
const engine = new GameEngine({ name: 'main', query: 'canvas', type: 'webgl2', documentElement: document });
const layer = engine.layers.main;
const gl = layer.gl;
const renderer = new Renderer(layer);
renderer.light.toon = 3;
const grass = new Grass(layer);
const walker = upload(gl, new MeshBuilder().sphere([.85, .35, .25], {}, 1).build());
const walkers = [{ r: 4, speed: .5, size: .5 }, { r: 9, speed: -.3, size: .8 }, { r: 2, speed: 1.1, size: .35 }];

// ---- planting ----
const masks = {
    everywhere: undefined,
    meadow: (x, z) => Math.min(1, Math.max(0, (.5 + .5 * Math.sin(x * .15) * Math.cos(z * .13 + 1) - .3) * 4)),
    paths: (x, z) => Math.min(1, Math.max(0, (Math.abs(z - 6 * Math.sin(x * .1)) - 1.2) / 1.5)),
};
const plant = () => {
    const size = Number($('#area').value);
    grass.plant({ area: { x: -size / 2, z: -size / 2, width: size, depth: size }, mask: masks[$('#mask').value], seed: 1 });
};

// ---- tweaks: [path, min, max, step]; settings.* / look.* read back from the presets ----
const numbers = [
    ['settings.density', 2, 160, 1], ['settings.distance', 5, 200, 1], ['settings.lod', 0, 1, .05], ['settings.sizeScale', .5, 3, .05],
    ['look.stepped'], ['look.framerate', 1, 30, 1], ['look.bands', 0, 6, 1], ['settings.softBands', 0, 1, .05], ['settings.clouds'],
    ['bladeShare', 0, 1, .05], ['variation', 0, .5, .01], ['patches.0.threshold', 0, 1, .01], ['patches.0.softness', 0, .3, .01], ['patches.0.scale', .002, .1, .001],
    ['patches.1.threshold', 0, 1, .01], ['patches.1.softness', 0, .3, .01], ['patches.1.scale', .002, .1, .001],
    ['accents.0.chance', 0, .05, .001], ['accents.1.chance', 0, .1, .001],
    ['size.0', .05, 1, .01], ['size.1', .05, 1, .01], ['sizeJitter', 0, 1, .05],
    ['wind.angle', 0, 90, 1], ['wind.speed', 0, .2, .001], ['wind.scale', .005, .3, .005], ['wind.threshold', -1, 1, .01],
    ['wind.diverge', 0, 45, 1], ['wind.perspective', -.2, .6, .01],
    ['sway.angle', 0, 45, 1], ['sway.speed', 0, 3, .05], ['push.angle', 0, 90, 1],
    ['lighting.wrap', -1, 1, .05], ['lighting.steepness', 1, 8, .1], ['clouds.scale', 5, 150, 1], ['clouds.min', 0, 1, .05],
    ['sun.elevation', 5, 90, 1], ['sun.azimuth', 0, 360, 1],
];
const colors = ['color', 'patches.0.color', 'patches.1.color', 'accents.0.color', 'accents.1.color'];
const sun = { elevation: 50, azimuth: 40 };

const read = path => {
    const [head, ...rest] = path.split('.');
    if (head === 'sun') return sun[rest[0]];
    const o = grass.options;
    let v = head === 'settings' ? o.q : head === 'look' ? o.s : o[head];
    for (const k of head === 'settings' || head === 'look' ? rest : rest) v = v[k];
    return v;
};
const write = (path, value) => {
    const [head, ...rest] = path.split('.');
    if (head === 'sun') { sun[rest[0]] = value; return light(); }
    const o = grass.options;
    if (head === 'settings' || head === 'look') return grass.set({ [head]: { ...o[head], [rest[0]]: value } });
    if (!rest.length) return grass.set({ [head]: value });
    const root = structuredClone(o[head]);
    let v = root;
    for (const k of rest.slice(0, -1)) v = v[k];
    v[rest.at(-1)] = value;
    grass.set({ [head]: root });
};
const inputs = [];
for (const [path, min, max, step] of numbers)
{
    const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span');
    const bool = min === undefined;
    Object.assign(input, bool ? { type: 'checkbox' } : { type: 'range', min, max, step });
    label.append(path, input);
    if (!bool) label.append(span);
    const sync = () => { const v = read(path); bool ? input.checked = v : (input.value = v, span.textContent = +Number(v).toFixed(3)); };
    input.oninput = () => { write(path, bool ? input.checked : Number(input.value)); sync(); };
    inputs.push(sync);
    $('#numbers').append(label);
}
for (const path of colors)
{
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'color';
    label.append(path, input);
    inputs.push(() => input.value = read(path));
    input.oninput = () => write(path, input.value);
    $('#colors').append(label);
}
const refresh = () => inputs.forEach(f => f());

const light = () => {
    const e = sun.elevation * Math.PI / 180, a = sun.azimuth * Math.PI / 180;
    renderer.light.sunDirection = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
};

let mesh;
const source = async () => {
    const value = $('#source').value;
    if (value === 'mesh' && !mesh)
    {
        const gltf = await loadGLTF('/assets/models/nature/Grass.glb');
        mesh = gltf.meshes[0].primitives[0];
    }
    grass.set({ mesh, settings: { ...grass.options.settings, source: value || undefined } });
    if (!value) { const { source: _, ...rest } = grass.options.settings; grass.set({ settings: rest }); }
};

$('#quality').onchange = () => { grass.set({ quality: $('#quality').value, settings: {} }); $('#source').value = ''; refresh(); };
$('#style').onchange = () => { grass.set({ style: $('#style').value, look: {} }); refresh(); };
$('#source').onchange = source;

// ---- settings json: grass.toJSON() out, grass.load(json) in ----
const selects = () => {
    const o = grass.options;
    $('#quality').value = o.quality;
    $('#style').value = o.style;
    $('#shape').value = o.shape;
    $('#debug').value = o.debug ?? '';
    $('#source').value = o.settings.source ?? '';
};
const load = text => {
    try { grass.load(text); } catch (e) { $('#text').value = String(e); return; }
    selects();
    refresh();
};
const json = () => JSON.stringify(grass, null, 2);
$('#export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    a.download = 'grass.json';
    a.click();
    URL.revokeObjectURL(a.href);
};
$('#copy').onclick = async () => { $('#text').value = json(); await navigator.clipboard?.writeText(json()).catch(() => { }); };
$('#import').onclick = () => $('#file').click();
$('#file').onchange = async () => { const f = $('#file').files[0]; if (f) { const t = await f.text(); $('#text').value = t; load(t); } $('#file').value = ''; };
$('#apply').onclick = () => load($('#text').value);
$('#reset').onclick = () => load({});
$('#shape').onchange = () => grass.set({ shape: $('#shape').value });
$('#mask').onchange = plant;
$('#area').onchange = plant;
$('#debug').onchange = () => grass.set({ debug: $('#debug').value });

// ---- camera ----
const target = { position: { x: 0, y: 0, z: 0 } };
const cameras = {
    orbit: () => new Camera({ near: .05, far: 500, controllers: [orbit({ target, distance: 10, min: 1, max: 120, yaw: .6, pitch: .55, speed: .0015 })] }),
    top: () => new Camera({ near: .05, far: 500, controllers: [orbit({ target, distance: 14, min: 2, max: 120, yaw: 0, pitch: 1.2, speed: .0015 })] }),
    fps: () => { const c = new Camera({ near: .05, far: 500, controllers: [fps({ speed: 4 })] }); c.position.set([0, 1.7, 8]); return c; },
};
const camera = () => engine.layers.main.camera = cameras[$('#camera').value]();
$('#camera').onchange = camera;

// ---- loop ----
let time = 0, frames = 0, clock = 0, rate = 0;
const placed = walkers.map(() => [0, 0, 0, 0]);
engine.add(new class extends GameObject {
    update(dt) {
        time += dt;
        frames++; clock += dt;
        if (clock > .5) { rate = frames / clock; frames = clock = 0; }
        walkers.forEach((w, i) => placed[i] = [Math.cos(time * w.speed) * w.r, w.size, Math.sin(time * w.speed) * w.r, w.size * 1.6]);
        grass.push($('#pushing').checked ? placed : []);
        $('#info').value = `${grass.count} planted · ${grass.drawn} drawn\n${rate.toFixed(0)} fps`;
    }
    render(layer) {
        renderer.begin(layer.camera, [.09, .09, .1, 1]);
        grass.drawGround(layer.camera, renderer.light, time);
        grass.draw(layer.camera, renderer.light, time);
        if ($('#pushing').checked) for (const [x, y, z, r] of placed)
        {
            const k = r / 1.6;
            renderer.draw(walker, [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, x, y, z, 1]);
        }
    }
}());

light();
camera();
grass.set({ shape: $('#shape').value });
plant();
refresh();
engine.start();

// the engine listens on document/window: keep panel input (drag, scroll, typing) away from the camera,
// but let a camera drag that started on the canvas keep going over the panel
let panelDrag = false;
const aside = $('aside');
aside.addEventListener('pointerdown', () => panelDrag = true);
addEventListener('pointerup', () => panelDrag = false);
for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel', 'keydown', 'keyup', 'touchstart', 'contextmenu'])
    aside.addEventListener(type, e => e.stopPropagation(), { passive: true });
for (const type of ['pointermove', 'mousemove', 'touchmove'])
    aside.addEventListener(type, e => { if (panelDrag || !e.buttons) e.stopPropagation(); }, { passive: true });
