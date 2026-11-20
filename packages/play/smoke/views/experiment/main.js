import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { Smoke, DUST, WHITE, GREY } from '@polywar/smoke';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, renderer = new Renderer(demo.layer), smoke = new Smoke(demo.layer);
const COLOURS = { preset: undefined, dust: DUST, white: WHITE, grey: GREY, dark: [.36, .35, .36] };
const SKY = [.55, .72, .88, 1];

// a field with a few things for scale (1 m crates, 2 m posts, a house)
const b = new MeshBuilder().plane('#7d9a55', { scale: [400, 1, 400] });
for (const [x, z] of [[6, 3], [-5, 6], [8, -6], [-9, -4]]) b.box('#a07a4a', { at: [x, .5, z], scale: [1, 1, 1] });
for (const [x, z] of [[3, -9], [-3, -9], [10, 8]]) b.box('#6b5a45', { at: [x, 1, z], scale: [.2, 2, .2] });
b.box('#c9b9a0', { at: [-18, 2.5, -14], scale: [8, 5, 6] });
const mesh = upload(gl, b.build()), identity = Matrix4.create();

const centre = [0, 0, 0], fire = [-7, .1, 2];
let campfire = smoke.emitter('campfire', fire);
let exhaust = smoke.emitter('exhaust', [0, .4, 0]);

const scale = () => +$('#scale').value, colour = () => COLOURS[$('#colour').value];
const blast = () => smoke.burst($('#kind').value, centre, { scale: scale(), colour: colour() });
for (const button of document.querySelectorAll('[data-burst]'))
    button.onclick = () => smoke.burst(button.dataset.burst, centre, { scale: scale(), colour: colour() });
$('#clear').onclick = () => { smoke.clear(); campfire = smoke.emitter('campfire', fire); exhaust = smoke.emitter('exhaust', [0, .4, 0]); };
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); blast(); } });

const far = () => demo.look([-55, 6, 80], [0, 22, 0]), near = () => demo.look([-14, 4, 20], [0, 3, 0]);
$('#near').onclick = near; $('#far').onclick = far;
far();
let wait = .5, time = 0, last = [0, .4, 0];
demo.tick = dt => {
    time += dt * smoke.speed;
    smoke.speed = +$('#speed').value;
    smoke.look.wind = [+$('#wind').value, 0, 0];
    smoke.look.highlight = +$('#highlight').value;
    smoke.look.detail = +$('#detail').value;
    smoke.look.thickness = +$('#thickness').value;
    smoke.look.reach = +$('#reach').value;
    smoke.look.swirl = +$('#swirl').value;
    const a = +$('#sun').value * Math.PI / 180;
    smoke.look.sun = [Math.cos(a) * .5, .8, Math.sin(a) * .5];
    campfire.rate = $('#fire').checked ? 1 : 0;

    // exhaust on a car driving a circle
    const p = [Math.cos(time * .4) * 14, .4, Math.sin(time * .4) * 14];
    exhaust.position = p;
    exhaust.velocity = [(last[0] - p[0]) / Math.max(dt, 1e-3) * .3, 0, (last[2] - p[2]) / Math.max(dt, 1e-3) * .3];
    exhaust.rate = $('#exhaust').checked ? 1 : 0;
    last = p;

    if ($('#repeat').checked && (wait -= dt * smoke.speed) <= 0) { wait = $('#kind').value === 'explosion' ? 7 : 3.2; blast(); }
    smoke.update(dt);
    $('#info').value = `${smoke.count} puffs`;
};
demo.draw = camera => {
    renderer.begin(camera, SKY);
    renderer.draw(mesh, identity);
    smoke.draw(camera);
    renderer.reset();
};
