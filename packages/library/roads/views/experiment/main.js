import { MAPS, shapeOnly, generate } from '@polywar/terrain';
import { generateSites } from '@polywar/sites';
import { Roads, CLASSES, ERAS, roadHooks } from '@polywar/roads';
import { Map2D } from './map2d.js';

const $ = s => document.querySelector(s);
const map = new Map2D($('#map'), $('#cursor'));
const STYLE = { highway: ['#ffcf4d', 3.5], road: ['#ffffff', 2.2], lane: ['#d9b38c', 1.4], path: ['#ff8fd0', 1], rail: ['#222', 2.5] };
const ROUTES = ['#ff4d4d', '#4dff88', '#4dc3ff', '#ffd24d', '#c34dff', '#ffffff'];
const SITE = { city: '#ff4d4d', village: '#ffb347', farm: '#e8e36a', peak: '#ffffff', pass: '#c58cff', viewpoint: '#5ee0ff', beach: '#ffe0a8', lake: '#4d9dff' };
const KNOBS = { maxGrade: [0, .5, .005], turn: [0, 200, 1], climb: [0, 20, .1], reuse: [.05, 1, .05], minRadius: [0, 400, 5], 'bridge.cost': [1, 200, 1], 'bridge.max': [0, 500, 10], 'tunnel.cost': [1, 200, 1], 'tunnel.max': [0, 800, 10] };
const build = {}, show = {}, classes = structuredClone(ERAS.ww2);

for (const c of CLASSES) {
    build[c] = show[c] = true;
    const l = document.createElement('label');
    l.innerHTML = `<span style="color:${STYLE[c][0] === '#222' ? '#aaa' : STYLE[c][0]};text-align:left">${c}</span><span><input type="checkbox" checked data-b /> <input type="checkbox" checked data-s /></span>`;
    l.querySelector('[data-b]').onchange = e => { build[c] = e.target.checked; rebuild(); };
    l.querySelector('[data-s]').onchange = e => { show[c] = e.target.checked; map.draw(); };
    $('#classes').append(l);
    $('#tune').append(new Option(c, c));
}
$('#tune').value = 'road';
function knobs() {
    const c = classes[$('#tune').value];
    $('#knobs').replaceChildren(...Object.entries(KNOBS).map(([key, [min, max, step]]) => {
        const [a, b] = key.split('.'), get = () => b ? c[a][b] : c[a], set = v => b ? c[a][b] = v : c[a] = v;
        const l = document.createElement('label');
        l.innerHTML = `${key} <input type="range" min="${min}" max="${max}" step="${step}" value="${get()}" /><span>${get()}</span>`;
        const input = l.querySelector('input');
        input.oninput = () => { set(+input.value); l.querySelector('span').textContent = input.value; reroute(); };
        return l;
    }));
}
$('#tune').onchange = knobs; knobs();
for (const name of Object.keys(MAPS)) $('#preset').append(new Option(name, name));
$('#preset').value = 'coast' in MAPS ? 'coast' : Object.keys(MAPS)[0];
for (const el of document.querySelectorAll('aside > fieldset input[type=range]')) {
    const show = () => el.nextElementSibling.textContent = el.value; show(); el.addEventListener('input', show);
}

let ground = null, sites = [], roads = null, picks = [], routes = [], hover = null, info = '', inspect = null;
const options = () => ({ seed: +$('#seed').value, cell: +$('#cell').value, greed: +$('#greed').value, classes, build });

async function load() {
    $('#info').textContent = 'generating…';
    const t = performance.now();
    ground = await shapeOnly({ ...MAPS[$('#preset').value], seed: +$('#tseed').value, quality: $('#quality').value });
    info = `shape ${(performance.now() - t) | 0} ms, ${ground.size} m, ${ground.n}²`;
    sites = generateSites(ground, ground.cities, { seed: +$('#seed').value });
    map.setGround(ground);
    rebuild();
}
async function full() {
    $('#info').textContent = info + '\nfull terrain…';
    const t = performance.now(), hooks = roadHooks(raw => generateSites(raw, raw.cities, { seed: +$('#seed').value }), options());
    const data = await generate({ ...MAPS[$('#preset').value], seed: +$('#tseed').value, quality: $('#quality').value }, null, hooks);
    sites = hooks.sites; roads = hooks.roads;
    map.setGround(data);
    $('#info').textContent = `${info}\nfull terrain ${(performance.now() - t) | 0} ms (roads before erosion, bridges after rivers)`;
    map.draw();
}
function rebuild() {
    if (!ground) return;
    if ($('#eroded').checked) return full();
    $('#info').textContent = info + '\nrouting…';
    setTimeout(() => {
        const t = performance.now();
        roads = new Roads(ground, options());
        roads.build(sites);
        const by = {};
        for (const r of roads.network.roads) by[r.class] = (by[r.class] ?? 0) + 1;
        const spans = roads.network.roads.flatMap(r => r.spans).reduce((a, s) => (a[s.kind] = (a[s.kind] ?? 0) + 1, a), {});
        const km = roads.network.roads.reduce((a, r) => a + (r.points.length - 1) * roads.o.step, 0) / 1000;
        $('#info').textContent = `${info}\nnetwork ${(performance.now() - t) | 0} ms (${Object.entries(roads.timings).map(([k, v]) => `${k} ${v | 0}`).join(', ')})\n`
            + `${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}\n${km.toFixed(1)} km, ${roads.network.junctions.length} junctions, bridges ${spans.bridge ?? 0}, tunnels ${spans.tunnel ?? 0}`;
        reroute();
    }, 20);
}
function reroute() {
    routes = [];
    if (roads && picks.length === 2) {
        roads = Object.assign(new Roads(ground, options()), { network: roads.network });
        roads.load(roads.network);
        const t = performance.now(), [[ax, az], [bx, bz]] = picks;
        routes = roads.route(ax, az, bx, bz, $('#tune').value, +$('#k').value);
        $('#click').textContent = `${$('#tune').value}: ${routes.length} routes, ${(performance.now() - t) | 0} ms\n` + routes.map((r, i) => {
            const len = (r.points.length - 1) * roads.o.step, b = r.spans.filter(s => s.kind === 'bridge').length, tn = r.spans.filter(s => s.kind === 'tunnel').length;
            return `#${i + 1} ${(len / 1000).toFixed(2)} km, cost ${r.cost | 0}${b ? `, ${b} bridge` : ''}${tn ? `, ${tn} tunnel` : ''}`;
        }).join('\n');
    }
    map.draw();
}

function line(ctx, m, points, from = 0, to = points.length - 1) {
    ctx.beginPath();
    for (let i = from; i <= to; i++) { const [x, y] = m.px(points[i][0], points[i][2]); i === from ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
}
function drawRoad(ctx, m, r, colour, width) {
    for (const s of r.spans) {
        ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(s.kind === 'tunnel' ? [4, 4] : []);
        if (s.kind === 'bridge') { ctx.strokeStyle = '#000'; ctx.lineWidth = width + 3; line(ctx, m, r.points, s.from, s.to); ctx.strokeStyle = colour; ctx.lineWidth = width; }
        if (r.class === 'rail' && s.kind !== 'tunnel') { ctx.strokeStyle = '#222'; ctx.lineWidth = width; line(ctx, m, r.points, s.from, s.to); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); }
        line(ctx, m, r.points, s.from, s.to);
    }
    ctx.setLineDash([]);
}
map.ondraw = (ctx, m) => {
    ctx.lineCap = ctx.lineJoin = 'round';
    if ($('#sites').checked) for (const s of sites) {
        const [x, y] = m.px(s.x, s.z);
        ctx.fillStyle = SITE[s.kind]; ctx.globalAlpha = .45;
        ctx.beginPath(); ctx.arc(x, y, Math.max(3, s.radius * m.scale), 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (roads) {
        const order = ['path', 'lane', 'road', 'rail', 'highway'];
        for (const c of order) if (show[c]) for (const r of roads.network.roads) if (r.class === c) drawRoad(ctx, m, r, STYLE[c][0], STYLE[c][1]);
        ctx.fillStyle = '#000';
        for (const j of roads.network.junctions) if (j.roads.length > 2 || j.site === undefined) { const [x, y] = m.px(j.x, j.z); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    }
    routes.forEach((r, i) => drawRoad(ctx, m, { ...r, class: 'x' }, ROUTES[i % ROUTES.length], i ? 2 : 3));
    for (const [i, [x, z]] of picks.entries()) { const [sx, sy] = m.px(x, z); ctx.fillStyle = i ? '#f0f' : '#0f0'; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 7); ctx.fill(); }
    if (hover) { const [x, y] = m.px(hover.x, hover.z); ctx.strokeStyle = '#0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.stroke(); }
    if (inspect) {
        const [x, y] = m.px(inspect.x, inspect.z);
        ctx.strokeStyle = '#0ff'; ctx.lineWidth = 2;
        for (const r of inspect.roads) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(r.angle) * 30, y + Math.sin(r.angle) * 30); ctx.stroke(); }
    }
};
map.onhover = (x, z) => {
    const n = roads?.nearest(x, z, 20 / map.scale);
    hover = n;
    $('#cursor').dataset.road = n ? `${n.road.class} #${n.road.id} (${n.road.surface}, ${n.road.width} m) ${n.distance.toFixed(1)} m` : '';
};
const paint = map.paint.bind(map);
map.paint = () => { paint(); if ($('#cursor').dataset.road) $('#cursor').textContent += '   ' + $('#cursor').dataset.road; };
map.onclick = (x, z) => {
    if ($('#mode').value === 'inspect') {
        const s = sites.reduce((b, s) => !b || Math.hypot(s.x - x, s.z - z) < Math.hypot(b.x - x, b.z - z) ? s : b, null);
        inspect = s && roads?.at(s.id);
        $('#click').textContent = s ? `${s.kind} #${s.id}: ${inspect?.roads.length ?? 0} roads\n` + (inspect?.roads ?? []).map(r => `${r.class} #${r.road} at ${(r.angle * 180 / Math.PI).toFixed(0)}°`).join('\n') : '';
        map.draw();
        return;
    }
    picks = picks.length === 1 ? [picks[0], [x, z]] : [[x, z]];
    reroute();
};
for (const id of ['#tseed', '#preset', '#quality']) $(id).onchange = load;
$('#seed').onchange = () => { sites = generateSites(ground, ground.cities, { seed: +$('#seed').value }); rebuild(); };
for (const id of ['#cell', '#greed']) $(id).onchange = rebuild;
$('#rebuild').onclick = rebuild;
$('#eroded').onchange = () => $('#eroded').checked ? full() : load();
$('#k').oninput = reroute;
$('#sites').onchange = () => map.draw();
$('#mode').onchange = () => { inspect = null; picks = []; routes = []; map.draw(); };
load();
