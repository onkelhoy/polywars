import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { Smoke } from '@polywar/smoke';
import { World, RigidBody, Plane, Box } from '@papit/rigidbody';
import { Grass } from '@polywar/grass';
import { AudioMixer } from '@papit/audio';
import { Explosion, ShockFront, shellShock, BlastForce, ExplosionAudio, Daze, Knockdown, bodyTargets, worldCover } from '@polywar/explosion';

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
// grass round the blast: each blast leaves a scorch and clears the grass on it
const grass = new Grass(demo.layer);
const plantGrass = () => grass.plant({ area: { x: -80, z: -80, width: 160, depth: 160 }, seed: 1 });
plantGrass();
explosion.onmark = (x, z, r) => grass.clear(x, z, r);
let world, things, force, eye = [0, 0, 0];
const daze = new Daze(demo.layer);
// you (the camera) as a target: dazed and deafened by how hard it hits
const knock = new Knockdown({ eye: 1.7 });
// each blink clears a bit of the smear
knock.onblink = () => daze.clear(.3);
// pushed no more than `cap`; the rest (and the shock) knocks you over
const you = {
    get position() { return { x: eye[0], y: eye[1], z: eye[2] }; }, mass: 80, size: .45,
    get lift() { return +$('#lift').value; }, get cap() { return +$('#cap').value; },
    push(v, _s, hit) {
        const a = shellShock(hit.pressure); daze.hit(a); audio.stun(a);
        demo.walker?.mover.push(v[0], v[1], v[2]);
        knock.setting.threshold = +$('#knock').value;
        const r = demo.camera.rotation;
        knock.hit(Math.max(a, Math.min(1, hit.over / 6)), hit.direction, r.y, r.x);
    },
};

// play: walk round (P), dazed you turn slowly (the look slows with the daze)
demo.walking = { ground: () => 0, lookScale: () => 1 - .85 * daze.amount, lookSpring: () => daze.amount * .5, moveScale: () => 1 - .7 * daze.amount, pose: () => knock.active ? knock : undefined };
$('#play').onclick = () => { mixer.unlock(); demo.mode = 'walk'; };
addEventListener('keydown', e => { if (e.code === 'KeyP' && demo.mode !== 'walk') { mixer.unlock(); demo.mode = 'walk'; } });
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
$('#reset').onclick = () => { reset(); explosion.clear(); plantGrass(); };

const mixer = new AudioMixer(), audio = new ExplosionAudio({ mixer });
audio.load();
addEventListener('pointerdown', () => mixer.unlock());
let heard = '';

// a background loop made here (a beat, a bass, a little tune) on the music bus: it goes through the muffle like everything else
const loop = () => {
    const c = mixer.context, rate = c.sampleRate, beat = .5, bars = 8, n = Math.round(rate * beat * bars), b = c.createBuffer(1, n, rate), x = b.getChannelData(0);
    const tune = [0, 3, 7, 10, 7, 3, 5, 2], bass = [0, 0, -4, -4, -2, -2, -5, -5];
    for (let i = 0; i < n; i++)
    {
        const t = i / rate, k = Math.floor(t / beat), u = t - k * beat, h = (t % (beat / 2));
        let v = Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-u * 30)) * u) * Math.exp(-u * 8) * .8;           // kick
        v += (Math.random() * 2 - 1) * Math.exp(-h * 60) * .12;                                              // hat
        v += Math.sign(Math.sin(2 * Math.PI * 55 * 2 ** (bass[k] / 12) * t)) * .1 * Math.exp(-u * 2);          // bass
        v += Math.sin(2 * Math.PI * 440 * 2 ** (tune[k] / 12) * t) * .18 * Math.exp(-u * 4);                   // tune
        x[i] = v * .6;
    }
    const s = c.createBufferSource();
    s.buffer = b; s.loop = true;
    s.connect(mixer.bus('music').gain);
    s.start();
    return s;
};
let music;
$('#music').onchange = () => { mixer.unlock(); if ($('#music').checked) music ??= loop(); else { music?.stop(); music = undefined; } };
explosion.onexplode = b => {
    log.length = 0;
    force.blast(b.position, b.power);
    audio.play(b.position, b.power);
    const v = demo.camera.viewMatrix, d = Math.hypot(v[12], v[13], v[14]);
    heard = `${audio.pick(b.power, d)} at ${Math.round(d)} m, heard after ${(d / 343).toFixed(1)} s`;
};

const power = () => 10 ** +$('#power').value;
const show = () => { const p = power(); $('#kg').textContent = p < 10 ? `${p.toFixed(1)} kg` : p < 1000 ? `${Math.round(p)} kg` : `${(p / 1000).toFixed(1)} t`; };
const boom = () => explosion.explode([0, 0, 0], { power: power() });
$('#power').oninput = show; show();
for (const button of document.querySelectorAll('[data-power]'))
    button.onclick = () => { $('#power').value = Math.log10(+button.dataset.power); show(); boom(); };
addEventListener('keydown', e => { if (e.code === 'Space' && demo.mode !== 'walk' || e.code === 'KeyB') { e.preventDefault(); boom(); } });
demo.look([-60, 6, 45], [0, 8, 0]);

// stand in hands (no body here): palms flat on the ground in front, forearms up to the shoulders, by `knock.hands`
const handMesh = upload(gl, new MeshBuilder().box('#c89a78', { at: [0, 0, 0], scale: [.09, .03, .18] }).build());
const armMesh = upload(gl, new MeshBuilder().box('#4f5a3a', { at: [0, 0, .5], scale: [.08, .08, 1] }).build());
const basis = (x, y, z, at, s = 1) => Matrix4.create([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0] * s, z[1] * s, z[2] * s, 0, at[0], at[1], at[2], 1]);
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(c => c / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function drawHands(camera) {
    const w = knock.hands, f = demo.walker?.mover.feet;
    if (w <= .01 || !f) return;
    const y = camera.rotation.y, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y), c = camera.position;
    for (const s of [1, -1])
    {
        const ground = [f[0] + fx * .45 + rx * .22 * s, .02, f[2] + fz * .45 + rz * .22 * s];
        const hang = [c[0] + fx * .3 + rx * .25 * s, c[1] - .6, c[2] + fz * .3 + rz * .25 * s];
        const palm = hang.map((h, i) => h + (ground[i] - h) * w);
        renderer.draw(handMesh, basis([rx, 0, rz], [0, 1, 0], [fx, 0, fz], [palm[0] + fx * .06, palm[1] + .015, palm[2] + fz * .06]));
        const shoulder = [c[0] + rx * .2 * s, c[1] - .25, c[2] + rz * .2 * s], d = shoulder.map((v, i) => v - palm[i]), len = Math.hypot(...d);
        const z = norm(d), x = norm(cross([0, 1, 0], z)), yy = cross(z, x);
        renderer.draw(armMesh, basis(x, yy, z, palm, len));
    }
}

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
    knock.update(dt, demo.camera ? demo.camera.rotation.x - knock.pitch : 0);
    daze.blink = knock.blink;
    daze.update(dt);
    if (eye) audio.setListener(eye, [-v[2], -v[6], -v[10]]);
    $('#info').value = `${smoke.count} puffs\n${heard}\n${log.slice(0, 12).join('\n')}`;
};
demo.draw = camera => {
    renderer.begin(camera, SKY);
    renderer.draw(mesh, identity);
    for (const t of things) renderer.draw(t.mesh, t.body.matrix(t.matrix));
    drawHands(camera);
    if ($('#grass').checked) grass.draw(camera, renderer.light, demo.time);
    smoke.draw(camera);
    explosion.draw(camera);
    daze.draw();
    renderer.reset();
};
