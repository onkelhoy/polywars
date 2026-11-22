import '@polywar/viewport';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer, DAYLIGHT } from '@polywar/renderer';
import { Sky } from '@polywar/sky';
import { Lightning } from '@polywar/lightning';
import { AudioMixer } from '@papit/audio';
import { WeatherAudio } from '@polywar/weather-audio';

// a storm over a plain: bolts, the sky flash, thunder late by distance
const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const renderer = new Renderer(demo.layer), gl = demo.gl, sky = new Sky(demo.layer), bolts = new Lightning(demo.layer);
const clear = { ...DAYLIGHT, fogDensity: .0002 };
renderer.light.sunDirection = [...DAYLIGHT.sunDirection];
const floor = upload(gl, new MeshBuilder().box([.3, .42, .22], {}).build());
const pillar = upload(gl, new MeshBuilder().box([.6, .55, .5], {}).build());
const at = (x, y, z, sx, sy, sz) => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1];
const mixer = new AudioMixer();
let sound, eye = [0, 0, 0], right = [1, 0, 0];
$('#sound').onclick = () => { mixer.unlock(); sound ??= new WeatherAudio({ mixer }); Object.assign(sound.state, { rain: .7, wind: .5 }); };
bolts.onstrike = b => {
    const dx = b.position[0] - eye[0], dz = b.position[2] - eye[2], d = Math.hypot(dx, b.position[1] - eye[1], dz);
    const delay = sound ? sound.thunder(d, (dx * right[0] + dz * right[2]) / (Math.hypot(dx, dz) || 1)) : d / 343;
    $('#values').value = `${b.kind} ${Math.round(d)} m · thunder in ${delay.toFixed(1)} s`;
};
for (const b of document.querySelectorAll('[data-k]')) b.onclick = () => {
    const d = +b.dataset.d, a = Math.random() * Math.PI * 2;
    bolts.strike(eye[0] + Math.cos(a) * d - (d ? 0 : 0), eye[2] - Math.abs(Math.sin(a)) * d, { kind: b.dataset.k });
};
window.bolts = bolts;
let last = performance.now();
demo.draw = camera => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    const e = camera.worldPosition ?? { x: 0, y: 0, z: 0 }, v = camera.viewMatrix;
    eye = [e.x, e.y, e.z]; right = [v[0], v[4], v[8]];
    bolts.storm = Number($('#storm').value);
    bolts.update(dt);
    sound?.update(dt);
    sky.setTime(Number($('#hour').value), .5);
    Object.assign(sky.state, { cover: .8, grey: .85, flash: bolts.flash, flashAt: bolts.flashAt });
    sky.light(clear, renderer.light);
    renderer.begin(camera, [0, 0, 0, 1]);
    sky.draw(camera);
    renderer.draw(floor, at(0, -1, 0, 40000, 2, 40000));
    for (let d = 100; d <= 3000; d += 200) for (const x of [-60, 60]) renderer.draw(pillar, at(x, 20, -d, 10, 40, 10));
    bolts.draw(camera);
    renderer.reset();
};
demo.look([0, 2, 20], [0, 200, -400]);
