import '@polywar/viewport';
import { Camera } from '@papit/game-engine';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { nearest, castGround, castBox, castCylinder } from '@polywar/ballistics';
import { GUNS } from '@polywar/weapons';
import { Player } from '@polywar/player';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, layer = demo.layer, renderer = new Renderer(layer);
renderer.light.fogDensity = .0006;
renderer.light.fogColor = [.55, .65, .78];
const SKY = [.62, .72, .84, 1];

// ---- the range: gentle ground, a steep cone (left), a ridge, a road (right), a backstop berm ----
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const roadX = 14, road = (x, z) => Math.abs(x - roadX) < 3.5 && z < 40 && z > -460;
function terrain(x, z) {
    let h = Math.sin(x * .021) * Math.cos(z * .017) * 1.6 + Math.sin(x * .07 + z * .05) * .3;
    h *= smooth((Math.abs(x) - 8) / 30);                              // flat lane down the middle
    h += Math.max(0, 22 - Math.hypot(x + 45, z + 40) * 1.7);         // cone: ~60°, slides
    h += Math.max(0, 8 - Math.abs(x + 30) * .55) * smooth((-z - 120) / 40) * smooth((-z - 120) / 40) * (z > -260 ? 1 : 0); // ridge, 29°
    h += smooth((-z - 430) / 25) * 14;                                // berm behind the targets
    return h;
}
const ground = (x, z) => road(x, z) ? terrain(roadX, z) + .1 : terrain(x, z);

// targets: plates (metal), boards (wood), dummies (flesh)
const targets = [], colliders = [];
for (const [i, d] of [25, 50, 100, 200, 300, 400].entries())
{
    const z = -d, g = terrain(0, z), k = 1 + d / 200;
    targets.push({ kind: 'box', min: [-4 * k - .5 * k, g, z - .03], max: [-4 * k + .5 * k, g + 1.6 * k, z + .03], surface: 'metal', colour: '#5f6a72', name: `plate ${d} m` });
    targets.push({ kind: 'box', min: [-.6 * k, g, z - .05], max: [.6 * k, g + 1.8 * k, z + .05], surface: 'wood', colour: '#c9b48a', name: `board ${d} m` });
    targets.push({ kind: 'cylinder', x: 4 * k, z, radius: .25, bottom: g, top: g + 1.8, surface: 'flesh', colour: '#b98a6e', name: `dummy ${d} m` });
}
// crates and a wall by the start (mover colliders + bullet targets)
for (const [x, z, w, h, d] of [[-6, -8, 1, .5, 1], [-6, -10, 1, 1, 1], [-6, -12, 1, 1.6, 1], [5, -14, 6, 2.2, .4]])
{
    const g = terrain(x, z);
    const box = { kind: 'box', min: [x - w / 2, g, z - d / 2], max: [x + w / 2, g + h, z + d / 2], surface: w > 3 ? 'stone' : 'wood', colour: w > 3 ? '#8d8a84' : '#9a7448', name: 'crate' };
    targets.push(box); colliders.push(box);
}
for (const t of targets) if (t.kind === 'cylinder' || t.name.startsWith('board') || t.name.startsWith('plate')) colliders.push(t);

// ---- meshes ----
const size = 1000, n = 250, b = new MeshBuilder();
const at = (i, j) => { const x = -size / 2 + i * size / n, z = -size * .75 + j * size / n; return [x, ground(x, z), z]; };
for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
{
    const x = -size / 2 + (i + .5) * size / n, z = -size * .75 + (j + .5) * size / n;
    const colour = road(x, z) ? '#5d5b57' : Math.abs(x) < 6 && z < 0 && z > -420 ? '#87a05a' : (i + j) % 2 ? '#6f8f4e' : '#6a8a4a';
    b.quad(at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), at(i, j), colour);
}
// fine road on its own, so it isn't cut by the coarse grid
for (let z = 40; z > -460; z -= 2) b.quad([roadX - 3.5, ground(roadX, z) + .01, z], [roadX + 3.5, ground(roadX, z) + .01, z], [roadX + 3.5, ground(roadX, z - 2) + .01, z - 2], [roadX - 3.5, ground(roadX, z - 2) + .01, z - 2], '#4f4d4a');
for (const t of targets)
{
    if (t.kind === 'box') b.box(t.colour, { at: t.min.map((v, k) => (v + t.max[k]) / 2), scale: t.min.map((v, k) => t.max[k] - v) });
    else { b.cylinder(t.colour, { at: [t.x, t.bottom, t.z], scale: [t.radius, t.top - t.bottom - .3, t.radius] }, 10); b.sphere(t.colour, { at: [t.x, t.top - .15, t.z], scale: .15 }, 1); }
}
// distance signs
for (const d of [25, 50, 100, 200, 300, 400]) b.box('#e8e0d0', { at: [8, terrain(8, -d) + .6, -d], scale: [.8, .5, .05] });
const mesh = upload(gl, b.build()), identity = Matrix4.create();
const scene = () => renderer.draw(mesh, identity);

// ---- bullets hit the ground and every target ----
const cast = nearest(
    (f, t) => castGround(ground, f, t, 1.5, 'ground'),
    ...targets.map(t => (f, to) => {
        const hit = t.kind === 'box' ? castBox(t.min, t.max, f, to) : castCylinder(t.x, t.z, t.radius, t.bottom, t.top, f, to);
        if (hit) { hit.surface = t.surface; hit.target = t; }
        return hit;
    }),
);

const player = new Player(layer, renderer, {
    ground, colliders: () => colliders, cast, scene,
    character: '/assets/models/characters/knight/character.json',
    guns: ['m1911', 'tt-pistol', 'mauser-c96', 'ppsh-41', 'thompson-m1', 'stg-44', 'm1-garand', 'm1-garand-scoped'],
}, {
    hit: (bullet, hit) => {
        if (!hit.target || hit.target.name === 'crate') return;
        $('#marker').classList.add('on');
        requestAnimationFrame(() => requestAnimationFrame(() => $('#marker').classList.remove('on')));
        lastHit = `${hit.target.name} · ${bullet.travelled.toFixed(0)} m`;
    },
    exit: () => stop(),
}, [0, 0, 6]);
window.player = player;
let lastHit = '';
await player.ready;

// ---- menu ----
const guns = player.carried.map(c => c.gun);
guns.forEach((g, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = `${i + 1} ${g.spec.name}`;
    button.onclick = () => { player.select(i); paint(); };
    $('#guns').append(button);
});
const paint = () => [...$('#guns').children].forEach((b, i) => b.classList.toggle('on', i === player.current));
paint();
$('#body').onchange = e => { player.showBody = e.target.checked; };
$('#clear').onclick = () => player.impacts.clear();

let menuCamera;
function play() {
    document.body.classList.add('playing');
    menuCamera ??= layer.camera;
    layer.camera = new Camera({ near: .1, far: 3000, controllers: [player.controller] });
}
function stop() {
    document.body.classList.remove('playing');
    paint();
}
$('#play').onclick = play;
demo.look([0, 3, 12], [0, 1, -30]);

// ---- loop ----
demo.tick = () => {
    if (!document.body.classList.contains('playing')) return;
    const g = player.gun, m = player.mover, c = player.held;
    const camera = layer.camera, fov = 2 * Math.atan(Math.tan(camera.fov / 2) / camera.zoom);
    // crosshair: the spread cone on screen, gone when aimed
    const gap = Math.tan(player.spread) / Math.tan(fov / 2) * layer.element.clientHeight / 2;
    $('#cross').style.setProperty('--gap', `${Math.max(4, gap).toFixed(1)}px`);
    $('#cross').style.opacity = String(1 - g.aimed);
    $('#ammo').value = `${g.spec.name}\n${g.reloading > 0 ? 'reloading…' : `${g.rounds} / ${g.spec.magazine}`}${c.scope && g.aimed > .5 ? `\n${c.scope.zoom.toFixed(1)}×` : ''}`;
    $('#state').value = `${m.grounded ? m.sliding ? 'sliding' : 'ground' : 'air'} · ${m.speed.toFixed(1)} m/s\nshots ${player.shots} · hits ${player.hits}\n${lastHit}`;
};
demo.draw = camera => {
    renderer.begin(camera, SKY);
    scene();
    if (document.body.classList.contains('playing')) player.draw(camera);
    else { player.impacts.draw(camera); renderer.reset(); }
};
