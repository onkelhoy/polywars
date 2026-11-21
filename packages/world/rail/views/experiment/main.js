import '@polywar/gallery';
import { gltfFromMesh } from '@polywar/renderer';
import { loadGLTF } from '@papit/game-mesh';
import { merge } from '@polywar/sweep';
import { SLEEPER_MODEL, bake, track } from '@polywar/rail';

const $ = s => document.querySelector(s);
const gallery = $('pw-gallery');
const num = id => Number($('#' + id).value);
const sleeper = (await loadGLTF(`/assets/models/${SLEEPER_MODEL}.glb`)).meshes[0].primitives;

function curve(seed, length, curvy, hills) {
    let s = seed * 9301 + 49297;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const k = [rnd(), rnd(), rnd()].map(v => v * 6.28), pts = [];
    let x = -length / 2, z = 0;
    for (let d = 0; d <= length; d += 2)
    {
        const h = curvy * Math.sin(d / 30 + k[0]);
        x += Math.cos(h) * 2; z += Math.sin(h) * 2;
        pts.push([x, hills * Math.sin(d / 40 + k[1]), z]);
    }
    return pts;
}

function build() {
    for (const id of ['length', 'curvy', 'hills']) $(`#${id} + span`).textContent = $('#' + id).value;
    const t = track(curve(num('seed'), num('length'), num('curvy'), num('hills')));
    const near = merge([t.lods[0], ...sleeper.map(m => bake(m, t.sleepers))]);
    const item = (name, mesh) => ({ name, group: 'rail', kind: 'model', gltf: gltfFromMesh(mesh), note: `${mesh.positions.length / 9 | 0} tris` });
    gallery.items = [item('track', near), item('lod1', t.lods[1]), item('lod2', t.lods[2]), item('sleeper', merge(sleeper.map(m => bake(m, { data: new Float32Array([0, 0, 0, 1, 0, 1, 0, 1]), count: 1 }))))];
    $('#info').value = `${t.sleepers.count} sleepers\n` + gallery.items.map(i => `${i.name}: ${i.note}`).join('\n');
}
for (const el of document.querySelectorAll('aside input')) el.oninput = build;
build();
