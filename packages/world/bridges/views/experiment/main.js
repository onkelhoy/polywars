import '@polywar/gallery';
import { gltfFromMesh } from '@polywar/renderer';
import { merge, sweep } from '@polywar/sweep';
import { PORTAL, bridge, pick, portal } from '@polywar/bridges';

const $ = s => document.querySelector(s);
const gallery = $('pw-gallery');
const num = id => Number($('#' + id).value);

function build() {
    for (const id of ['span', 'height', 'width', 'curve']) $(`#${id} + span`).textContent = $('#' + id).value;
    const span = num('span'), height = num('height'), width = num('width'), bend = num('curve'), use = $('#use').value;
    // a valley: ground drops `height` under the middle
    const ground = (x, z) => -height * Math.max(0, 1 - (x / (span / 2)) ** 2) ** .5;
    const path = [];
    for (let d = -span / 2; d <= span / 2 + 1e-6; d += 2) path.push([d, 0, bend * (d * d) / span]);
    // valley ground strip so the supports have something to stand on
    const groundPath = Array.from({ length: 41 }, (_, i) => { const x = -span / 2 * 1.2 + i / 40 * span * 1.2; return [x, ground(x, 0), 0]; });
    const floor = sweep(groundPath, { width: span * .8, profile: { points: [[-1, 0], [1, 0]], color: [.35, .5, .3] }, bank: 'flat', step: 0 });
    const item = (name, mesh, group = 'bridges') => ({ name, group, kind: 'model', gltf: gltfFromMesh(mesh), note: `${mesh.positions.length / 9 | 0} tris` });
    const types = ['foot-wood', 'slab-stone', 'arch-stone', 'arch-concrete', 'trestle-wood', 'girder'];
    gallery.items = [
        ...types.map(t => item(t + (t === pick(use === 'path' ? 'path' : use, span, height) ? ' ★' : ''), merge([bridge(t, path, { width, ground, use }), floor]))),
        ...Object.keys(PORTAL).map(k => item('portal ' + k, portal([0, 0, 0], [0, -1], PORTAL[k]), 'portals')),
    ];
    $('#info').value = `pick for ${use}: ${pick(use, span, height)}\n` + gallery.items.map(i => `${i.name}: ${i.note}`).join('\n');
}
for (const el of document.querySelectorAll('aside input, aside select')) el.oninput = build;
build();
