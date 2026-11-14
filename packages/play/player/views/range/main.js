import '@polywar/viewport';
import { Camera } from '@papit/game-engine';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { nearest, castGround, castBox, castCylinder } from '@polywar/ballistics';
import { GUNS } from '@polywar/weapons';
import { Player, aimOf } from '@polywar/player';
import { RigidBody, Box, Capsule } from '@papit/rigidbody';

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
    // what a case lands on: a target / crate under it, the road, else dirt
    surface: ([x, y, z]) => {
        const t = targets.find(t => t.kind === 'box' && x >= t.min[0] - .05 && x <= t.max[0] + .05 && z >= t.min[2] - .05 && z <= t.max[2] + .05 && y > t.min[1]);
        return t ? (t.surface === 'flesh' ? 'dirt' : t.surface) : road(x, z) ? 'stone' : 'dirt';
    },
    // ?guns=kar98k,svt-40@scope-3 for any other loadout (`<id>@<scope>` puts a scope on)
    guns: new URLSearchParams(location.search).get('guns')?.split(',') ?? Object.keys(GUNS),
}, {
    hit: (bullet, hit) => {
        if (!hit.target || hit.target.name === 'crate') return;
        $('#marker').classList.add('on');
        requestAnimationFrame(() => requestAnimationFrame(() => $('#marker').classList.remove('on')));
        lastHit = `${hit.target.name} · ${bullet.travelled.toFixed(0)} m`;
    },
    exit: () => { if (!tuning) stop(); },
}, [0, 0, 6]);
window.player = player;
// crates, the wall, boards, plates and dummies as static bodies: cases bounce off them (the player steps its own world)
for (const t of colliders)
{
    const at = t.kind === 'box' ? t.min.map((v, k) => (v + t.max[k]) / 2) : [t.x, (t.bottom + t.top) / 2, t.z];
    const shape = t.kind === 'box' ? new Box(...t.min.map((v, k) => t.max[k] - v)) : new Capsule(t.radius, t.top - t.bottom - t.radius * 2);
    player.feel.world.add(new RigidBody({ shape, position: { x: at[0], y: at[1], z: at[2] } }));
}
let lastHit = '';
await player.ready;

// ---- menu ----
const guns = player.carried.map(c => c.gun);
guns.forEach((g, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = i < 9 ? `${i + 1} ${g.spec.name}` : g.spec.name;
    button.onclick = () => { player.select(i); paint(); };
    $('#guns').append(button);
});
const paint = () => [...$('#guns').children].forEach((b, i) => b.classList.toggle('on', i === player.current));
paint();
$('#body').onchange = e => { player.showBody = e.target.checked; };
$('#clear').onclick = () => { player.impacts.clear(); player.feel.debris.clear(); };

let menuCamera;
function play() {
    document.body.classList.add('playing');
    menuCamera ??= layer.camera;
    layer.camera = new Camera({ near: .1, far: 3000, controllers: [player.controller] });
}
function stop() {
    tune(false);
    document.body.classList.remove('playing');
    paint();
}
$('#play').onclick = play;
demo.look([0, 3, 12], [0, 1, -30]);

// ---- aim tuning (T): sliders on the held gun's aimed pose, kept in the browser, exported for `npm run aim` ----
const STORE = 'polywar.aim';
const stored = () => JSON.parse(localStorage.getItem(STORE) ?? '{}');
const SLIDERS = [['x', 'left / right', 'cm', 10], ['y', 'down / up', 'cm', 10], ['z', 'nearer / further', 'cm', 15], ['pitch', 'pitch (up +)', '°', 15], ['yaw', 'yaw (left +)', '°', 15], ['roll', 'roll', '°', 20]];
for (const [id, name, unit, range] of SLIDERS)
{
    const label = document.createElement('label');
    label.innerHTML = `<span>${name}</span><input id="t-${id}" type="range" min="${-range}" max="${range}" step=".1" value="0" /><output id="t-${id}-v"></output>`;
    $('#tune-sliders').append(label);
    label.querySelector('input').oninput = () => applyTune(true);
}
const sliders = () => SLIDERS.map(([id]) => +$(`#t-${id}`).value);
/** this gun's tune as weapon.json `aim` (metres, degrees) */
function tuneOf(c) {
    const v = sliders();
    return { offset: [v[0] / 100, v[1] / 100, v[2] / 100].map(n => +n.toFixed(4)), angle: v.slice(3).map(n => +n.toFixed(2)) };
}
function applyTune(save) {
    const c = player.held, t = tuneOf(c);
    for (const [id, , unit] of SLIDERS) $(`#t-${id}-v`).value = `${(+$(`#t-${id}`).value).toFixed(1)} ${unit}`;
    c.hold.aim = aimOf(t);
    if (!save) return;
    const all = stored();
    (all[c.tune.model] ??= {})[c.tune.key] = t;
    localStorage.setItem(STORE, JSON.stringify(all));
}
/** sliders from the held gun's tune (browser first, then weapon.json) */
function showTune() {
    const c = player.held, t = stored()[c.tune.model]?.[c.tune.key] ?? c.weapon?.[c.tune.key] ?? { offset: [0, 0, 0], angle: [0, 0, 0] };
    const v = [...t.offset.map(n => n * 100), ...t.angle];
    SLIDERS.forEach(([id], i) => { $(`#t-${id}`).value = v[i]; });
    $('#tune-gun').textContent = `${c.gun.spec.name} · ${c.tune.model} "${c.tune.key}"`;
    applyTune(false);
}
// tunes kept in the browser win over weapon.json until merged
for (const c of player.carried) { const t = stored()[c.tune.model]?.[c.tune.key]; if (t) c.hold.aim = aimOf(t); }
let tuning = false;
function tune(on) {
    tuning = on;
    document.body.classList.toggle('tuning', on);
    if (on) { player.toggled = true; showTune(); document.exitPointerLock(); }
    else player.input?.lock();
}
addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 't' || !document.body.classList.contains('playing')) return;
    tune(!tuning);
});
$('#tune-close').onclick = () => tune(false);
// a click on the view locks the mouse again: back to playing
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && tuning) { tuning = false; document.body.classList.remove('tuning'); } });
$('#tune-reset').onclick = () => { SLIDERS.forEach(([id]) => { $(`#t-${id}`).value = 0; }); applyTune(true); };
$('#tune-copy').onclick = async () => {
    const c = player.held;
    await navigator.clipboard.writeText(`"${c.tune.key}": ${JSON.stringify(tuneOf(c))}`);
    $('#tune-info').value = 'copied';
};
$('#tune-export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(stored(), null, 4)], { type: 'application/json' }));
    a.download = 'aim.json';
    a.click();
    $('#tune-info').value = 'npm run aim -- ~/Downloads/aim.json';
};
$('#tune-forget').onclick = () => { if (confirm('forget every tune kept in this browser?')) { localStorage.removeItem(STORE); showTune(); } };
let shownGun = -1;

// ---- loop ----
demo.tick = () => {
    if (!document.body.classList.contains('playing')) return;
    if (tuning && shownGun !== player.current) showTune();
    shownGun = player.current;
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
