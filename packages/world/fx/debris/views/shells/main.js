import '@polywar/viewport';
import { Renderer, Model } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { World, RigidBody, Box } from '@papit/rigidbody';
import { Debris, cylinderAlongZ } from '@polywar/debris';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, renderer = new Renderer(demo.layer);

const ground = (x, z) => Math.sin(x * 1.3) * .08 + Math.cos(z * 1.7) * .06 + Math.max(0, x - 1.5) * .25;
const world = new World();
// a crate and a plate as plain static bodies in the same world
const crate = { at: [-.6, .25, -1.2], size: [.5, .5, .5] }, plate = { at: [.9, .3, -.6], size: [.04, .6, .8] };
for (const b of [crate, plate]) world.add(new RigidBody({ shape: new Box(...b.size), position: { x: b.at[0], y: ground(b.at[0], b.at[2]) + b.at[1], z: b.at[2] } }));

let landed = 0;
const debris = new Debris({ world, ground, cap: 60, onland: () => landed++ });
window.debris = debris; window.world = world;

const b = new MeshBuilder();
const n = 60, s = .1, p = (i, j) => { const x = -3 + i * s, z = -3 + j * s; return [x, ground(x, z), z]; };
for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) b.quad(p(i, j + 1), p(i + 1, j + 1), p(i + 1, j), p(i, j), (i + j) % 2 ? '#6f8f4e' : '#6a8a4a');
for (const x of [crate, plate]) b.box(x === crate ? '#9a7448' : '#5f6a72', { at: [x.at[0], ground(x.at[0], x.at[2]) + x.at[1], x.at[2]], scale: x.size });
const mesh = upload(gl, b.build()), identity = Matrix4.create();
const model = await Model.load(gl, '/assets/models/weapons/ammo/30-06-springfield/case.glb');
const { shape, local } = cylinderAlongZ(.063, .0063);

// the port: up and right of the origin, cases go right, up, a little back, spinning
const port = [0, 1.2, 0];
function eject() {
    const r = () => Math.random() * 2 - 1;
    debris.spawn('case', {
        shape, local, mass: .012, position: [...port],
        velocity: [2.5 + r() * .6, 2 + r() * .5, .6 + r() * .4],
        angularVelocity: [r() * 20, r() * 20, 15 + r() * 10],
        rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    });
}

$('#burst').onclick = () => { for (let i = 0; i < 20; i++) setTimeout(eject, i * 50); };
$('#clear').onclick = () => debris.clear();
demo.look([-1.5, 1.6, 2.6], [.6, .3, -.4]);
let wait = 0;
const m = Matrix4.create();
demo.tick = dt => {
    debris.options.cap = +$('#cap').value;
    const rate = +$('#rate').value;
    wait -= dt;
    if (rate && wait <= 0) { wait = 1 / rate; eject(); }
    world.update(Math.min(dt, .1));
    debris.update(Math.min(dt, .1));
    const moving = debris.pieces.filter(p => !p.settled).length;
    $('#info').value = `${debris.pieces.length} cases · ${moving} moving · ${world.bodies.length} bodies (tiles + boxes)\n${landed} landed`;
};
demo.draw = camera => {
    renderer.begin(camera, demo.background);
    renderer.draw(mesh, identity);
    for (const piece of debris.pieces) model.draw(renderer, debris.matrix(piece, m));
    renderer.reset();
};
