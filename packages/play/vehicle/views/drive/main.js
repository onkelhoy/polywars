import '@polywar/viewport';
import { Model, Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { Vehicle, Dust } from '@polywar/vehicle';
import { Impacts } from '@polywar/impacts';
import { Camera } from '@papit/game-engine';
import { AudioMixer } from '@papit/audio';
import { EngineSound } from '@polywar/vehicle-audio';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, renderer = new Renderer(demo.layer);

// ---- ground: rolling hills, washboard bumps, potholes, a ramp, a flat start ----
const base = '/assets/models/vehicles/willys-jeep/';
const spec = await (await fetch(base + 'vehicle.json')).json();
const hills = (x, z) => Math.sin(x * .04) * Math.cos(z * .05) * 3;
const bumps = (x, z) => z < -20 && z > -60 && Math.abs(x) < 8 ? Math.max(0, Math.sin(z * 1.4)) * .12 : 0;
const holes = (x, z) => -Math.max(0, .25 - Math.hypot((x + 20) % 6 - 3, (z % 6) - 3) * .2) * (x < -10 && x > -40 ? 1 : 0);
const ramp = (x, z) => x > 15 && x < 21 && z < -10 && z > -30 ? Math.max(0, (-10 - z) * .15) : 0;
const flat = (x, z) => Math.max(0, 1 - Math.hypot(x, z) / 15);
const ground = (x, z) => (hills(x, z) + bumps(x, z) + holes(x, z)) * (1 - flat(x, z)) + ramp(x, z);
const solids = [];
for (let i = 0; i < 5; i++) { const x = -10 + i * 1.6, z = 18, g = ground(x, z); solids.push({ min: [x, g - .2, z], max: [x + 1.2, g + .6 + i * .15, z + 1.2] }); }

const size = 200, n = 200, b = new MeshBuilder();
const at = (i, j) => { const x = -size / 2 + i * size / n, z = -size / 2 + j * size / n; return [x, ground(x, z), z]; };
for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) b.quad(at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), at(i, j), (i + j) % 2 ? '#6f8f4e' : '#6a8a4a');
for (const c of solids) b.box('#a07a4a', { at: [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2], scale: [c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]] });
const mesh = upload(gl, b.build()), identity = Matrix4.create();

const model = await Model.load(gl, base + spec.model);
const tune = { frequency: 1.3, damping: .3, grip: 1.1, boost: 1 };
const yaw = () => { const f = car.toWorld([0, 0, -1], undefined, 0); return Math.atan2(-f[0], -f[2]); };
let car = new Vehicle({ spec, ground, solids, ...tune });
for (const k of Object.keys(tune)) $('#' + k).oninput = e => {
    tune[k] = +e.target.value; e.target.nextElementSibling.textContent = e.target.value;
    const { position: p } = car.body; car = new Vehicle({ spec, ground, solids, ...tune }, [p.x, 0, p.z], yaw());
};
Object.keys(tune).forEach(k => $('#' + k).oninput({ target: $('#' + k) }));

demo.vehicle = () => car;
const impacts = new Impacts(demo.layer);
const dust = new Dust({ emit: (at, v, puff) => impacts.emit(at, v, puff) });

// ---- sound: starts on the first key (audio needs a gesture) ----
const mixer = new AudioMixer();
let engine;
addEventListener('keydown', () => { mixer.unlock(); engine ??= new EngineSound({ mixer }); });

// ---- input ----
const keys = new Set();
let seat = false;
addEventListener('keydown', e => {
    keys.add(e.code);
    if (e.code === 'KeyV') seat = !seat;
    if (e.code === 'KeyR') car.place(car.body.position.x, car.body.position.z, yaw());
    if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
const axis = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);

// ---- chase / seat camera (its own controller) ----
const cam = { pos: [0, 3, 9], yaw: 0 };
const M = Matrix4.create();
const chase = {
    update(camera, dt) {
        let eye, to;
        if (seat)
        {
            eye = car.toWorld(spec.eye);
            to = car.toWorld([spec.eye[0], spec.eye[1] - .1, spec.eye[2] - 5]);
        }
        else
        {
            const y = yaw(), p = car.body.position;
            let d = y - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
            cam.yaw += d * Math.min(1, dt * 3);
            const want = [p.x + Math.sin(cam.yaw) * 7, 0, p.z + Math.cos(cam.yaw) * 7];
            want[1] = Math.max(p.y + 2.2, ground(want[0], want[2]) + 1);
            for (let i = 0; i < 3; i++) cam.pos[i] += (want[i] - cam.pos[i]) * Math.min(1, dt * 6);
            eye = cam.pos; to = [p.x, p.y + .8, p.z];
        }
        const d = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]];
        camera.position.set(eye);
        const f = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]], l = Math.hypot(...f) || 1;
        mixer.setListener({ x: eye[0], y: eye[1], z: eye[2] }, { x: f[0] / l, y: f[1] / l, z: f[2] / l });
        const p = car.body.position;
        engine?.update({ rpm: car.rpm, load: car.power, slip: car.slip, position: [p.x, p.y, p.z] });
        camera.rotation.set([Math.atan2(d[1], Math.hypot(d[0], d[2])), Math.atan2(-d[0], -d[2]), 0]);
    },
};
demo.layer.camera = new Camera({ near: .1, far: 800, controllers: [chase] });
demo.tick = dt => {
    car.update(dt, { throttle: axis('KeyW', 'KeyS'), steer: axis('KeyD', 'KeyA'), handbrake: keys.has('Space') });
    dust.update(dt, car);
    impacts.update(dt);
    const w = car.wheels.map(w => `${w.grounded ? (w.slipping ? 'slip' : 'grip') : 'air '} ${w.length.toFixed(2)}`).join('\n');
    $('#info').value = `${(car.speed * 3.6).toFixed(0)} km/h · gear ${car.gear} · ${car.rpm.toFixed(0)} rpm · steer ${(car.steering * 180 / Math.PI).toFixed(0)}°\n${w}`;
};
demo.draw = camera => {
    renderer.begin(camera, demo.background);
    renderer.draw(mesh, identity);
    car.wheels.forEach((w, i) => model.move(w.spec.node, car.wheel(i, Matrix4.create())));
    const sw = car.steeringWheel(Matrix4.create());
    if (sw) model.move(spec.steeringWheel.node, sw);
    model.draw(renderer, car.matrix(M));
    impacts.draw(camera);
};
