import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { Bullets, nearest, castGround, castBox, castCylinder } from '@polywar/ballistics';
import { Impacts } from '@polywar/impacts';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, renderer = new Renderer(demo.layer), impacts = new Impacts(demo.layer);

const ground = () => 0;
const targets = [
    { kind: 'box', min: [8, 0, -3], max: [9, 1, -2], surface: 'wood', colour: '#a07a4a' },
    { kind: 'box', min: [12, 0, -.5], max: [12.1, 1.5, .5], surface: 'metal', colour: '#707a80' },
    { kind: 'box', min: [16, 0, 2], max: [17, 2, 5], surface: 'stone', colour: '#8a8780' },
    { kind: 'cylinder', x: 10, z: 3, radius: .25, bottom: 0, top: 1.8, surface: 'flesh', colour: '#c08a70' },
];
const b = new MeshBuilder().plane('#6f8f4e', { scale: [60, 1, 60] });
for (const t of targets)
    if (t.kind === 'box') b.box(t.colour, { at: t.min.map((v, k) => (v + t.max[k]) / 2), scale: t.min.map((v, k) => t.max[k] - v) });
    else b.cylinder(t.colour, { at: [t.x, t.bottom, t.z], scale: [t.radius, t.top - t.bottom, t.radius] }, 12);
const mesh = upload(gl, b.build()), identity = Matrix4.create();

const casts = targets.map(t => (from, to) => {
    const hit = t.kind === 'box' ? castBox(t.min, t.max, from, to) : castCylinder(t.x, t.z, t.radius, t.bottom, t.top, from, to);
    if (hit) hit.surface = t.surface;
    return hit;
});
const bullets = new Bullets(nearest((f, t) => castGround(ground, f, t, 1, 'ground'), ...casts));
let hits = 0;
bullets.onhit = (bullet, hit) => { hits++; impacts.hit(hit.point, hit.normal, hit.surface, bullet.direction); };

const muzzle = [-2, 1.2, 0];
let wait = 0;
demo.look([-6, 3, 9], [8, 0, 0]);
$('#clear').onclick = () => impacts.clear();
demo.tick = dt => {
    wait -= dt;
    if (wait <= 0)
    {
        wait = 1 / +$('#rate').value;
        const t = targets[Math.floor(Math.random() * (targets.length + 1))];
        const aim = t ? (t.kind === 'box' ? t.min.map((v, k) => v + (t.max[k] - v) * (.2 + Math.random() * .6)) : [t.x, t.bottom + Math.random() * 1.6, t.z]) : [4 + Math.random() * 10, 0, Math.random() * 8 - 4];
        const d = aim.map((v, k) => v - muzzle[k]), l = Math.hypot(...d);
        const direction = d.map(v => v / l);
        bullets.fire({ from: muzzle, direction, speed: 400, drag: .002 });
        impacts.flash(muzzle, direction);
    }
    bullets.update(dt);
    impacts.update(dt);
    impacts.tracers($('#tracers').checked ? bullets.list : []);
    $('#info').value = `${hits} hits · ${bullets.list.length} in flight`;
};
demo.draw = camera => {
    renderer.begin(camera, demo.background);
    renderer.draw(mesh, identity);
    impacts.draw(camera);
    renderer.reset();
};
