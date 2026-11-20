import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { Smoke } from '@polywar/smoke';
import { Explosion } from '@polywar/explosion';
import { AudioMixer } from '@papit/audio';
import { ExplosionAudio } from '@polywar/explosion-audio';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const renderer = new Renderer(demo.layer), smoke = new Smoke(demo.layer, { puffs: 8000 }), explosion = new Explosion(demo.layer, { smoke });
const mixer = new AudioMixer(), audio = new ExplosionAudio({ mixer });
audio.load();
addEventListener('pointerdown', () => mixer.unlock());
let heard = '';
explosion.onexplode = b => { audio.play(b.position, b.power); const v = demo.camera.viewMatrix, d = Math.hypot(v[12], v[13], v[14]); heard = `${audio.pick(b.power, d)} at ${Math.round(d)} m, heard after ${(d / 343).toFixed(1)} s`; };
const SKY = [.55, .72, .88, 1];

// a field with things for scale: 1 m crates, 2 m posts, houses out to 1 km
const b = new MeshBuilder().plane('#7d9a55', { scale: [20000, 1, 20000] });
for (const [x, z] of [[6, 3], [-5, 6], [8, -6], [-9, -4]]) b.box('#a07a4a', { at: [x, .5, z], scale: [1, 1, 1] });
for (const [x, z] of [[3, -9], [-3, -9], [10, 8]]) b.box('#6b5a45', { at: [x, 1, z], scale: [.2, 2, .2] });
for (const [x, z] of [[-18, -14], [30, -40], [-80, 60], [150, -120], [-300, -250], [500, 300]]) b.box('#c9b9a0', { at: [x, 2.5, z], scale: [8, 5, 6] });
const mesh = upload(demo.gl, b.build()), identity = Matrix4.create();

const power = () => 10 ** +$('#power').value;
const show = () => { const p = power(); $('#kg').textContent = p < 10 ? `${p.toFixed(1)} kg` : p < 1000 ? `${Math.round(p)} kg` : `${(p / 1000).toFixed(1)} t`; };
const view = () => { const s = Math.cbrt(power()), d = 10 ** +$('#distance').value + 6 * s; demo.look([-d * .8, 1.7 + d * .06, d * .6], [0, s * 3, 0]); };
const boom = () => explosion.explode([0, 0, 0], { power: power() });
$('#power').oninput = show;
$('#distance').oninput = view; show();
for (const button of document.querySelectorAll('[data-power]'))
    button.onclick = () => { $('#power').value = Math.log10(+button.dataset.power); show(); view(); boom(); };
$('#view').onclick = view;
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); boom(); } });
view();

let wait = 1;
demo.tick = dt => {
    smoke.speed = explosion.speed = +$('#speed').value;
    explosion.look.shock = +$('#shock').value;
    explosion.look.lines = +$('#lines').value;
    if ($('#repeat').checked && (wait -= dt * explosion.speed) <= 0) { wait = 4 + 3 * Math.sqrt(Math.cbrt(power())); boom(); }
    explosion.update(dt);
    smoke.update(dt);
    const v = demo.camera?.viewMatrix;
    // eye from the view matrix: -Rᵀ t
    const eye = v && [-(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]), -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]), -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14])];
    $('#glare').style.opacity = eye ? explosion.glare(eye) * .9 : 0;
    if (eye) audio.setListener(eye, [-v[2], -v[6], -v[10]]);
    $('#info').value = `${smoke.count} puffs\n${heard}`;
};
demo.draw = camera => {
    renderer.begin(camera, SKY);
    renderer.draw(mesh, identity);
    smoke.draw(camera);
    explosion.draw(camera);
    renderer.reset();
};
