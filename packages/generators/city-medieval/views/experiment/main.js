import '@polywar/gallery';
import { DEFAULTS, ROOFS, SHAPES, TRI_KEYS, WINDOWS, building, compose, decode, encode, kitSource, randomSeed, variant } from '@polywar/city-medieval';

const $ = s => document.querySelector(s);
const gallery = $('pw-gallery');
const form = $('#settings');
let settings = structuredClone(DEFAULTS);

// ---- settings form: ranges, selects, tri-states ----
const range = (k, max) => `<label class="range">${k} <span><input name="${k}0" type="number" min="1" max="${max}" value="${settings[k][0]}"> – <input name="${k}1" type="number" min="1" max="${max}" value="${settings[k][1]}"></span></label>`;
const select = (k, options) => `<label>${k} <select name="${k}">${options.map(o => `<option ${o === settings[k] ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
function renderForm() {
    form.innerHTML = range('width', 16) + range('depth', 16) + range('floors', 6) + select('shape', SHAPES) + select('roof', ROOFS) + select('windows', WINDOWS)
        + TRI_KEYS.map(k => select(k, ['off', 'on', 'random'])).join('');
}
function readForm() {
    const d = new FormData(form);
    for (const k of ['width', 'depth', 'floors']) settings[k] = [Number(d.get(k + '0')), Number(d.get(k + '1'))];
    for (const k of ['shape', 'roof', 'windows', ...TRI_KEYS]) settings[k] = d.get(k);
}

// ---- generate: one master seed, N x N variants that all respect the settings, shown in the gallery ----
let ticket = 0;
async function generate() {
    readForm();
    const seed = Number($('#seed').value) >>> 0, n = Number($('#count').value), mine = ++ticket;
    $('#code').value = encode(settings, seed);
    location.hash = $('#code').value;
    const source = kitSource($('#base').value, $('#base').value.replace(/\/$/, '') + '-baked');
    const items = await Promise.all(Array.from({ length: n * n }, async (_, i) => {
        const s = variant(seed, i), b = building(settings, s), gltf = await compose(b.pieces, source);
        const f = b.features;
        return { name: `${i + 1} · ${encode(settings, s)}`, group: 'medieval', kind: 'model', gltf, note: `${f.shape} ${f.width}x${f.depth} · ${f.floors} floors · ${f.roof} · ${TRI_KEYS.filter(k => f[k] === true).join(' ')}` };
    }));
    if (mine !== ticket) return;
    gallery.items = items;
    const missing = [...new Set(items.flatMap(i => i.gltf.missing))];
    $('#info').value = `${items.length} variants` + (missing.length ? ` · missing: ${missing.join(', ')}` : '');
}

$('#dice').onclick = () => { $('#seed').value = randomSeed(); generate(); };
$('#generate').onclick = generate;
// pieces of the house in the build code field, for tools/blender/export-house.mjs
$('#export').onclick = () => {
    const parsed = decode($('#code').value);
    if (!parsed) return;
    const blob = new Blob([JSON.stringify({ code: $('#code').value, pieces: building(parsed.settings, parsed.seed).pieces })], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${$('#code').value}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
};
form.onchange = generate;
$('#count').onchange = generate;
$('#base').onchange = generate;
$('#code').onchange = () => {
    const parsed = decode($('#code').value);
    if (!parsed) return;
    settings = parsed.settings;
    $('#seed').value = parsed.seed;
    renderForm();
    generate();
};

// start from the url code, else a fresh seed
const start = decode(decodeURIComponent(location.hash.slice(1)));
if (start) settings = start.settings;
$('#seed').value = start?.seed ?? randomSeed();
renderForm();
generate();
