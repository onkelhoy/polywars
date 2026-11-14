import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { AudioMixer } from '@papit/audio';
import { Gun, GUNS } from '@polywar/weapons';
import { WeaponAudio } from '@polywar/weapon-audio';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, renderer = new Renderer(demo.layer);

// boxes: a street (two long walls) at z -60, a room (walls + roof) at z 60
const boxes = [
    { min: [-6, 0, -100], max: [-5, 8, -20] }, { min: [5, 0, -100], max: [6, 8, -20] },
    { min: [-4, 0, 54], max: [4, 3, 54.3] }, { min: [-4, 0, 65.7], max: [4, 3, 66] },
    { min: [-4.3, 0, 54], max: [-4, 3, 66] }, { min: [4, 0, 54], max: [4.3, 3, 58] }, { min: [4, 0, 61], max: [4.3, 3, 66] },
    { min: [-4.3, 3, 54], max: [4.3, 3.2, 66] },
];
const spots = { open: [0, 1.5, 0], walls: [0, 1.5, -60], indoor: [0, 1.5, 60] };

/** ray (segment) against the boxes and the ground: the nearest point */
function cast(from, to) {
    const d = to.map((v, k) => v - from[k]);
    let best = Infinity;
    if (d[1] < 0) best = Math.min(best, -from[1] / d[1]);
    for (const b of boxes)
    {
        let lo = 0, hi = 1;
        for (let k = 0; k < 3; k++)
        {
            if (Math.abs(d[k]) < 1e-9) { if (from[k] < b.min[k] || from[k] > b.max[k]) { lo = 2; break; } continue; }
            let t0 = (b.min[k] - from[k]) / d[k], t1 = (b.max[k] - from[k]) / d[k];
            if (t0 > t1) [t0, t1] = [t1, t0];
            lo = Math.max(lo, t0); hi = Math.min(hi, t1);
        }
        if (lo <= hi && lo < best) best = lo;
    }
    return best <= 1 ? { point: from.map((v, k) => v + d[k] * best) } : null;
}

const b = new MeshBuilder().plane('#6f8f4e', { scale: [400, 1, 400] });
for (const x of boxes) b.box('#8d8a84', { at: x.min.map((v, k) => (v + x.max[k]) / 2), scale: x.min.map((v, k) => x.max[k] - v) });
const world = upload(gl, b.build());
const ball = colour => upload(gl, new MeshBuilder().sphere(colour, { scale: .3 }, 2).build());
const shooterMesh = ball('#d04040'), earMesh = ball('#4070d0'), identity = Matrix4.create();
const at = p => Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...p, 1]);

const mixer = new AudioMixer();
const audio = new WeaponAudio({ mixer, cast });
await audio.load('brass');

const models = [...new Map(Object.entries(GUNS).map(([id, g]) => [g.model, id])).values()];
for (const id of models) $('#gun').append(new Option(GUNS[id].name, id));
$('#gun').value = 'kar98k';

let gun, held = false, info = '';
async function pick() {
    gun = new Gun($('#gun').value);
    await audio.load(gun.spec.model);
    gun.oncue = (cue, g) => {
        const p = spots[$('#spot').value];
        if (cue === 'shot') audio.shot(g.spec.model, p);
        else if (cue === 'eject') setTimeout(() => audio.brass($('#surface').value, [p[0] + .5, 0, p[2]], g.spec.kind === 'pistol' ? .5 : 1), 350 + Math.random() * 200);
        else audio.part(g.spec.model, cue, p);
        info = `${cue} · ${audio.scene(p)}`;
    };
}
await pick();
$('#gun').onchange = pick;
$('#fire').onpointerdown = () => { held = true; mixer.unlock(); };
addEventListener('pointerup', () => { held = false; });
$('#reload').onclick = () => gun.reload();

demo.look([12, 10, 18], [0, 1, 0]);
let spot = '';
demo.tick = dt => {
    const p = spots[$('#spot').value], off = +$('#ear').value;
    if (spot !== $('#spot').value) { spot = $('#spot').value; demo.look([p[0] + 12, 10, p[2] + 18], p); }
    const ear = [p[0] + off, 1.6, p[2]];
    audio.setListener(ear, [-1, 0, 0]);
    gun.trigger(held);
    gun.update(dt);
    $('#earv').textContent = `${off} m`;
    $('#info').value = `${gun.spec.name} (${gun.action}) ${gun.rounds}/${gun.spec.magazine}${gun.reloading > 0 ? ' reloading' : ''}\n${info}`;
    demo.ear = ear;
};
demo.draw = camera => {
    renderer.begin(camera, demo.background);
    renderer.draw(world, identity);
    renderer.draw(shooterMesh, at(spots[$('#spot').value]));
    if (demo.ear) renderer.draw(earMesh, at(demo.ear));
    renderer.reset();
};
