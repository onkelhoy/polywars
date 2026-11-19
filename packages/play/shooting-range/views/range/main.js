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
import { Vehicles, Dust, SteeringHands } from '@polywar/vehicle';
import { nearest } from '@polywar/ballistics';
import { EngineSound } from '@polywar/vehicle-audio';
import '@polywar/gun-menu';
import { thumbnail } from '@polywar/renderer';
import { Grass } from '@polywar/grass';
import { Lights, Glow } from '@polywar/light';

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

// ---- lamps: a point light per bulb (range.json `lights`); ?night dims the sun to see them ----
renderer.lights = new Lights();
const glow = new Glow(layer);
for (const l of range.data.lights ?? []) renderer.lights.add({ ...l });
if (new URLSearchParams(location.search).has('night'))
{
    Object.assign(renderer.light, { sunStrength: .05, ambient: .08, fogColor: [.03, .04, .07] });
    SKY.splice(0, 3, .03, .04, .07);
}

// ---- grass (@polywar/grass) by range.json zones: none wins over short over tall; planted round the camera ----
const zones = range.data.grass ?? [];
const inZone = (kind, x, z) => zones.some(g => g.kind === kind && x >= g.min[0] && x <= g.max[0] && z >= g.min[1] && z <= g.max[1]);
const GROW = { tall: { density: 1, height: 1, dry: 0, flowers: 0 }, short: { density: .7, height: .4, dry: 0, flowers: 0 }, none: { density: 0, height: 0, dry: 0, flowers: 0 } };
// the look: exactly the grass view's (saved from it: assets/grass/range.json)
const grass = new Grass(layer, await (await fetch('/assets/grass/range.json')).json());
// everywhere on the ground (hills, banks too), tall by default; not under solids (buildings, sandbags, floors)
const covered = (x, z) => { const y = range.ground(x, z); return range.colliders(x, z).some(b => x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] > y - .1 && b.min[1] < y + 1); };
{
    const xs = range.data.ground.flat().map(p => p[0]), zs = range.data.ground.flat().map(p => p[2]);
    const lo = [Math.min(...xs), Math.min(...zs)], hi = [Math.max(...xs), Math.max(...zs)];
    grass.plant({
        area: { x: lo[0], z: lo[1], width: hi[0] - lo[0], depth: hi[1] - lo[1] },
        height: (x, z) => range.ground(x, z),
        grow: (x, z) => GROW[inZone('none', x, z) || covered(x, z) ? 'none' : inZone('short', x, z) ? 'short' : 'tall'],
        window: 130,
    });
    // the grass ground (patches, spots) on the range's own ground where grass grows: top, not too steep, lifted 2 cm
    const floor = [];
    for (const t of range.data.ground)
    {
        const c = [0, 1, 2].map(k => (t[0][k] + t[1][k] + t[2][k]) / 3);
        const u = t[1].map((v, k) => v - t[0][k]), w = t[2].map((v, k) => v - t[0][k]);
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1;
        if (Math.abs(n[1] / l) < .55 || Math.abs(range.ground(c[0], c[2]) - c[1]) > .05) continue;
        if (GROW[inZone('none', c[0], c[2]) || covered(c[0], c[2]) ? 'none' : 'tall'].density === 0) continue;
        for (const p of t) floor.push(p[0], p[1] + .02, p[2]);
    }
    grass.setGround(new Float32Array(floor));
}
function drawGrass(camera) {
    const e = camera.worldPosition;
    if (!e) return;
    grass.follow(e[0] ?? e.x, e[2] ?? e.z);
    const t = performance.now() / 1000;
    grass.drawGround(camera, renderer.light, t);
    renderer.reset();
}
// the tufts: after the SSAO pass (no AO on grass; depth is back on the canvas), and in the gun scope's picture
function drawTufts(camera) {
    const e = camera.worldPosition;
    if (!e) return;
    grass.draw(camera, renderer.light, performance.now() / 1000);
    renderer.reset();
}
window.grass = grass;

// cars share one world (they hit each other); bullets hit them too
const fleet = new Vehicles({ ground: range.ground, solids: range.colliders });
const shots = nearest(range.cast, fleet.cast);
window.fleet = fleet;
let lastHit = '';
const player = new Player(layer, renderer, {
    ground: range.ground, colliders: range.colliders, cast: shots, surface: range.surface,
    scene: view => { model.draw(renderer, identity); drawStands(); drawGrass(view); drawTufts(view); },
    character: CHARACTERS[characterId]?.url ?? CHARACTERS['ww2-soldier-us'].url,
    worldDrawn: () => { demo.endOcclusion(); drawTufts(layer.camera); },
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
// the put-down gun within reach (F takes it back)
const gunNear = () => { const d = player.downAt, f = player.mover.feet; return !!d && Math.hypot(d[0] - f[0], d[2] - f[2]) < 1.5; };
addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'f' || !document.body.classList.contains('playing')) return;
    // leaving an optic, a desk button looked at, an optic near, then a gun case
    if (player.looking) player.lookThrough();
    else if (gunNear()) player.takeBack();
    else if (button) range.lanes.press(button.lane, button.dir);
    else if (nearOptic) useOptic(nearOptic);
    else if (near >= 0) player.select(stands[near].gun);
});

// ---- optics: binoculars on the desks (F takes them, G raises them: shaky), spotting scopes in the nests (F: steady) ----
let nearOptic, binoculars = false, binocularNode, binocularFrom;
const hidden = Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1000, 0, 1]);
function useOptic(o) {
    if (o.kind === 'binoculars') { binoculars = true; binocularNode = o.name; binocularFrom = Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -o.at[0], -o.at[1], -o.at[2], 1]); model.move(o.name, hidden); return; }
    player.lookThrough(new Optic({ zoom: o.zoom, handheld: false }), o.eye);
    $('#optic').className = 'scope';
}
addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'g' || !binoculars || !document.body.classList.contains('playing')) return;
    const on = !player.looking;
    player.lookThrough(on ? new Optic({ zoom: 7, handheld: true }) : undefined);
    if (on) $('#optic').className = 'binoculars';
});

// the mouse wheel zooms binoculars / spotting scopes (2x .. 25x)
let optic;
const look = player.lookThrough.bind(player);
player.lookThrough = (o, eye) => { optic = o; look(o, eye); };
addEventListener('wheel', e => {
    if (!optic) return;
    optic.setting.zoom = Math.max(2, Math.min(25, optic.setting.zoom * Math.exp(-e.deltaY * .002)));
}, { passive: true });

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
    // the spotting scope's ring blends in as the eye reaches the eyepiece
    $('#optic').style.opacity = String(player.opticBlend);
    if (!player.opticBlend && !player.looking) $('#optic').className = '';
    const i = range.standNear(f[0], f[2]);
    near = i >= 0 && stands[i].gun >= 0 && stands[i].gun !== player.current ? i : -1;
    const w = camera.worldMatrix;
    button = buttonAt(range.data, [w[12], w[13], w[14]], [-w[8], -w[9], -w[10]]);
    const lane = button && range.lanes.of(button.lane);
    nearOptic = (range.data.optics ?? []).find(o => (o.kind === 'fixed' || !binoculars) && Math.hypot(o.at[0] - f[0], o.at[2] - f[2]) < 1.4);
    $('#prompt').value = button ? `F  target ${button.dir < 0 ? 'nearer' : 'further'} (lane ${button.lane}, at ${range.lanes.stops[lane?.stop ?? 0]} m)`
        : player.looking ? ($('#optic').className === 'binoculars' ? 'G  lower the binoculars · wheel zoom' : 'F  step back · wheel zoom')
        : gunNear() ? `F  take ${player.carried[player.down.index].gun.spec.name} back`
        : nearOptic ? (nearOptic.kind === 'fixed' ? 'F  look through the spotting scope' : 'F  take the binoculars')
        : binoculars ? 'G  look through the binoculars'
        : near >= 0 ? `F  take ${player.carried[stands[near].gun].gun.spec.name}` : '';
    $('#ammo').value = `${g.spec.name}\n${g.reloading > 0 ? 'reloading…' : `${g.rounds} / ${g.spec.magazine}`}${c.scope && g.aimed > .5 ? `\n${c.scope.zoom.toFixed(1)}×` : ''}`;
    $('#state').value = `shots ${player.shots} · hits ${player.hits}\n${lastHit}`;
};
demo.draw = camera => {
    // binoculars in the hands while raised (hidden otherwise)
    if (binocularNode) { const m = player.binocularsAt(camera); model.move(binocularNode, m ? m.multiply(binocularFrom) : hidden); }
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
    const car = fleet.add({ spec }, v.at, v.yaw);
    const hands = spec.steeringWheel && new SteeringHands(spec.steeringWheel);
    return { car, spec, hands, model: await Model.load(gl, base + spec.model), awake: 0, engine: undefined };
}));
let driving, seatCam = false, nearCar;
// dust behind the wheels, coloured by what the ground is made of; drawn by the player's impacts
const DUST = { dirt: [.5, .42, .32], stone: [.6, .58, .54], wood: undefined, metal: undefined };
const dust = new Dust({
    emit: (at, v, puff) => player.impacts.emit(at, v, puff),
    colour: (x, z) => { const s = range.surface([x, range.ground(x, z) + .05, z]); return s in DUST ? DUST[s] : DUST.dirt; },
});
window.cars = cars;
const chase = { yaw: 0, pos: [0, 0, 0], look: [0, 0] };
const carMatrix = Matrix4.create();
const forward = c => { const f = c.toWorld([0, 0, -1], undefined, 0); return Math.atan2(-f[0], -f[2]); };
// the player stands in the driven car: two cylinders per car for the mover (front / back half)
const baseColliders = range.colliders;
const withCars = (x, z) => {
    const list = baseColliders(x, z);
    const extra = cars.filter(c => c !== driving).flatMap(({ car }) => {
        const p = car.body.position, f = car.toWorld([0, 0, -1], undefined, 0);
        if (Math.hypot(p.x - x, p.z - z) > 6) return [];
        return [-.85, .85].map(d => ({ kind: 'cylinder', x: p.x + f[0] * d, z: p.z + f[2] * d, radius: .85, bottom: p.y - 1, top: p.y + .6 }));
    });
    return extra.length ? list.concat(extra) : list;
};
// the mover's colliders only (range.colliders stays boxes: surface / bullets use it)
player.mover.setting.colliders = withCars;
function drawCars() {
    for (const { car, spec, model: m } of cars)
    {
        car.wheels.forEach((w, i) => m.move(w.spec.node, car.wheel(i, Matrix4.create())));
        const sw = car.steeringWheel(Matrix4.create());
        if (sw) m.move(spec.steeringWheel.node, sw);
        m.draw(renderer, car.matrix(carMatrix));
    }
}
// the driver: hips on the seat, feet on the pedals, knees up, hands on the rim (car space offsets from the seat)
const FEET = [[.17, -.42, -.62], [-.17, -.42, -.62]], KNEES = [[.22, .5, -1.2], [-.22, .5, -1.2]], ELBOWS = [[.8, -1, .3], [-.8, -1, .3]];
function drawDriver(camera) {
    const { car, spec, hands } = driving, s = spec.seat;
    const at = o => { const p = car.toWorld([s[0] + o[0], s[1] + o[1], s[2] + o[2]]); return [p[0], p[1], p[2]]; };
    const dir = d => { const p = car.toWorld(d, undefined, 0); return [p[0], p[1], p[2]]; };
    const seatM = car.matrix(Matrix4.create()).multiply(Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s[0], s[1], s[2], 1]));
    const rim = hands ? hands.hands().map(h => { const p = car.toWorld(h.at); return { at: [p[0], p[1], p[2]], axis: dir(h.axis), palm: dir(h.palm) }; }) : [];
    player.drawSeated(camera, seatM, { feet: FEET.map(at), knees: KNEES.map(at), elbows: ELBOWS.map(dir), hands: rim }, seatCam);
}
function enter(c) {
    driving = c;
    c.hands?.reset(c.car.wheelTurn);
    c.engine ??= new EngineSound({ mixer: player.feel.mixer });
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
    let eye, yaw, pitch;
    if (seatCam)
    {
        chase.look[0] = Math.max(-2.2, Math.min(2.2, chase.look[0] - dx * .0022));
        chase.look[1] = Math.max(-1.2, Math.min(1.2, chase.look[1] - dy * .0022));
        eye = car.toWorld(spec.eye);
        const f = car.toWorld([0, 0, -1], undefined, 0);
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
    const cp = Math.cos(pitch);
    player.feel.mixer.setListener({ x: eye[0], y: eye[1], z: eye[2] }, { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp });
}
// one camera: the player's controller on foot, the car's camera while driving (input + pointer lock stay)
const walkCam = player.controller;
const seat = {
    start: c => walkCam.start?.(c),
    update: (c, dt) => {
        dt = Math.min(dt, .1);
        // cars left rolling settle a few seconds, then park (no cost)
        const inputs = new Map();
        if (driving)
        {
            const input = player.input, k = n => input?.key(n) ? 1 : 0;
            inputs.set(driving.car, { throttle: k('w') - k('s'), steer: k('d') - k('a'), handbrake: !!input?.key(' ') });
        }
        fleet.update(dt, inputs);
        driving?.hands?.update(dt, driving.car.wheelTurn);
        for (const c2 of cars) dust.update(dt, c2.car);
        // the player isn't updated while driving: age the dust here
        if (driving) player.impacts.update(dt);
        for (const c2 of cars)
        {
            if (c2 !== driving && c2.awake > 0) c2.awake -= dt;
            // the engine runs while driven and a few seconds after (idling), then stops
            if (c2.engine)
            {
                const p = c2.car.body.position;
                c2.engine.update({ rpm: c2.car.rpm, load: c2.car.power, slip: c2.car.slip, position: [p.x, p.y, p.z] });
                if (c2 !== driving && c2.awake <= 0) { c2.engine.stop(.8); c2.engine = undefined; }
            }
        }
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
    drawGrass(camera);
    drawCars();
    glow.draw(camera, renderer.lights);
    renderer.reset();
    if (!document.body.classList.contains('playing')) { player.impacts.draw(camera); renderer.reset(); demo.endOcclusion(); drawTufts(camera); }
    else if (driving) { drawDriver(camera); demo.endOcclusion(); drawTufts(camera); }
    else player.draw(camera);
};
