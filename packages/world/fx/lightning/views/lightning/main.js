import '@polywar/viewport';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer, DAYLIGHT } from '@polywar/renderer';
import { Sky } from '@polywar/sky';
import { Lightning } from '@polywar/lightning';
import { AudioMixer } from '@papit/audio';
import { WeatherAudio } from '@polywar/weather-audio';
import { Smoke } from '@polywar/smoke';
import { Explosion } from '@polywar/explosion';
import { ExplosionAudio } from '@polywar/explosion-audio';

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
// a strike close by hits like a shell: our explosion (look + sound) where it lands
const smoke = new Smoke(demo.layer, { puffs: 6000 }), explosion = new Explosion(demo.layer, { smoke });
let blastAudio;
let sound, eye = [0, 0, 0], right = [1, 0, 0];
$('#sound').onclick = () => { mixer.unlock(); sound ??= new WeatherAudio({ mixer }); blastAudio ??= new ExplosionAudio({ mixer }); Object.assign(sound.state, { rain: .7, wind: .5 }); };
bolts.onstrike = b => {
    const dx = b.position[0] - eye[0], dz = b.position[2] - eye[2], d = Math.hypot(dx, b.position[1] - eye[1], dz);
    const delay = sound ? sound.thunder(d, (dx * right[0] + dz * right[2]) / (Math.hypot(dx, dz) || 1)) : d / 343;
    if (b.kind === 'ground' && d < 350) setTimeout(() => { explosion.explode(b.position, { power: 8 }); }, b.hit * 1000); setTimeout(() => blastAudio?.play(b.position, 8, { deep: true }), b.hit * 1000 + 80);
    $('#values').value = `${b.kind} ${Math.round(d)} m · thunder in ${delay.toFixed(1)} s`;
};
for (const b of document.querySelectorAll('[data-k]')) b.onclick = () => {
    const d = +b.dataset.d, a = Math.random() * Math.PI * 2;
    bolts.strike(eye[0] + Math.cos(a) * d - (d ? 0 : 0), eye[2] - Math.abs(Math.sin(a)) * d, { kind: b.dataset.k });
};
// a click (not a drag) on the ground: a strike lands there
let cam, down;
const invert = m => {
    const a = Array.from(m), o = new Array(16), [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return o;
};
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = v; } return o; };
const unproject = (m, x, y, z) => { const v = [0, 1, 2, 3].map(r => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]); return [v[0] / v[3], v[1] / v[3], v[2] / v[3]]; };
demo.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
demo.addEventListener('pointerup', e => {
    if (!cam || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || e.target.closest?.('aside')) return;
    const r = demo.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = 1 - (e.clientY - r.top) / r.height * 2;
    const inv = invert(mul(cam.projectionMatrix, cam.viewMatrix)), a = unproject(inv, nx, ny, -1), b = unproject(inv, nx, ny, 1);
    if (b[1] >= a[1]) return; // looking up: no ground there
    const t = (0 - a[1]) / (b[1] - a[1]);
    bolts.strike(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, { kind: 'ground' });
});
window.bolts = bolts; Object.defineProperty(window, 'sound', { get: () => sound });
let last = performance.now();
demo.draw = camera => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    cam = camera;
    const e = camera.worldPosition ?? { x: 0, y: 0, z: 0 }, v = camera.viewMatrix;
    eye = [e.x, e.y, e.z]; right = [v[0], v[4], v[8]];
    bolts.storm = Number($('#storm').value);
    bolts.update(dt);
    sound?.update(dt);
    blastAudio?.setListener(eye, [-v[2], -v[6], -v[10]]);
    explosion.update(dt); smoke.update(dt);
    sky.setTime(Number($('#hour').value), .5);
    Object.assign(sky.state, { cover: .8, grey: .85, flash: bolts.flash, flashAt: bolts.flashAt });
    sky.light(clear, renderer.light);
    renderer.begin(camera, [0, 0, 0, 1]);
    sky.draw(camera);
    renderer.draw(floor, at(0, -1, 0, 40000, 2, 40000));
    for (let d = 100; d <= 3000; d += 200) for (const x of [-60, 60]) renderer.draw(pillar, at(x, 20, -d, 10, 40, 10));
    smoke.draw(camera);
    explosion.draw(camera);
    renderer.reset();
    bolts.draw(camera);
    renderer.reset();
};
demo.look([0, 2, 20], [0, 200, -400]);
