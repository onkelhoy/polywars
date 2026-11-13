import '@polywar/gallery';
import { gltfFromMesh } from '@polywar/renderer';
import { PROFILES, merge, sweep, sweepLods } from '@polywar/sweep';

const $ = s => document.querySelector(s);
const gallery = $('pw-gallery');
const num = id => Number($('#' + id).value);

/** a wandering 3D curve from a seed */
function curve(seed, length, curvy, hills) {
    let s = seed * 9301 + 49297;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const k = [rnd(), rnd(), rnd(), rnd()].map(v => v * 6.28);
    const pts = [];
    let x = -length / 2, z = 0, h = 0;
    for (let d = 0; d <= length; d += 4)
    {
        h = curvy * (Math.sin(d / 25 + k[0]) * 1.1 + Math.sin(d / 11 + k[1]) * .5);
        x += Math.cos(h) * 4; z += Math.sin(h) * 4;
        pts.push([x, hills * (Math.sin(d / 40 + k[2]) * .7 + Math.sin(d / 17 + k[3]) * .3), z]);
    }
    return pts;
}

function build() {
    for (const id of ['length', 'curvy', 'hills', 'width', 'bank', 'step', 'bands']) $(`#${id} + span`).textContent = $('#' + id).value;
    const path = curve(num('seed'), num('length'), num('curvy'), num('hills'));
    const width = num('width'), step = num('step'), bands = num('bands') ? { every: num('bands'), shade: .12 } : undefined;
    const road = { width, step, profile: PROFILES.road, bank: { max: num('bank') * Math.PI / 180, gain: 6 }, bands };
    const [r0, r1, r2] = sweepLods(path, road, [{ step: step * 3, profile: PROFILES.flat, bands: undefined }, { step: step * 8, profile: PROFILES.flat, bands: undefined }]);
    // river: water flat across, bed + banks under it, width grows downstream
    const widths = path.map((_, i) => width * (.6 + i / path.length));
    const river = merge([
        sweep(path, { width: widths, step, profile: PROFILES.bed, bank: 'flat' }),
        sweep(path.map(p => [p[0], p[1] - .2, p[2]]), { width: widths, step, profile: PROFILES.water, bank: 'flat' }),
    ]);
    const item = (name, mesh) => ({ name, group: 'sweep', kind: 'model', gltf: gltfFromMesh(mesh), note: `${mesh.positions.length / 9} tris` });
    gallery.items = [item('road', r0), item('road lod1', r1), item('road lod2', r2), item('river (flat)', river)];
    $('#info').value = gallery.items.map(i => `${i.name}: ${i.note}`).join('\n');
}

for (const el of document.querySelectorAll('aside input')) el.oninput = build;
build();
