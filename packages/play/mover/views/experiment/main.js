import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, renderer = new Renderer(demo.layer);

// ---- ground: soft hills, a steep cone (slides), a 35° ramp, a flat road ----
const cone = (x, z) => Math.max(0, 14 - Math.hypot(x - 30, z + 10) * 1.6);
const ramp = (x, z) => x > -30 && x < -20 && z > -30 && z < 10 ? Math.max(0, Math.min(10 - z, 40) * .7) * (z < 10 ? 1 : 0) : 0;
const hills = (x, z) => Math.sin(x * .05) * Math.cos(z * .06) * 2;
const road = (x, z) => Math.abs(z - 20) < 3;
const ground = (x, z) => road(x, z) ? hills(x, 20) + .08 : Math.max(hills(x, z), hills(x, z) + cone(x, z), ramp(x, z));
const colliders = [
    { kind: 'box', min: [5, 0, 0], max: [7, .4, 2] },
    { kind: 'box', min: [7, 0, 0], max: [9, .8, 2] },
    { kind: 'box', min: [9, 0, 0], max: [11, 1.6, 2] },
    { kind: 'box', min: [-4, 0, 5], max: [4, 3, 6] },
    { kind: 'cylinder', x: 0, z: -6, radius: .4, bottom: -5, top: 6 },
    { kind: 'cylinder', x: 3, z: -8, radius: .6, bottom: -5, top: 6 },
];
for (const c of colliders) if (c.kind === 'box') { const g = ground((c.min[0] + c.max[0]) / 2, (c.min[2] + c.max[2]) / 2); c.min[1] += g; c.max[1] += g; }

const size = 120, n = 240, b = new MeshBuilder();
const at = (i, j) => { const x = -size / 2 + i * size / n, z = -size / 2 + j * size / n; return [x, ground(x, z), z]; };
for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
{
    const x = -size / 2 + (i + .5) * size / n, z = -size / 2 + (j + .5) * size / n;
    const colour = road(x, z) ? '#5c5a57' : (i + j) % 2 ? '#6f8f4e' : '#6a8a4a';
    b.quad(at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), at(i, j), colour);
}
for (const c of colliders)
{
    if (c.kind === 'box') b.box('#a07a4a', { at: [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2], scale: [c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]] });
    else b.cylinder('#5a4030', { at: [c.x, c.bottom, c.z], scale: [c.radius, c.top - c.bottom, c.radius] }, 10);
}
const mesh = upload(gl, b.build()), identity = Matrix4.create();

const walking = { ground, colliders: () => colliders, slope: 40 };
demo.walking = walking;
demo.look([0, 3, 14], [0, 1, 0]);
$('#walk').onclick = () => { demo.mode = 'walk'; };
$('#slope').oninput = e => { walking.slope = +e.target.value; e.target.nextElementSibling.textContent = e.target.value; if (demo.mode === 'walk') { demo.mode = 'pan'; demo.mode = 'walk'; } };
$('#slope').oninput({ target: $('#slope') });

demo.tick = () => {
    const m = demo.mode === 'walk' && demo.layer.camera?.controllers?.[0]?.mover;
    $('#info').value = m ? `${m.grounded ? m.sliding ? 'sliding' : 'ground' : 'air'} · ${m.speed.toFixed(1)} m/s · y ${m.feet[1].toFixed(2)}` : '';
};
demo.draw = camera => {
    renderer.begin(camera, demo.background);
    renderer.draw(mesh, identity);
};
