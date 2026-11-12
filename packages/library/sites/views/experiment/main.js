import { MAPS, shapeOnly } from '@polywar/terrain';
import { generateSites, DEFAULTS } from '@polywar/sites';
import { Map2D } from './map2d.js';

const $ = s => document.querySelector(s);
const map = new Map2D($('#map'), $('#cursor'));
export const COLOURS = { city: '#ff4d4d', village: '#ffb347', farm: '#e8e36a', peak: '#ffffff', pass: '#c58cff', viewpoint: '#5ee0ff', beach: '#ffe0a8', lake: '#4d9dff' };
const COUNTS = { village: 'count', peak: 'count', pass: 'count', viewpoint: 'count', beach: 'count', lake: 'count' };
const counts = {};
for (const k of Object.keys(COUNTS)) {
    const l = document.createElement('label');
    l.innerHTML = `${k} <input type="range" min="0" max="40" step="1" value="${DEFAULTS[k].count}" /><span>${DEFAULTS[k].count}</span>`;
    const input = l.querySelector('input');
    input.oninput = () => { l.querySelector('span').textContent = input.value; counts[k] = +input.value; place(); };
    counts[k] = DEFAULTS[k].count;
    $('#counts').append(l);
}
$('#legend').innerHTML = Object.entries(COLOURS).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join(' ');
for (const name of Object.keys(MAPS)) $('#preset').append(new Option(name, name));
$('#preset').value = 'coast' in MAPS ? 'coast' : Object.keys(MAPS)[0];

let ground = null, sites = [];
async function load() {
    $('#info').textContent = 'generating…';
    const t = performance.now();
    ground = await shapeOnly({ ...MAPS[$('#preset').value], seed: +$('#tseed').value, quality: $('#quality').value });
    $('#info').dataset.t = `shape ${((performance.now() - t) | 0)} ms, ${ground.size} m, ${ground.n}²`;
    map.setGround(ground);
    place();
}
function place() {
    if (!ground) return;
    const t = performance.now(), o = { seed: +$('#seed').value };
    for (const [k, v] of Object.entries(counts)) o[k] = { ...DEFAULTS[k], count: v };
    sites = generateSites(ground, ground.cities, o);
    const by = {};
    for (const s of sites) by[s.kind] = (by[s.kind] ?? 0) + 1;
    $('#info').textContent = `${$('#info').dataset.t}\nsites ${((performance.now() - t) | 0)} ms\n` + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ');
    map.draw();
}
map.ondraw = (ctx, m) => {
    for (const s of sites) {
        const [x, y] = m.px(s.x, s.z), r = Math.max(3, s.radius * m.scale);
        ctx.fillStyle = COLOURS[s.kind]; ctx.strokeStyle = '#000';
        ctx.beginPath();
        if (s.kind === 'peak' || s.kind === 'pass') { ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath(); }
        else ctx.arc(x, y, s.kind === 'city' || s.kind === 'village' ? r : 4, 0, Math.PI * 2);
        ctx.globalAlpha = s.kind === 'city' || s.kind === 'village' ? .6 : 1;
        ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    }
};
for (const id of ['#tseed', '#preset', '#quality']) $(id).onchange = load;
$('#seed').oninput = place;
load();
