import { generateFarm, rect, fenceSegments } from '@polywar/farm';
import { fakeGround } from './ground.js';

const $ = s => document.querySelector(s);
const canvas = $('#map'), ctx = canvas.getContext('2d');
const SIZE = 700; // metres shown
const ZONE = { none: '#3a4a30', yard: '#c9a36b', field: '#d8c85a', pasture: '#6fb04f', wood: '#2f6b35' };
let ground, farm;

function build() {
    ground = fakeGround(+$('#tseed').value, +$('#hills').value, $('#river').checked);
    const radius = +$('#radius').value;
    const t = performance.now();
    farm = generateFarm({ x: 0, z: 0, radius, entry: { x: -radius, z: 0 } }, ground, { seed: +$('#seed').value, cell: +$('#cell').value });
    $('#info').textContent = `${(performance.now() - t).toFixed(1)} ms\ncells ${farm.cells.filter(c => c.inside).length} / ${farm.cells.length}\nbuildings ${farm.buildings.length}, fields ${farm.fields.length}\npastures ${farm.pastures.map(p => p.animal).join(' ')}\nfence segs ${farm.fences.reduce((a, l) => a + fenceSegments(l, 5.8).length, 0)}, paths ${farm.paths.length}\nedits ${farm.edits.length} (flatten ${farm.edits.filter(e => e.kind === 'flatten').length})`;
    draw();
}

function draw() {
    const w = canvas.width = canvas.clientWidth * devicePixelRatio, h = canvas.height = canvas.clientHeight * devicePixelRatio;
    const s = Math.min(w, h) / SIZE, px = (x, z) => [w / 2 + x * s, h / 2 + z * s];
    // height shade
    const img = ctx.createImageData(w, h), step = 3;
    for (let j = 0; j < h; j += step) for (let i = 0; i < w; i += step) {
        const x = (i - w / 2) / s, z = (j - h / 2) / s, y = ground.height(x, z);
        const lit = Math.max(0, Math.min(1, .55 + (y - ground.height(x + 2, z - 2)) * .4));
        const wet = ground.water(x, z), v = 40 + y * 3;
        const c = wet ? [40, 90, 170] : [v * .7 + lit * 60, v + lit * 70, v * .5 + lit * 40];
        for (let b = 0; b < step; b++) for (let a = 0; a < step; a++) {
            const k = ((j + b) * w + i + a) * 4; if (i + a >= w || j + b >= h) continue;
            img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    // cells
    const show = $('#show').value;
    for (const c of farm.cells) {
        if (!c.inside) continue;
        ctx.beginPath();
        c.corners.forEach(([x, z], i) => { const [a, b] = px(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
        ctx.closePath();
        if (show === 'edits') { ctx.strokeStyle = '#0003'; ctx.stroke(); continue; }
        ctx.fillStyle = c.water ? '#3a6fc2' : show === 'slope' ? `hsl(${Math.max(0, 120 - c.slope * 600)} 70% 45%)` : ZONE[c.zone];
        ctx.globalAlpha = .55; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#0006'; ctx.lineWidth = 1; ctx.stroke();
    }
    const poly = (pts, close = true) => { ctx.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = px(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); if (close) ctx.closePath(); };
    if (show === 'edits') {
        const COL = { soil: '#7a5230', dirt: '#a8835a', gravel: '#b0aaa0', noGrass: '#f0f', flatten: '#0ff' };
        for (const e of farm.edits) {
            const col = COL[e.kind === 'paint' ? e.paint : e.kind];
            if (e.kind === 'flatten') { poly(rect(e.x, e.z, e.w + e.blend * 2, e.d + e.blend * 2, e.yaw)); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); continue; }
            if (e.poly) { poly(e.poly); ctx.fillStyle = col; ctx.globalAlpha = e.kind === 'noGrass' ? .25 : .7; ctx.fill(); ctx.globalAlpha = 1; }
            else { poly(e.line, false); ctx.strokeStyle = col; ctx.globalAlpha = e.kind === 'noGrass' ? .4 : .8; ctx.lineWidth = e.width * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1; }
        }
    } else {
        for (const p of farm.paths) { poly(p.line, false); ctx.strokeStyle = p.kind === 'lane' ? '#8a6a45' : '#b39470'; ctx.lineWidth = Math.max(2, p.width * s); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
    }
    // fences + gates
    ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 2;
    for (const l of farm.fences) { poly(l, false); ctx.stroke(); }
    ctx.fillStyle = '#fff';
    for (const [x, z] of farm.gates) { const [a, b] = px(x, z); ctx.fillRect(a - 3, b - 3, 6, 6); }
    // buildings
    ctx.font = `${11 * devicePixelRatio}px system-ui`; ctx.textAlign = 'center';
    for (const b of farm.buildings) {
        poly(rect(b.x, b.z, b.w, b.d, b.yaw)); ctx.fillStyle = '#8b2e22'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
        if ($('#labels').checked) { const [a, c] = px(b.x, b.z); ctx.fillStyle = '#fff'; ctx.fillText(b.asset, a, c - b.d * s / 2 - 4); }
    }
    if ($('#labels').checked) for (const p of farm.pastures) {
        if (!p.cells.length) continue;
        const x = p.cells.reduce((a, c) => a + farm.cells[c].x, 0) / p.cells.length, z = p.cells.reduce((a, c) => a + farm.cells[c].z, 0) / p.cells.length;
        const [a, c] = px(x, z); ctx.fillStyle = '#fff'; ctx.fillText(p.animal, a, c);
    }
    // area + entry
    const [cx, cz] = px(farm.area.x, farm.area.z);
    ctx.strokeStyle = '#fff'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(cx, cz, farm.area.radius * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    if (farm.area.entry) { const [ex, ez] = px(farm.area.entry.x, farm.area.entry.z); ctx.fillStyle = '#f44'; ctx.beginPath(); ctx.arc(ex, ez, 6, 0, Math.PI * 2); ctx.fill(); }
}

for (const el of document.querySelectorAll('aside input, aside select')) el.oninput = build;
addEventListener('resize', draw);
build();
