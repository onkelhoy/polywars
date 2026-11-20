import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { Smoke } from '@polywar/smoke';
import { World, RigidBody, Plane, Box } from '@papit/rigidbody';
import { AudioMixer } from '@papit/audio';
import { Explosion, ShockFront, BlastForce, ExplosionAudio, Daze, bodyTargets, worldCover } from '@polywar/explosion';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const renderer = new Renderer(demo.layer), smoke = new Smoke(demo.layer, { puffs: 8000 }), explosion = new Explosion(demo.layer, { smoke });
const SKY = [.55, .72, .88, 1];

// a field with things for scale: 1 m crates, 2 m posts, houses out to 1 km
const b = new MeshBuilder().plane('#7d9a55', { scale: [20000, 1, 20000] });
for (const [x, z] of [[-18, -14], [30, -40], [-80, 60], [150, -120], [-300, -250], [500, 300]]) b.box('#c9b9a0', { at: [x, 2.5, z], scale: [8, 5, 6] });
const gl = demo.gl, mesh = upload(gl, b.build()), identity = Matrix4.create();

// things that move: crates (20 kg), a jeep (1.5 t), dummies (80 kg, blue behind the jeep, red in the open), a wall with a crate behind it
let world, things, force, eye = [0, 0, 0];
const daze = new Daze(demo.layer);
// you (the camera) as a target: dazed and deafened by how hard it hits
const you = { get position() { return { x: eye[0], y: eye[1], z: eye[2] }; }, mass: 80, size: .45, push(_v, _s, hit) { const a = Math.min(1, hit.pressure / 60); daze.hit(a); audio.stun(a); } };
const log = [];
const reset = () => {
    world = new World();
    world.add(new RigidBody({ shape: new Plane() }));
    things = [];
    const add = (size, mass, at, colour) => {
        const body = world.add(new RigidBody({ shape: new Box(...size), mass, position: { x: at[0], y: at[1] + size[1] / 2, z: at[2] }, friction: .7, restitution: .1 }));
        things.push({ body, mesh: upload(gl, new MeshBuilder().box(colour, { at: [0, 0, 0], scale: size }).build()), matrix: new Float32Array(16) });
    };
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = 4 + (i % 3) * 3; add([1, 1, 1], 20, [Math.cos(a) * r, 0, Math.sin(a) * r], '#a07a4a'); }
    add([4, 1.6, 2], 1500, [0, 0, 8], '#55603f');
    add([.5, 1.8, .3], 80, [0, 0, 11], '#3a62b0');
    add([.5, 1.8, .3], 80, [0, 0, -11], '#b03a3a');
    add([.3, 3, 6], 0, [-7, 0, 0], '#c9b9a0');
    add([1, 1, 1], 20, [-8.5, 0, 0], '#a07a4a');
    for (let i = 0; i < 120; i++) world.update(1 / 60);
    force = new BlastForce({
        targets: () => [...bodyTargets(world), you], cover: worldCover(world), front: p => new ShockFront(p), strength: +$('#strength').value,
        onhit: (t, hit) => log.unshift(`${t.mass} kg at ${hit.distance.toFixed(1)} m: ${hit.pressure.toFixed(0)} kPa, cover ${hit.cover.toFixed(2)}, Δv ${(hit.impulse / t.mass).toFixed(1)} m/s`),
    });
};
reset();
$('#reset').onclick = reset;

const mixer = new AudioMixer(), audio = new ExplosionAudio({ mixer });
audio.load();
addEventListener('pointerdown', () => mixer.unlock());
let heard = '';
explosion.onexplode = b => {
    log.length = 0;
    force.blast(b.position, b.power);
    audio.play(b.position, b.power);
    const v = demo.camera.viewMatrix, d = Math.hypot(v[12], v[13], v[14]);
    heard = `${audio.pick(b.power, d)} at ${Math.round(d)} m, heard after ${(d / 343).toFixed(1)} s`;
};

const power = () => 10 ** +$('#power').value;
const show = () => { const p = power(); $('#kg').textContent = p < 10 ? `${p.toFixed(1)} kg` : p < 1000 ? `${Math.round(p)} kg` : `${(p / 1000).toFixed(1)} t`; };
const view = () => { const s = Math.cbrt(power()), d = 10 ** +$('#distance').value + 6 * s; demo.look([-d * .8, 1.7 + d * .06, d * .6], [0, s * 3, 0]); };
const boom = () => explosion.explode([0, 0, 0], { power: power() });
$('#power').oninput = show; show();
for (const button of document.querySelectorAll('[data-power]'))
    button.onclick = () => { $('#power').value = Math.log10(+button.dataset.power); show(); view(); boom(); };
$('#view').onclick = view;
$('#distance').oninput = view;
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); boom(); } });
view();

let wait = 1;
demo.tick = dt => {
    smoke.speed = explosion.speed = +$('#speed').value;
    explosion.look.shock = +$('#shock').value;
    explosion.look.bend = +$('#bend').value;
    explosion.look.lineLow = +$('#low').value;
    explosion.look.lineTop = +$('#top').value;
    smoke.look.fade = +$('#fade').value;
    smoke.look.eat = +$('#eat').value;
    smoke.look.grain = +$('#grain').value;
    if ($('#repeat').checked && (wait -= dt * explosion.speed) <= 0) { wait = 4 + 3 * Math.sqrt(Math.cbrt(power())); boom(); }
    explosion.update(dt);
    smoke.update(dt);
    force.update(dt * explosion.speed);
    world.update(dt * explosion.speed);
    const v = demo.camera?.viewMatrix;
    // eye from the view matrix: -Rᵀ t
    eye = v && [-(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]), -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]), -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14])];
    $('#glare').style.opacity = eye ? explosion.glare(eye) * .9 : 0;
    daze.update(dt);
    if (eye) audio.setListener(eye, [-v[2], -v[6], -v[10]]);
    $('#info').value = `${smoke.count} puffs\n${heard}\n${log.slice(0, 12).join('\n')}`;
};
demo.draw = camera => {
    renderer.begin(camera, SKY);
    renderer.draw(mesh, identity);
    for (const t of things) renderer.draw(t.mesh, t.body.matrix(t.matrix));
    smoke.draw(camera);
    explosion.draw(camera);
    daze.draw();
    renderer.reset();
};
