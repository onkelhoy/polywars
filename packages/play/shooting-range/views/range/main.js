import '@polywar/viewport';
import { Camera } from '@papit/game-engine';
import { Renderer, Model } from '@polywar/renderer';
import { Matrix4 } from '@papit/matrix';
import { GUNS } from '@polywar/weapons';
import { Player, WeaponEditor } from '@polywar/player';
import { Optic } from '@polywar/viewmodel';
import { CHARACTERS } from '@polywar/characters';
const CHARACTER = 'polywar.character';
const characterId = localStorage.getItem(CHARACTER) ?? 'ww2-soldier-us';
import { RigidBody, Box } from '@papit/rigidbody';
import { ShootingRange, buttonAt } from '@polywar/shooting-range';
import { Vehicle } from '@polywar/vehicle';
import '@polywar/gun-menu';
import { thumbnail } from '@polywar/renderer';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, layer = demo.layer, renderer = new Renderer(layer);
renderer.light.fogDensity = .0004;
renderer.light.fogColor = [.62, .72, .84];
const SKY = [.62, .72, .84, 1];

const range = await ShootingRange.load();
const model = await Model.load(gl, range.model), identity = Matrix4.create();
window.range = range;

let lastHit = '';
const player = new Player(layer, renderer, {
    ground: range.ground, colliders: range.colliders, cast: range.cast, surface: range.surface,
    scene: () => { model.draw(renderer, identity); drawStands(); },
    character: CHARACTERS[characterId]?.url ?? CHARACTERS['ww2-soldier-us'].url,
    worldDrawn: () => demo.endOcclusion(),
    // ?guns=kar98k,svt-40@scope-3 for another loadout; the first ones go on the cases
    guns: new URLSearchParams(location.search).get('guns')?.split(',') ?? Object.keys(GUNS),
}, {
    hit: (bullet, hit) => {
        if (!hit.target) return;
        $('#marker').classList.add('on');
        requestAnimationFrame(() => requestAnimationFrame(() => $('#marker').classList.remove('on')));
        lastHit = `${hit.target.name} · ${bullet.travelled.toFixed(0)} m`;
    },
    exit: () => { if (!tuner?.open && !menuOpen) document.body.classList.remove('playing'); },
}, range.spawn);
window.player = player;
let tuner, menuOpen = false;
// cases bounce off every box (the player steps its own world)
for (const s of range.solids)
{
    const at = s.min.map((v, k) => (v + s.max[k]) / 2), size = s.min.map((v, k) => Math.max(.02, s.max[k] - v));
    player.feel.world.add(new RigidBody({ shape: new Box(...size), position: { x: at[0], y: at[1], z: at[2] } }));
}
await player.ready;
// ---- aim tuning (T): the player's panel ----
tuner = new WeaponEditor(player, document.body, { active: () => document.body.classList.contains('playing') });

// ---- a gun over each case: turning slowly, muzzle along the case; F takes it ----
const stands = range.stands.map((s, i) => ({ ...s, gun: i < player.carried.length ? i : -1 }));
const matrix = Matrix4.create();
function drawStands() {
    const t = performance.now() / 1000;
    for (const s of stands)
    {
        if (s.gun < 0 || s.gun === player.current && document.body.classList.contains('playing')) continue;
        const m = player.carried[s.gun].model, c = m.center, a = Math.sin(t * .6 + s.at[0]) * .4 - Math.PI / 2;
        const cos = Math.cos(a), sin = Math.sin(a);
        // rotation about y, then lift so the gun floats a hand over the lid
        const at = [s.at[0], s.at[1] + m.size[1] / 2 + .12 + Math.sin(t * 1.5 + s.at[0]) * .02, s.at[2]];
        matrix.set([cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0,
            at[0] - (cos * c[0] + sin * c[2]), at[1] - c[1], at[2] - (-sin * c[0] + cos * c[2]), 1]);
        m.draw(renderer, matrix);
    }
}
let near = -1, button;
addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'f' || !document.body.classList.contains('playing')) return;
    // leaving an optic, a desk button looked at, an optic near, then a gun case
    if (player.looking) { player.lookThrough(); $('#optic').className = ''; }
    else if (button) range.lanes.press(button.lane, button.dir);
    else if (nearOptic) useOptic(nearOptic);
    else if (near >= 0) player.select(stands[near].gun);
});

// ---- optics: binoculars on the desks (F takes them, G raises them: shaky), spotting scopes in the nests (F: steady) ----
let nearOptic, binoculars = false;
const hidden = Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1000, 0, 1]);
function useOptic(o) {
    if (o.kind === 'binoculars') { binoculars = true; model.move(o.name, hidden); return; }
    player.lookThrough(new Optic({ zoom: o.zoom, handheld: false }), o.eye);
    $('#optic').className = 'scope';
}
addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'g' || !binoculars || !document.body.classList.contains('playing')) return;
    const on = !player.looking;
    player.lookThrough(on ? new Optic({ zoom: 7, handheld: true }) : undefined);
    $('#optic').className = on ? 'binoculars' : '';
});

// ---- lane targets: slide, the drawn carrier + target and the marks on it come along ----
let lastSlide = performance.now();
function slideLanes() {
    const now = performance.now(), dt = Math.min(.1, (now - lastSlide) / 1000);
    lastSlide = now;
    for (const { lane, dz, box } of range.slide(dt))
    {
        const at = Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -lane.offset, 1]);
        for (const name of lane.names) model.move(name, at);
        if (box) player.impacts.shift(box.min, box.max, [0, 0, dz]);
    }
}

// ---- gun menu (Tab): every gun as a card with its side view, click to take it ----
await renderer.ready;
const gunMenu = $('pw-gun-menu');
gunMenu.items = player.carried.map(c => ({ id: c.gun.spec.model, name: c.gun.spec.name, kind: c.gun.spec.kind, image: thumbnail(renderer, c.model) }));
function showMenu(on) {
    menuOpen = on;
    gunMenu.classList.toggle('open', on);
    if (on) { gunMenu.current = player.current; gunMenu.filter = ''; document.exitPointerLock(); requestAnimationFrame(() => gunMenu.focusFilter()); }
    else player.input?.lock();
}
gunMenu.addEventListener('pick', e => { player.select(e.detail.index); showMenu(false); });
addEventListener('keydown', e => {
    if (!document.body.classList.contains('playing')) return;
    if (e.key === 'Tab') { e.preventDefault(); showMenu(!menuOpen); }
    else if (e.key === 'Escape' && menuOpen) showMenu(false);
});
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && menuOpen) showMenu(false); });

// ---- menu ----
// ---- ambient occlusion: a setting kept in the browser (every playable view shares it) ----
const AO = 'polywar.ssao';
demo.ssao = localStorage.getItem(AO) !== 'off';
$('#ao').checked = demo.ssao;
$('#ao').onchange = e => { demo.ssao = e.target.checked; localStorage.setItem(AO, demo.ssao ? 'on' : 'off'); };
$('#character').innerHTML = Object.entries(CHARACTERS).map(([id, c]) => `<option value="${id}">${c.name}</option>`).join('');
$('#character').value = CHARACTERS[characterId] ? characterId : 'ww2-soldier-us';
$('#character').onchange = e => { localStorage.setItem(CHARACTER, e.target.value); void player.setCharacter(CHARACTERS[e.target.value].url); };
$('#body').onchange = e => { player.showBody = e.target.checked; };
$('#clear').onclick = () => { player.impacts.clear(); player.feel.debris.clear(); };
$('#play').onclick = () => {
    document.body.classList.add('playing');
    layer.camera = new Camera({ near: .1, far: 3000, controllers: [player.controller] });
};
demo.look([range.spawn[0] - 6, 3.5, range.spawn[2] + 1], [range.spawn[0], 1, -30]);

// ---- loop ----
demo.tick = () => {
    if (!document.body.classList.contains('playing')) return;
    tuner.update();
    const g = player.gun, m = player.mover, c = player.held, f = m.feet;
    const camera = layer.camera, fov = 2 * Math.atan(Math.tan(camera.fov / 2) / camera.zoom);
    const gap = Math.tan(player.spread) / Math.tan(fov / 2) * layer.element.clientHeight / 2;
    $('#cross').style.setProperty('--gap', `${Math.max(4, gap).toFixed(1)}px`);
    $('#cross').style.opacity = String(1 - g.aimed);
    slideLanes();
    const i = range.standNear(f[0], f[2]);
    near = i >= 0 && stands[i].gun >= 0 && stands[i].gun !== player.current ? i : -1;
    const w = camera.worldMatrix;
    button = buttonAt(range.data, [w[12], w[13], w[14]], [-w[8], -w[9], -w[10]]);
    const lane = button && range.lanes.of(button.lane);
    nearOptic = (range.data.optics ?? []).find(o => (o.kind === 'fixed' || !binoculars) && Math.hypot(o.at[0] - f[0], o.at[2] - f[2]) < 1.4);
    $('#prompt').value = button ? `F  target ${button.dir < 0 ? 'nearer' : 'further'} (lane ${button.lane}, at ${range.lanes.stops[lane?.stop ?? 0]} m)`
        : player.looking ? ($('#optic').className === 'binoculars' ? 'G  lower the binoculars' : 'F  step back')
        : nearOptic ? (nearOptic.kind === 'fixed' ? 'F  look through the spotting scope' : 'F  take the binoculars')
        : near >= 0 ? `F  take ${player.carried[stands[near].gun].gun.spec.name}` : '';
    $('#ammo').value = `${g.spec.name}\n${g.reloading > 0 ? 'reloading…' : `${g.rounds} / ${g.spec.magazine}`}${c.scope && g.aimed > .5 ? `\n${c.scope.zoom.toFixed(1)}×` : ''}`;
    $('#state').value = `shots ${player.shots} · hits ${player.hits}\n${lastHit}`;
};
demo.draw = camera => {
    renderer.begin(camera, SKY);
    model.draw(renderer, identity);
    drawStands();
    if (document.body.classList.contains('playing')) player.draw(camera);
    else { player.impacts.draw(camera); renderer.reset(); }
};

// ---- vehicles: parked jeeps, E in / out, W / S, A / D, Space handbrake, V seat / chase cam ----
const cars = await Promise.all((range.data.vehicles ?? []).map(async v => {
    const base = `/assets/models/vehicles/${v.kind}/`;
    const spec = await (await fetch(base + 'vehicle.json')).json();
    const car = new Vehicle({ spec, ground: range.ground, solids: range.colliders }, v.at, v.yaw);
    return { car, spec, model: await Model.load(gl, base + spec.model), awake: 0 };
}));
let driving, seatCam = false, nearCar;
window.cars = cars;
const chase = { yaw: 0, pos: [0, 0, 0], look: [0, 0] };
const carMatrix = Matrix4.create();
const forward = c => { const f = c.toWorld([0, 0, -1], [0, 0, 0], 0); return Math.atan2(-f[0], -f[2]); };
// the player stands in the driven car: two cylinders per car for the mover (front / back half)
const baseColliders = range.colliders;
range.colliders = (x, z) => {
    const list = baseColliders(x, z);
    const extra = cars.filter(c => c !== driving).flatMap(({ car }) => {
        const p = car.body.position, f = car.toWorld([0, 0, -1], [0, 0, 0], 0);
        if (Math.hypot(p.x - x, p.z - z) > 6) return [];
        return [-.85, .85].map(d => ({ kind: 'cylinder', x: p.x + f[0] * d, z: p.z + f[2] * d, radius: .85, bottom: p.y - 1, top: p.y + .6 }));
    });
    return extra.length ? list.concat(extra) : list;
};
player.mover.setting && (player.mover.setting.colliders = range.colliders);
function drawCars() {
    for (const { car, spec, model: m } of cars)
    {
        car.wheels.forEach((w, i) => m.move(w.spec.node, car.wheel(i, Matrix4.create())));
        const sw = car.steeringWheel(Matrix4.create());
        if (sw) m.move(spec.steeringWheel.node, sw);
        m.draw(renderer, car.matrix(carMatrix));
    }
}
function enter(c) {
    driving = c;
    chase.yaw = forward(c.car);
    const p = c.car.body.position;
    chase.pos = [p.x + Math.sin(chase.yaw) * 7, p.y + 2.5, p.z + Math.cos(chase.yaw) * 7];
    chase.look = [0, 0];
}
function leave() {
    const c = driving.car, out = c.toWorld(driving.spec.exit);
    driving.awake = 3;
    driving = undefined;
    player.mover.place(out[0], out[2]);
}
addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'v' && driving) seatCam = !seatCam;
    if (e.key.toLowerCase() !== 'e' || !document.body.classList.contains('playing')) return;
    if (driving) leave(); else if (nearCar) enter(nearCar);
});
function driveCamera(camera, dt) {
    const { car, spec } = driving, input = player.input;
    const { dx, dy } = input?.consume() ?? { dx: 0, dy: 0 };
    const k = n => input?.key(n) ? 1 : 0;
    car.update(dt, { throttle: k('w') - k('s'), steer: k('d') - k('a'), handbrake: !!input?.key(' ') });
    let eye, yaw, pitch;
    if (seatCam)
    {
        chase.look[0] = Math.max(-2.2, Math.min(2.2, chase.look[0] - dx * .0022));
        chase.look[1] = Math.max(-1.2, Math.min(1.2, chase.look[1] - dy * .0022));
        eye = car.toWorld(spec.eye);
        const f = car.toWorld([0, 0, -1], [0, 0, 0], 0);
        yaw = forward(car) + chase.look[0];
        pitch = Math.asin(Math.max(-1, Math.min(1, f[1]))) + chase.look[1];
    }
    else
    {
        const p = car.body.position;
        let d = forward(car) - chase.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        chase.yaw += d * Math.min(1, dt * 3);
        const want = [p.x + Math.sin(chase.yaw) * 7, 0, p.z + Math.cos(chase.yaw) * 7];
        want[1] = Math.max(p.y + 2.2, range.ground(want[0], want[2]) + 1);
        for (let i = 0; i < 3; i++) chase.pos[i] += (want[i] - chase.pos[i]) * Math.min(1, dt * 6);
        eye = chase.pos;
        const to = [p.x - eye[0], p.y + .8 - eye[1], p.z - eye[2]];
        yaw = Math.atan2(-to[0], -to[2]); pitch = Math.atan2(to[1], Math.hypot(to[0], to[2]));
    }
    camera.position.set(eye);
    camera.rotation.set([pitch, yaw, 0]);
}
// one camera: the player's controller on foot, the car's camera while driving (input + pointer lock stay)
const walkCam = player.controller;
const seat = {
    start: c => walkCam.start?.(c),
    update: (c, dt) => {
        dt = Math.min(dt, .1);
        // cars left rolling settle a few seconds, then park (no cost)
        for (const c2 of cars) if (c2 !== driving && c2.awake > 0) { c2.awake -= dt; c2.car.update(dt); }
        if (driving) driveCamera(c, dt); else walkCam.update(c, dt);
    },
    destroy: () => walkCam.destroy?.(),
};
$('#play').onclick = () => {
    document.body.classList.add('playing');
    layer.camera = new Camera({ near: .1, far: 3000, controllers: [seat] });
};
const walkTick = demo.tick;
demo.tick = dt => {
    if (driving)
    {
        if (!document.body.classList.contains('playing')) return;
        $('#prompt').value = `E  get out · V ${seatCam ? 'chase' : 'seat'} cam`;
        $('#ammo').value = `${Math.abs(driving.car.speed * 3.6).toFixed(0)} km/h`;
        $('#cross').style.opacity = '0';
        return;
    }
    walkTick(dt);
    const f = player.mover.feet;
    nearCar = cars.find(({ car, spec }) => { const d = car.toWorld(spec.exit); return Math.hypot(d[0] - f[0], d[2] - f[2]) < 1.6; });
    if (nearCar && document.body.classList.contains('playing') && !$('#prompt').value) $('#prompt').value = 'E  drive';
};
demo.draw = camera => {
    renderer.begin(camera, SKY);
    model.draw(renderer, identity);
    drawStands();
    drawCars();
    if (!document.body.classList.contains('playing')) { player.impacts.draw(camera); renderer.reset(); }
    else if (driving) { player.impacts.draw(camera); renderer.reset(); demo.endOcclusion(); }
    else player.draw(camera);
};
