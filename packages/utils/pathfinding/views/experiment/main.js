import { GridSearch, alternatives } from '@polywar/pathfinding';

const $ = s => document.querySelector(s);
const canvas = $('#map'), ctx = canvas.getContext('2d');
const COLOURS = ['#ff4d4d', '#ffd24d', '#4dff88', '#4dc3ff', '#c34dff', '#ffffff'];
const search = new GridSearch();
let n = 200, rough, wall, a = -1, b = -1, routes = [], image;

function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, s) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (hash(i, j, s) * (1 - u) + hash(i + 1, j, s) * u) * (1 - v) + (hash(i, j + 1, s) * (1 - u) + hash(i + 1, j + 1, s) * u) * v;
}
function build() {
    n = +$('#size').value; const seed = +$('#seed').value, w = +$('#walls').value;
    rough = new Float32Array(n * n); wall = new Uint8Array(n * n);
    const img = new ImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, f = 12 / n;
        rough[k] = noise(i * f, j * f, seed) * .6 + noise(i * f * 3, j * f * 3, seed + 1) * .4;
        wall[k] = noise(i * f * 1.5, j * f * 1.5, seed + 7) < w * .8 ? 1 : 0;
        const c = wall[k] ? 30 : 200 - rough[k] * 150;
        img.data.set([c, wall[k] ? 30 : c * .9 + 20, wall[k] ? 40 : c * .7], k * 4); img.data[k * 4 + 3] = 255;
    }
    image = new OffscreenCanvas(n, n); image.getContext('2d').putImageData(img, 0, 0);
    route();
}
function route() {
    routes = [];
    if (a >= 0 && b >= 0) {
        const turn = +$('#turn').value, k = +$('#rough').value, t = performance.now();
        const o = {
            n, headings: +$('#headings').value, from: a, to: b, minCost: 1,
            cost: (f, to, h, prev, tr) => {
                if (wall[to]) return Infinity;
                const dx = to % n - f % n, dz = ((to / n) | 0) - ((f / n) | 0);
                return Math.hypot(dx, dz) * (1 + rough[to] * k) + tr * turn;
            },
        };
        routes = alternatives(o, { k: +$('#k').value, penalty: +$('#penalty').value, overlap: +$('#overlap').value }, search);
        $('#info').textContent = `${routes.length} routes, ${(performance.now() - t).toFixed(0)} ms\n` + routes.map((r, i) => `#${i + 1} cost ${r.cost.toFixed(0)}, ${r.nodes.length} nodes, visited ${r.visited}`).join('\n');
    }
    draw();
}
function fit() { const s = Math.min(innerWidth, innerHeight) * .95; return { s: s / n, x: (innerWidth - s) / 2 + 150, y: (innerHeight - s) / 2 }; }
function draw() {
    canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const f = fit(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, f.x, f.y, n * f.s, n * f.s);
    const p = k => [f.x + (k % n + .5) * f.s, f.y + (((k / n) | 0) + .5) * f.s];
    routes.forEach((r, i) => {
        ctx.strokeStyle = COLOURS[i % COLOURS.length]; ctx.lineWidth = i ? 2 : 3.5; ctx.beginPath();
        r.nodes.forEach((k, s) => ctx[s ? 'lineTo' : 'moveTo'](...p(k))); ctx.stroke();
    });
    for (const [k, c] of [[a, '#0f0'], [b, '#f0f']]) if (k >= 0) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(...p(k), 6, 0, 7); ctx.fill(); }
}
canvas.onclick = e => {
    const f = fit(), i = Math.floor((e.clientX - f.x) / f.s), j = Math.floor((e.clientY - f.y) / f.s);
    if (i < 0 || j < 0 || i >= n || j >= n) return;
    if (a < 0 || b >= 0) { a = j * n + i; b = -1; } else b = j * n + i;
    route();
};
for (const el of document.querySelectorAll('input[type=range]')) {
    const show = () => el.nextElementSibling.textContent = el.value; show();
    el.addEventListener('input', () => { show(); el.id === 'walls' ? build() : route(); });
}
for (const id of ['#size', '#seed']) $(id).onchange = () => { a = b = -1; build(); };
$('#headings').onchange = route;
addEventListener('resize', draw);
build();
