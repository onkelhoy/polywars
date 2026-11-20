import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { World, RigidBody, Plane, Box } from '@papit/rigidbody';
import { Smoke } from '@polywar/smoke';
import { Explosion, ShockFront } from '@polywar/explosion';
import { AudioMixer } from '@papit/audio';
import { ExplosionAudio } from '@polywar/explosion-audio';
import { BlastForce, bodyTargets, worldCover } from '@polywar/blast-force';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, renderer = new Renderer(demo.layer), smoke = new Smoke(demo.layer, { puffs: 6000 }), explosion = new Explosion(demo.layer, { smoke });
const SKY = [.55, .72, .88, 1];
const ground = upload(gl, new MeshBuilder().plane('#7d9a55', { scale: [2000, 1, 2000] }).build()), identity = Matrix4.create();

let world, things, force;
const log = [];
const reset = () => {
    world = new World();
    world.add(new RigidBody({ shape: new Plane() }));
    things = [];
    const add = (size, mass, at, colour) => {
        const body = world.add(new RigidBody({ shape: new Box(...size), mass, position: { x: at[0], y: at[1] + size[1] / 2, z: at[2] }, friction: .7, restitution: .1 }));
        things.push({ body, mesh: upload(gl, new MeshBuilder().box(colour, { at: [0, 0, 0], scale: size }).build()), matrix: new Float32Array(16) });
        return body;
    };
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = 4 + (i % 3) * 3; add([1, 1, 1], 20, [Math.cos(a) * r, 0, Math.sin(a) * r], '#a07a4a'); }
    add([4, 1.6, 2], 1500, [0, 0, 8], '#55603f');           // jeep
    add([.5, 1.8, .3], 80, [0, 0, 11], '#3a62b0');          // dummy behind the jeep
    add([.5, 1.8, .3], 80, [0, 0, -11], '#b03a3a');         // dummy in the open
    add([.3, 3, 6], 0, [-7, 0, 0], '#c9b9a0');              // wall (static)
    add([1, 1, 1], 20, [-8.5, 0, 0], '#a07a4a');            // crate behind the wall
    // let them settle and sleep before the blast
    for (let i = 0; i < 120; i++) world.update(1 / 60);
    force = new BlastForce({
        targets: () => bodyTargets(world), cover: worldCover(world), front: p => new ShockFront(p), strength: +$('#strength').value,
        onhit: (t, hit) => log.unshift(`${t.mass} kg at ${hit.distance.toFixed(1)} m: ${hit.pressure.toFixed(0)} kPa, cover ${hit.cover.toFixed(2)}, Δv ${(hit.impulse / t.mass).toFixed(1)} m/s`),
    });
};
reset();

const power = () => 10 ** +$('#power').value;
const show = () => { const p = power(); $('#kg').textContent = p < 10 ? `${p.toFixed(1)} kg` : `${Math.round(p)} kg`; };
$('#power').oninput = show; show();
$('#reset').onclick = reset;
const mixer = new AudioMixer(), audio = new ExplosionAudio({ mixer });
audio.load();
addEventListener('pointerdown', () => mixer.unlock());
explosion.onexplode = b => { force.blast(b.position, b.power); audio.play(b.position, b.power); };
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); log.length = 0; explosion.explode([0, 0, 0], { power: power() }); } });
demo.look([-22, 9, 20], [0, 0, 0]);

demo.tick = dt => {
    const speed = +$('#speed').value;
    smoke.speed = explosion.speed = speed;
    explosion.update(dt);
    smoke.update(dt);
    force.update(dt * speed);
    world.update(dt * speed);
    const v = demo.camera?.viewMatrix;
    const eye = v && [-(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]), -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]), -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14])];
    $('#glare').style.opacity = eye ? explosion.glare(eye) * .9 : 0;
    if (eye) audio.setListener(eye, [-v[2], -v[6], -v[10]]);
    $('#info').value = log.slice(0, 16).join('\n');
};
demo.draw = camera => {
    renderer.begin(camera, SKY);
    renderer.draw(ground, identity);
    for (const t of things) renderer.draw(t.mesh, t.body.matrix(t.matrix));
    smoke.draw(camera);
    explosion.draw(camera);
    renderer.reset();
};
