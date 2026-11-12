import { simplex, value, fbm, ridged, billow, warp, tileable } from '@polywar/noise';

const $ = s => document.querySelector(s);
const N = 192;
const show = (name, f) => {
    const c = Object.assign(document.createElement('canvas'), { width: N, height: N }), ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = f(x, y) * 255, i = (y * N + x) * 4; img.data.set([v, v, v, 255], i); }
    ctx.putImageData(img, 0, 0);
    const fig = document.createElement('figure');
    fig.append(c, Object.assign(document.createElement('figcaption'), { textContent: name }));
    $('main').append(fig);
};
const draw = () => {
    $('main').replaceChildren();
    const seed = Number($('#seed').value), s = Number($('#scale').value) / N;
    const n = simplex(seed), v = value(seed), t = tileable(N, 4, seed);
    show('simplex', (x, y) => n(x * s, y * s) * .5 + .5);
    show('value', (x, y) => v(x * s, y * s) * .5 + .5);
    show('fbm', (x, y) => fbm(n, x * s, y * s) * .5 + .5);
    show('ridged', (x, y) => ridged(n, x * s, y * s));
    show('billow', (x, y) => billow(n, x * s, y * s));
    show('warp', (x, y) => fbm(n, ...warp(n, x * s, y * s, 1.5)) * .5 + .5);
    show('tileable', (x, y) => t[y * N + x] / 255);
};
$('#seed').oninput = draw;
$('#scale').oninput = draw;
draw();
