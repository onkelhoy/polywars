import { AXES, DEFAULTS, bakeFiles, encodePNG, rasterise, readGLB, rectangle, shade, FRAMES } from '@polywar/mesh-bake';
import '@polywar/3d-asset-preview';

const $ = s => document.querySelector(s);
const preview = $('#view');
const STORE = 'mesh-bake.settings';
let settings = { ...structuredClone(DEFAULTS), ...JSON.parse(localStorage.getItem(STORE) ?? '{}') };
let mesh = null, name = 'baked', raster = null, rasterKey = '', result = null;
/** `baked`: the preview shows the last bake; `stale`: settings changed since; `bakedAxis`: the axis of that bake */
let baked = false, stale = false, bakedAxis = settings.axis, refit = false;

// ---------- settings form ----------
// [key, label, kind, ...]: slider = min, max, step
const FIELDS = [
    ['axis', 'seen from', 'select', AXES],
    ['auto', 'rectangle from bounds', 'check'],
    ['size', 'size (m)', 'pair'],
    ['center', 'centre (m)', 'pair'],
    ['snap', 'snap (m)', 'slider', .05, 2, .05],
    ['resolution', 'pixels per metre', 'slider', 32, 1024, 32],
    ['samples', 'supersampling', 'slider', 1, 8, 1],
    ['tile', 'repeats (wrap edges)', 'check'],
    ['normalStrength', 'normal strength', 'slider', 0, 4, .05],
    ['soften', 'soften edges (m)', 'slider', 0, .02, .0005],
    ['aoStrength', 'ambient strength', 'slider', 0, 3, .05],
    ['aoRadius', 'ambient radius (m)', 'slider', .005, .3, .005],
    ['aoInColor', 'ambient into colour', 'slider', 0, 1, .05],
    ['spec', 'spec', 'slider', 0, 1, .05],
    ['specCavity', 'spec lost in cavities', 'slider', 0, 1, .05],
    ['plane', 'quad sits at', 'select', ['top', 'bottom']],
];
const form = $('#settings');
function renderForm() {
    const auto = !settings.size;
    const rect = mesh ? rectangle(mesh, settings) : { size: settings.size ?? [1, 1], center: settings.center ?? [0, 0] };
    form.innerHTML = FIELDS.map(([key, label, kind, a, b, c]) => {
        if (kind === 'select') return `<label>${label} <select name="${key}">${a.map(o => `<option ${o === settings[key] ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
        if (kind === 'check') return `<label>${label} <input type="checkbox" name="${key}" ${(key === 'auto' ? auto : settings[key]) ? 'checked' : ''}></label>`;
        if (kind === 'pair') return `<label>${label} <span><input type="number" step="0.05" name="${key}0" value="${+rect[key][0].toFixed(4)}" ${auto ? 'disabled' : ''}><input type="number" step="0.05" name="${key}1" value="${+rect[key][1].toFixed(4)}" ${auto ? 'disabled' : ''}></span></label>`;
        return `<label>${label} <span><input type="range" name="${key}" min="${a}" max="${b}" step="${c}" value="${settings[key]}"><output>${settings[key]}</output></span></label>`;
    }).join('') + materialsForm();
}
function materialsForm() {
    if (!mesh?.materials.length) return '';
    return '<h2>spec per material</h2>' + mesh.materials.map((m, i) => {
        const value = settings.specByMaterial[m.name] ?? settings.spec, c = m.color.slice(0, 3).map(v => Math.round(Math.pow(v, 1 / 2.2) * 255));
        return `<label><span><i style="width:12px;height:12px;background:rgb(${c})"></i>${m.name || 'material ' + i}</span> <span><input type="range" data-material="${m.name}" min="0" max="1" step="0.05" value="${value}"><output>${value}</output></span></label>`;
    }).join('');
}
function readForm() {
    const d = new FormData(form), on = k => form.elements[k].checked;
    for (const [key, , kind] of FIELDS)
    {
        if (kind === 'slider') settings[key] = Number(d.get(key));
        else if (kind === 'select') settings[key] = d.get(key);
        else if (key === 'tile') settings.tile = on('tile');
    }
    if (on('auto')) { delete settings.size; delete settings.center; }
    else
    {
        const read = k => [0, 1].map(i => Number(form.elements[k + i].value));
        const size = read('size'), center = read('center');
        settings.size = size.every(v => v > 0) ? size : rectangle(mesh ?? { positions: new Float32Array(9), material: new Int16Array(1), materials: [] }, { ...settings, size: undefined, center: undefined }).size;
        settings.center = center.every(Number.isFinite) ? center : [0, 0];
    }
    for (const input of form.querySelectorAll('[data-material]')) settings.specByMaterial[input.dataset.material] = Number(input.value);
    localStorage.setItem(STORE, JSON.stringify(settings));
}
form.oninput = e => {
    if (e.target.type === 'range') e.target.nextElementSibling.value = e.target.value;
    readForm();
    // the rectangle fields follow the axis and the auto switch
    if (['axis', 'auto', 'snap'].includes(e.target.name)) renderForm();
    markStale();
};
$('#reset').onclick = () => { settings = structuredClone(DEFAULTS); localStorage.removeItem(STORE); renderForm(); markStale(); };

// ---------- load ----------
const info = $('#info');
function fail(message) { info.className = 'error'; info.value = message; }
function open(bytes, label) {
    try
    {
        mesh = readGLB(bytes);
        if (!mesh.material.length) throw new Error('the file has no triangles');
        name = label.replace(/^.*\//, '').replace(/\.glb$/i, '') || 'baked';
        raster = null; result = null; baked = false; stale = false;
        info.className = '';
        info.value = `${name}\n${mesh.material.length} triangles\nchoose settings, then bake`;
        renderForm();
        refit = true;
        scene();
        clearMaps();
        updateBake();
    }
    catch (e) { fail(`${label}: ${e.message}`); }
}
async function openUrl(url) {
    try
    {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        open(await response.arrayBuffer(), url);
    }
    catch (e) { fail(`${url}: ${e.message}`); }
}
const drop = $('#drop');
$('#file').onchange = async e => { const f = e.target.files[0]; if (f) open(await f.arrayBuffer(), f.name); };
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = async e => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (!/\.glb$/i.test(f.name)) return fail(`${f.name}: only .glb files`);
    open(await f.arrayBuffer(), f.name);
};
$('#url').onchange = e => { if (e.target.value) { location.hash = e.target.value; openUrl(e.target.value); } };

// ---------- bake (on the button; the slow raster step only when its inputs change) ----------
const bakeButton = $('#bake');
function updateBake() {
    bakeButton.disabled = !mesh;
    bakeButton.classList.toggle('stale', stale);
    bakeButton.textContent = !mesh ? 'bake (load a mesh first)' : stale ? 'bake (settings changed)' : baked ? 'bake again' : 'bake';
    for (const b of $('#downloads').querySelectorAll('button')) b.disabled = !result;
}
function markStale() { if (baked) stale = true; updateBake(); }
bakeButton.onclick = () => {
    bakeButton.disabled = true;
    bakeButton.textContent = 'baking…';
    // let the button paint before the slow work
    setTimeout(run, 30);
};
preview.addEventListener('load', () => { if (refit) { refit = false; preview.frame(); } });
function run() {
    if (!mesh) return updateBake();
    try
    {
        const t0 = performance.now();
        const key = JSON.stringify([settings.axis, settings.size, settings.center, settings.snap, settings.resolution, settings.samples]);
        if (!raster || key !== rasterKey) { raster = rasterise(mesh, settings); rasterKey = key; }
        result = shade(raster, mesh, settings);
        const ms = Math.round(performance.now() - t0);
        info.className = '';
        info.value = `${name}\n${result.triangles} → 2 triangles\n${result.size.join(' x ')} m, ${result.width} x ${result.height} px\nrelief ${(result.depth * 100).toFixed(1)} cm`
            + (result.coverage < .999 ? `\n${(result.coverage * 100).toFixed(1)}% covered, the rest is filled from its neighbours` : '') + `\nbaked in ${ms} ms`;
        bakedAxis = settings.axis; baked = true; stale = false;
        showMaps();
        scene();
    }
    catch (e) { fail(e.message); }
    updateBake();
}

// ---------- 2D maps + downloads ----------
const MAPS = [['color', 3], ['normal', 3], ['ao', 1], ['spec', 1], ['relief', 1]];
$('#maps').innerHTML = MAPS.map(([k]) => `<figure><canvas data-map="${k}"></canvas><figcaption><span>${k}</span><a href="#" data-save="${k}">save</a></figcaption></figure>`).join('');
function clearMaps() { for (const c of document.querySelectorAll('[data-map]')) { c.width = c.height = 0; } }
function showMaps() {
    for (const [key, channels] of MAPS)
    {
        const canvas = document.querySelector(`[data-map="${key}"]`), src = result[key], n = result.width * result.height;
        canvas.width = result.width; canvas.height = result.height;
        const image = new ImageData(result.width, result.height);
        for (let i = 0; i < n; i++)
        {
            image.data[i * 4] = src[i * channels];
            image.data[i * 4 + 1] = src[i * channels + (channels === 3 ? 1 : 0)];
            image.data[i * 4 + 2] = src[i * channels + (channels === 3 ? 2 : 0)];
            image.data[i * 4 + 3] = 255;
        }
        canvas.getContext('2d').putImageData(image, 0, 0);
    }
}
function save(filename, data) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data]));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#maps').onclick = async e => {
    const key = e.target.dataset.save;
    if (!key) return;
    e.preventDefault();
    if (!result) return;
    save(`${name}-${key}.png`, await encodePNG(result.width, result.height, MAPS.find(m => m[0] === key)[1], result[key]));
};

// store-only zip, so one download gives the folder as the CLI writes it
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
    const parts = [], central = [], enc = new TextEncoder();
    let offset = 0;
    for (const f of files)
    {
        const path = enc.encode(f.name), sum = crc(f.data);
        const head = new DataView(new ArrayBuffer(30));
        head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint32(14, sum, true);
        head.setUint32(18, f.data.length, true); head.setUint32(22, f.data.length, true); head.setUint16(26, path.length, true);
        const entry = new DataView(new ArrayBuffer(46));
        entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint32(16, sum, true);
        entry.setUint32(20, f.data.length, true); entry.setUint32(24, f.data.length, true); entry.setUint16(28, path.length, true); entry.setUint32(42, offset, true);
        parts.push(head.buffer, path, f.data);
        central.push(entry.buffer, path);
        offset += 30 + path.length + f.data.length;
    }
    const size = central.reduce((n, c) => n + c.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer]);
}
$('#downloads').innerHTML = '<button id="zip" type="button">folder (.zip)</button><button id="glb" type="button">model.glb</button>';
$('#zip').onclick = async () => { if (result) save(`${name}.zip`, zip((await bakeFiles(result, name)).map(f => ({ name: `${name}/${f.name}`, data: f.data })))); };
$('#glb').onclick = async () => { if (result) save('model.glb', (await bakeFiles(result, name))[0].data); };

// ---------- 3D preview (pw-3d-asset-preview: 3d-demo camera + light panel) ----------
/** original mesh as a game-mesh Mesh: flat normals, material colours */
function originalMesh() {
    const p = mesh.positions, n = mesh.material.length;
    const normals = new Float32Array(n * 9), colors = new Float32Array(n * 12);
    for (let t = 0; t < n; t++)
    {
        const o = t * 9, c = mesh.materials[mesh.material[t]]?.color ?? [1, 1, 1, 1];
        const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        for (let k = 0; k < 3; k++) { normals.set([nx / l, ny / l, nz / l], o + k * 3); colors.set([c[0], c[1], c[2], 1], t * 12 + k * 4); }
    }
    return { positions: p, normals, colors, bounds: bounds(p) };
}
function bounds(p) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i++) { const k = i % 3; min[k] = Math.min(min[k], p[i]); max[k] = Math.max(max[k], p[i]); }
    return { min, max, radius: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 };
}
function quadMesh() {
    const q = result.quad, positions = [], normals = [], colors = [], uvs = [];
    for (const i of [0, 1, 2, 0, 2, 3]) { positions.push(...q.positions[i]); normals.push(...q.normal); colors.push(1, 1, 1, 1); uvs.push(...q.uvs[i]); }
    const p = new Float32Array(positions);
    return { positions: p, normals: new Float32Array(normals), colors: new Float32Array(colors), uvs: new Float32Array(uvs), bounds: bounds(p) };
}
const node = (m, t) => ({ mesh: m, children: [], translation: t, rotation: [0, 0, 0, 1], scale: [1, 1, 1] });

// map switches
const use = { albedo: true, normal: true, ao: true, spec: true };
$('#toggles').innerHTML = Object.keys(use).map(k => `<label><input type="checkbox" data-use="${k}" checked /> ${k === 'albedo' ? 'color' : k}</label>`).join('');
$('#toggles').onchange = e => { use[e.target.dataset.use] = e.target.checked; scene(); };
$('#show').onchange = scene;
$('#repeat').onchange = scene;

/** the scene as one glTF: the baked quad repeated, the original next to it, or both */
function scene() {
    if (!mesh) return;
    const show = baked ? $('#show').value : 'original';
    const meshes = [], nodes = [], maps = [];
    if (show !== 'baked') { meshes.push({ primitives: [originalMesh()] }); maps.push([undefined]); }
    let gap = 0;
    if (show !== 'original')
    {
        const [T, B] = FRAMES[bakedAxis], repeat = Math.max(1, Math.min(7, Number($('#repeat').value) || 1));
        const { width: w, height: h } = result, px = (data, channels) => ({ pixels: data, width: w, height: h, channels });
        const all = { albedo: px(result.color, 3), normal: px(result.normal, 3), ao: px(result.ao, 1), spec: px(result.spec, 1) };
        meshes.push({ primitives: [quadMesh()] });
        maps.push([Object.fromEntries(Object.entries(all).filter(([k]) => use[k]))]);
        gap = show === 'both' ? repeat * result.size[0] / 2 + result.size[0] * .1 : 0;
        const q = meshes.length - 1;
        for (let i = 0; i < repeat; i++) for (let j = 0; j < repeat; j++)
        {
            const u = (i - (repeat - 1) / 2) * result.size[0] - gap, v = (j - (repeat - 1) / 2) * result.size[1];
            nodes.push(node(q, [0, 1, 2].map(k => T[k] * u + B[k] * v)));
        }
    }
    if (show !== 'baked')
    {
        const T = FRAMES[baked ? bakedAxis : settings.axis][0];
        nodes.push(node(0, T.map(k => k * gap)));
    }
    preview.gltf = { meshes, nodes, roots: nodes.map((_, i) => i), skins: [], animations: [], maps };
}

// moving light: the sun goes round
let last = 0;
function spin(time) {
    requestAnimationFrame(spin);
    if ($('#spin').checked && last) preview.sunAzimuth = (preview.sunAzimuth + (time - last) * .03) % 360;
    last = time;
}
requestAnimationFrame(spin);

// start: url from the hash, e.g. #/assets/models/buildings/modular-village/Stone_Floor_1.glb
renderForm();
updateBake();
const start = decodeURIComponent(location.hash.slice(1));
if (start) { $('#url').value = start; openUrl(start); }
