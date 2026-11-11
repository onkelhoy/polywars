import { AXES, DEFAULTS, bakeFiles, encodePNG, rasterise, readGLB, rectangle, shade, FRAMES } from '@polywar/mesh-bake';
import { TEXTURED_FRAGMENT_GLSL, TEXTURED_UNIFORMS, TEXTURED_VERTEX_GLSL, bindMaps, textureFrom } from '@polywar/textured';

const $ = s => document.querySelector(s);
const STORE = 'mesh-bake.settings';
let settings = { ...structuredClone(DEFAULTS), ...JSON.parse(localStorage.getItem(STORE) ?? '{}') };
let mesh = null, name = 'baked', raster = null, rasterKey = '', result = null;

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
    schedule();
};
$('#reset').onclick = () => { settings = structuredClone(DEFAULTS); localStorage.removeItem(STORE); renderForm(); schedule(); };

// ---------- load ----------
const info = $('#info');
function fail(message) { info.className = 'error'; info.value = message; }
function open(bytes, label) {
    try
    {
        mesh = readGLB(bytes);
        if (!mesh.material.length) throw new Error('the file has no triangles');
        name = label.replace(/^.*\//, '').replace(/\.glb$/i, '') || 'baked';
        raster = null;
        buildOriginal();
        renderForm();
        fit();
        schedule();
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

// ---------- bake (debounced; the slow raster step only when its inputs change) ----------
let timer = 0;
function schedule() { clearTimeout(timer); timer = setTimeout(run, 120); }
function run() {
    if (!mesh) return;
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
        showMaps();
        uploadMaps();
    }
    catch (e) { fail(e.message); }
}

// ---------- 2D maps + downloads ----------
const MAPS = [['color', 3], ['normal', 3], ['ao', 1], ['spec', 1], ['relief', 1]];
$('#maps').innerHTML = MAPS.map(([k]) => `<figure><canvas data-map="${k}"></canvas><figcaption><span>${k}</span><a href="#" data-save="${k}">save</a></figcaption></figure>`).join('');
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

// ---------- 3D preview ----------
const canvas = $('#view'), gl = canvas.getContext('webgl2', { antialias: true });
const VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec3 color;
${TEXTURED_VERTEX_GLSL}
uniform mat4 viewProjection;
uniform vec3 offset;
out vec3 vWorld, vNormal, vColor;
void main() {
    texturedVertex();
    vWorld = position + offset; vNormal = normal; vColor = color;
    gl_Position = viewProjection * vec4(vWorld, 1.0);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
${TEXTURED_FRAGMENT_GLSL}
in vec3 vWorld, vNormal, vColor;
uniform vec3 light, eye;
out vec4 outColor;
void main() {
    vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
    n = texturedNormal(n, vWorld);
    vec4 base = texturedColor(vec4(vColor, 1.0));
    float sun = max(dot(n, light), 0.0);
    vec3 ambient = mix(vec3(0.32, 0.3, 0.26), vec3(0.6, 0.66, 0.75), n.y * 0.5 + 0.5) * 0.6 * texturedAo();
    float shine = pow(max(dot(n, normalize(light + normalize(eye - vWorld))), 0.0), 32.0) * 0.25 * texturedSpec();
    vec3 lit = base.rgb * (ambient + vec3(1.0, 0.95, 0.85) * sun) + shine * step(0.0, sun);
    outColor = vec4(pow(lit, vec3(1.0 / 2.2)), 1.0);
}`;
function compile() {
    const shader = (type, text) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, text); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = {};
    for (const n of ['viewProjection', 'offset', 'light', 'eye', ...TEXTURED_UNIFORMS]) uniforms[n] = gl.getUniformLocation(p, n);
    return { program: p, uniforms };
}
const program = gl ? compile() : null;
if (!gl) fail('WebGL2 is not available: the maps still bake, the 3D preview is off');

/** interleaved position 3, normal 3, colour 3, uv 2 */
function buffer(data) {
    const vao = gl.createVertexArray(), b = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 3, 12], [2, 3, 24], [3, 2, 36]].forEach(([loc, size, at]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 44, at); });
    gl.bindVertexArray(null);
    return { vao, buffer: b, count: data.length / 11 };
}
const free = m => { if (m) { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.buffer); } };
let original = null, quad = null, maps = null;
function buildOriginal() {
    if (!gl) return;
    free(original);
    const p = mesh.positions, data = new Float32Array(mesh.material.length * 33);
    for (let t = 0; t < mesh.material.length; t++)
    {
        const o = t * 9, c = mesh.materials[mesh.material[t]]?.color ?? [1, 1, 1];
        const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        for (let k = 0; k < 3; k++) data.set([p[o + k * 3], p[o + k * 3 + 1], p[o + k * 3 + 2], nx, ny, nz, c[0], c[1], c[2], 0, 0], t * 33 + k * 11);
    }
    original = buffer(data);
}
function uploadMaps() {
    if (!gl) return;
    free(quad);
    if (maps) Object.values(maps).forEach(t => gl.deleteTexture(t));
    const q = result.quad, data = [];
    for (const i of [0, 1, 2, 0, 2, 3]) data.push(...q.positions[i], ...q.normal, 1, 1, 1, ...q.uvs[i]);
    quad = buffer(new Float32Array(data));
    const { width: w, height: h } = result;
    maps = { albedo: textureFrom(gl, result.color, w, h, 3, true), normal: textureFrom(gl, result.normal, w, h, 3), ao: textureFrom(gl, result.ao, w, h, 1), spec: textureFrom(gl, result.spec, w, h, 1) };
}

// map switches
const use = { albedo: true, normal: true, ao: true, spec: true };
$('#toggles').innerHTML = Object.keys(use).map(k => `<label><input type="checkbox" data-use="${k}" checked /> ${k === 'albedo' ? 'color' : k}</label>`).join('');
$('#toggles').onchange = e => { use[e.target.dataset.use] = e.target.checked; };

// orbit camera
const camera = { yaw: .6, pitch: .7, distance: 4, target: [0, 0, 0] };
function fit() {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i++) { const k = i % 3; min[k] = Math.min(min[k], mesh.positions[i]); max[k] = Math.max(max[k], mesh.positions[i]); }
    camera.target = min.map((v, k) => (v + max[k]) / 2);
    camera.distance = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 1.6);
    // look at the baked side
    const n = FRAMES[settings.axis][2];
    camera.yaw = Math.atan2(n[0], n[2]) + .5;
    camera.pitch = n[1] > 0 ? .8 : n[1] < 0 ? -.8 : .25;
}
let drag = null;
canvas.onpointerdown = e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); };
canvas.onpointerup = () => { drag = null; };
canvas.onpointermove = e => {
    if (!drag) return;
    camera.yaw -= (e.clientX - drag[0]) * .008;
    camera.pitch = Math.max(-1.55, Math.min(1.55, camera.pitch + (e.clientY - drag[1]) * .008));
    drag = [e.clientX, e.clientY];
};
canvas.onwheel = e => { e.preventDefault(); camera.distance = Math.max(.2, Math.min(200, camera.distance * Math.exp(e.deltaY * .001))); };

function matrices(aspect) {
    const { yaw, pitch, distance, target } = camera;
    const eye = [target[0] + Math.sin(yaw) * Math.cos(pitch) * distance, target[1] + Math.sin(pitch) * distance, target[2] + Math.cos(yaw) * Math.cos(pitch) * distance];
    const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const z = norm(eye.map((v, k) => v - target[k])), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    const d = a => -(a[0] * eye[0] + a[1] * eye[1] + a[2] * eye[2]);
    const view = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, d(x), d(y), d(z), 1];
    const f = 1 / Math.tan(.4), near = distance * .02, far = distance * 50;
    const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0];
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        out[c * 4 + r] = proj[r] * view[c * 4] + proj[4 + r] * view[c * 4 + 1] + proj[8 + r] * view[c * 4 + 2] + proj[12 + r] * view[c * 4 + 3];
    return { viewProjection: out, eye };
}

function frame(time) {
    requestAnimationFrame(frame);
    if (!gl) return;
    const w = Math.round(canvas.clientWidth * devicePixelRatio), h = Math.round(canvas.clientHeight * devicePixelRatio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(.125, .14, .17, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!result || !quad) return;
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(program.program);
    const { viewProjection, eye } = matrices(w / Math.max(1, h));
    gl.uniformMatrix4fv(program.uniforms.viewProjection, false, viewProjection);
    gl.uniform3fv(program.uniforms.eye, eye);
    // the light circles above the baked side
    const [T, B, N] = FRAMES[settings.axis], a = $('#spin').checked ? time * .0006 : .9;
    const l = [0, 1, 2].map(k => N[k] * .75 + (T[k] * Math.cos(a) + B[k] * Math.sin(a)) * .66);
    gl.uniform3fv(program.uniforms.light, l);
    const repeat = Math.max(1, Math.min(7, Number($('#repeat').value) || 1)), show = $('#show').value;
    const draw = (m, shift, textured) => {
        bindMaps(gl, program.uniforms, textured ? Object.fromEntries(Object.entries(maps).filter(([k]) => use[k])) : undefined);
        gl.bindVertexArray(m.vao);
        for (let i = 0; i < repeat; i++) for (let j = 0; j < repeat; j++)
        {
            const u = (i - (repeat - 1) / 2) * result.size[0] + shift, v = (j - (repeat - 1) / 2) * result.size[1];
            gl.uniform3f(program.uniforms.offset, T[0] * u + B[0] * v, T[1] * u + B[1] * v, T[2] * u + B[2] * v);
            gl.drawArrays(gl.TRIANGLES, 0, m.count);
        }
    };
    const gap = show === 'both' ? repeat * result.size[0] / 2 + result.size[0] * .1 : 0;
    if (show !== 'original') draw(quad, -gap, true);
    if (show !== 'baked' && original) draw(original, gap, false);
    gl.bindVertexArray(null);
}
requestAnimationFrame(frame);

// start: url from the hash, e.g. #/assets/models/buildings/modular-village/Stone_Floor_1.glb
renderForm();
const start = decodeURIComponent(location.hash.slice(1));
if (start) { $('#url').value = start; openUrl(start); }
