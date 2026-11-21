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
import { TrainingCamp, buttonAt } from '@polywar/training-camp';
import { Vehicles, Dust, Exhaust, SteeringHands } from '@polywar/vehicle';
import { nearest } from '@polywar/ballistics';
import { EngineSound, ENGINES, TankSound, TANK_SOUND } from '@polywar/vehicle-audio';
import { CloseDark } from '@polywar/close-dark';
import '@polywar/gun-menu';
import { thumbnail } from '@polywar/renderer';
import { Grass } from '@polywar/grass';
import { TerrainMaterial, coverMap } from '@polywar/terrain-material';
import { Lights, Glow } from '@polywar/light';
import { grenades } from './grenades.js';
import { tankGun } from './tank.js';
import { planes as planeSetup } from './plane.js';
import { Shadows } from '@polywar/shadows';
import { Scatter } from '@polywar/scatter';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, layer = demo.layer, renderer = new Renderer(layer);
// height fog (@polywar/fog): thicker in the low ground, thins going up; tune live: renderer.light.fog*
renderer.light.fogDensity = .0009;
renderer.light.fogFalloff = .015;
renderer.light.fogBase = 0;
window.renderer = renderer;
// toon sun shadows (@polywar/shadows): sharp near, coarser further, gone by 45 m; tune live: shadows.*
const shadows = new Shadows(gl);
renderer.light.shadow = shadows;
window.shadows = shadows;
renderer.light.fogColor = [.62, .72, .84];
const SKY = [.62, .72, .84, 1];

const range = await TrainingCamp.load();
const model = await Model.load(gl, range.model), identity = Matrix4.create();
// the model's `Ground` and its earth (berms, earth banks / roofs) are drawn once, by the terrain material (its grass
// ground from a cover map), not by the model's own shader
// convention: a node with "earth" in its name is ground (painted like the terrain); Berm* until they're renamed
const EARTH = name => name === 'Ground' || /earth/i.test(name) || name.startsWith('Berm');
const NO_TERRAIN = { skip: model.gltf.nodes.map(n => n.name ?? '').filter(EARTH) };
window.range = range;
// ---- props (range.json `props`): each model loaded once, all copies instanced (@polywar/scatter) ----
const props = new Scatter(renderer, (name, lod) => lod ? undefined : range.propUrl(name), { lods: [], distance: { prop: 2500 }, fade: .05, surface: { bands: 0, soft: 0, grit: 0 } });
await props.place(range.propBatches());
window.props = props;
// rigged props (tanks): a few, drawn one by one in rest pose
const rigged = await Promise.all(range.riggedProps().map(async ([url, at]) => [await Model.load(gl, url), at.map(m => Matrix4.create(m))]));
/** the range model (no terrain) and its props */
const drawWorld = view => {
    model.draw(renderer, identity, {}, NO_TERRAIN);
    props.draw(view, performance.now() / 1000);
    for (const [m, at] of rigged) for (const a of at) m.draw(renderer, a);
};

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
const grassLook = await (await fetch('/assets/grass/range.json')).json();
const grass = new Grass(layer, grassLook);
// everywhere on the ground (hills, banks too), tall by default; not under solids (buildings, sandbags, floors)
const covered = (x, z) => { const y = range.ground(x, z); return range.colliders(x, z).some(b => x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] > y - .1 && b.min[1] < y + 1); };
// the ground: the model's earth parts with the terrain material, grassy all over (edge -1) in the grass look's colours
const earth = model.parts.filter(p => EARTH(p.name));
const ground = new TerrainMaterial(layer, {
    colors: { grassland: grassLook.color },
    grass: { color: grassLook.color, dry: grassLook.dry, patches: grassLook.patches, blend: 1, darken: .8, edge: -1 },
    paint: { edge: 0, size: 30, washes: .001, rim: 0, warmth: 0, grain: 0, pixel: grassLook.size[0] / 24 },
    flat: true, variation: 0, bands: grassLook.bands ?? 3, lighting: grassLook.lighting ?? { wrap: 0, steepness: 1 },
});
window.ground = ground;
let bake = true;
{
    const xs = range.data.ground.flat().map(p => p[0]), zs = range.data.ground.flat().map(p => p[2]);
    const lo = [Math.min(...xs), Math.min(...zs)], hi = [Math.max(...xs), Math.max(...zs)];
    // the cover map (origin centred): the ground is grassy all over (edge -1), so a coarse one; the tufts keep the
    // exact zones (none wins over short over tall, not under solids)
    const size = 2 * Math.max(...lo.map(Math.abs), ...hi.map(Math.abs)) + 2;
    ground.cover(coverMap(size, 64, (x, z, out) => { out.density = 1; }));
    grass.plant({
        area: { x: lo[0], z: lo[1], width: hi[0] - lo[0], depth: hi[1] - lo[1] },
        height: (x, z) => range.ground(x, z),
        grow: (x, z) => GROW[inZone('none', x, z) || covered(x, z) ? 'none' : inZone('short', x, z) ? 'short' : 'tall'],
        window: 215,
    });
}
function drawGrass(camera) {
    const e = camera.worldPosition;
    if (!e) return;
    grass.follow(e[0] ?? e.x, e[2] ?? e.z);
    if (bake) {
        const a = ground.bakeAlbedo(ground.coverData.size, 2048, () => earth.forEach(p => ground.drawPart(p.mesh, p.matrix)), renderer.light);
        if (a) { grass.ground(a); bake = false; }
    }
    if (!ground.useGround(camera, renderer.light)) return;
    // the earth: pushed back in depth steps, so roads / pads lying on it win (no z-fight)
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 8);
    for (const p of earth) ground.drawPart(p.mesh, p.matrix);
    gl.disable(gl.POLYGON_OFFSET_FILL);
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
const closeDark = new CloseDark(layer);
window.closeDark = closeDark;
window.fleet = fleet;
let lastHit = '';
const player = new Player(layer, renderer, {
    ground: range.ground, colliders: range.colliders, cast: shots, surface: range.surface,
    scene: view => { drawWorld(view); drawStands(); drawGrass(view); drawTufts(view); },
    character: CHARACTERS[characterId]?.url ?? CHARACTERS['ww2-soldier-us'].url,
    worldDrawn: () => { demo.endOcclusion(); drawTufts(layer.camera); drawGlass(); drawAir(layer.camera); },
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
// the cases are empty now: every gun lies in the booths
const stands = range.stands.map(s => ({ ...s, gun: -1 }));
const matrix = Matrix4.create();
function drawStands() {
    const t = performance.now() / 1000;
    for (const s of stands)
    {
        if (s.gun < 0 || player.loose.has(s.gun) || s.gun === player.current && document.body.classList.contains('playing')) continue;
        const m = player.carried[s.gun].model, c = m.center, a = Math.sin(t * .6 + s.at[0]) * .4 - Math.PI / 2;
        const cos = Math.cos(a), sin = Math.sin(a);
        // rotation about y, then lift so the gun floats a hand over the lid
        const at = [s.at[0], s.at[1] + m.size[1] / 2 + .12 + Math.sin(t * 1.5 + s.at[0]) * .02, s.at[2]];
        matrix.set([cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0,
            at[0] - (cos * c[0] + sin * c[2]), at[1] - c[1], at[2] - (-sin * c[0] + cos * c[2]), 1]);
        m.draw(renderer, matrix);
    }
}
// ---- every gun out in the booths: one on each desk, the rest leant on the booth walls (F takes one) ----
{
    const booths = range.data.solids.filter(s => s.name.startsWith('Booths'));
    const desks = booths.filter(s => s.max[1] - s.min[1] < .2), walls = booths.filter(s => s.max[0] - s.min[0] < .1);
    const lay = [], lean = [];
    for (const d of desks)
    {
        const xs = [d.min[0], ...walls.filter(w => w.min[0] > d.min[0] && w.max[0] < d.max[0]).map(w => (w.min[0] + w.max[0]) / 2), d.max[0]].sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i++) lay.push([(xs[i] + xs[i + 1]) / 2, d.max[1], (d.min[2] + d.max[2]) / 2]);
        // each wall inside the desk's span: both faces, a few along it behind the desk
        for (const w of walls) if (w.min[0] > d.min[0] && w.max[0] < d.max[0])
            for (const z of [.85, 1.15, 1.45]) for (const side of [-1, 1])
                lean.push({ at: [side < 0 ? w.min[0] : w.max[0], .9, z], n: [side, 0, 0] });
    }
    const loose = player.carried.map((_, i) => i).filter(i => i !== player.current);
    loose.forEach((g, k) => {
        if (k < lay.length) player.lay(g, lay[k], 0);
        else if (k - lay.length < lean.length) { const l = lean[k - lay.length]; player.leanOn(g, l.at, l.n); }
    });
    // stands stay empty (their guns are out in the booths)
}
let near = -1, button;
// the put-down gun within reach (F takes it back)
addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'f' || !document.body.classList.contains('playing')) return;
    // F does what the prompt says (set with it each frame)
    fAction?.();
});
let fAction;

// ---- optics: binoculars on the desks (F takes them, G raises them: shaky), spotting scopes in the nests (F: steady) ----
let nearOptic, binoculars = false, binocularNode, binocularFrom;
const hidden = Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1000, 0, 1]);
function useOptic(o) {
    if (o.kind === 'binoculars') { binoculars = true; binocularNode = o.name; binocularFrom = Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -o.at[0], -o.at[1], -o.at[2], 1]); model.move(o.name, hidden); return; }
    player.lookThrough(new Optic({ zoom: o.zoom, handheld: false }), o.eye);
    $('#optic').className = 'scope';
}
addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'h' || !binoculars || !document.body.classList.contains('playing')) return;
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
// posed at rest (weapon.json `animation.rest`, else the first clip's frame 0): bind pose shows clips / mags off the gun
gunMenu.items = player.carried.map(c => {
    const rest = c.weapon?.animation?.rest, clip = rest && c.model.animation(rest) ? rest : c.model.animations?.[0]?.name;
    if (clip) c.model.pose(clip, 0, false);
    return { id: c.gun.spec.model, name: c.gun.spec.name, kind: c.gun.spec.kind, image: thumbnail(renderer, c.model) };
});
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
    layer.camera = new Camera({ near: .25, far: 3000, controllers: [player.controller] });
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
    // the first that applies: its prompt is shown, F runs its action (the two never disagree)
    const loose = player.nearLoose(), b = button, o = nearOptic, st = near;
    const [text, action] = player.looking ? [$('#optic').className === 'binoculars' ? 'G  lower the binoculars · wheel zoom' : 'F  step back · wheel zoom', () => player.lookThrough()]
        : b ? [`F  target ${b.dir < 0 ? 'nearer' : 'further'} (lane ${b.lane}, at ${range.lanes.stops[lane?.stop ?? 0]} m)`, () => range.lanes.press(b.lane, b.dir)]
        : loose >= 0 ? [`F  take ${player.carried[loose].gun.spec.name}${player.down ? '' : ' (swap)'}`, () => player.pickUp(loose)]
        : o ? [o.kind === 'fixed' ? 'F  look through the spotting scope' : 'F  take the binoculars', () => useOptic(o)]
        : binoculars ? ['G  look through the binoculars', undefined]
        : st >= 0 ? [`F  take ${player.carried[stands[st].gun].gun.spec.name}`, () => player.select(stands[st].gun)] : ['', undefined];
    $('#prompt').value = text;
    fAction = action;
    $('#ammo').value = `${g.spec.name}\n${g.reloading > 0 ? 'reloading…' : `${g.rounds} / ${g.spec.magazine}`}${c.scope && g.aimed > .5 ? `\n${c.scope.zoom.toFixed(1)}×` : ''}`;
    $('#state').value = `shots ${player.shots} · hits ${player.hits}\n${lastHit}`;
};
demo.draw = camera => {
    // binoculars in the hands while raised (hidden otherwise)
    if (binocularNode) { const m = player.binocularsAt(camera); model.move(binocularNode, m ? m.multiply(binocularFrom) : hidden); }
    renderer.begin(camera, SKY);
    drawWorld(camera);
    drawStands();
    if (document.body.classList.contains('playing')) player.draw(camera);
    else { player.impacts.draw(camera); renderer.reset(); }
};

// ---- vehicles: parked jeeps, E in / out, W / S, A / D, Space handbrake, V seat / chase cam ----
// bike: lighter, revs higher, 4 gears
const BIKE = { accel: 4.5, gears: [.25, .45, .7, 1], pull: [1.8, 1.3, 1, .75], idle: 900, redline: 5200, steer: 30, steerFade: 4 };
// tank: 30 t, slow to pull away, 4 gears, a low revving diesel; stiff, well damped suspension (the hull pitches a little)
const TANK = { accel: 2.2, gears: [.22, .45, .72, 1], pull: [1.7, 1.25, 1, .8], idle: 500, redline: 2600, travel: .38, frequency: 1, damping: .32, grip: 1.3, brake: 5, reverse: 3, centre: .5, antiRoll: .3, roll: 1, shiftTime: .9 };
// fighter on its wheels: soft long legs, free rolling (the prop pulls it), a steerable tail wheel, gentle brakes
const PLANE = { travel: .3, frequency: 1.4, damping: .45, grip: 1, brake: 3.5, steer: 30, steerFade: 8, freeRoll: .005, roll: .6, antiRoll: 0 };
// every vehicle comes from the camp layout (range.json `vehicles`: jeeps, bikes, the tank, fighters)
const VEHICLES = range.data.vehicles ?? [];
const SETTINGS = { bike: BIKE, tank: TANK, plane: PLANE };
const cars = await Promise.all(VEHICLES.map(async v => {
    const base = `/assets/models/vehicles/${v.kind}/`;
    const spec = await (await fetch(base + 'vehicle.json')).json();
    const car = fleet.add({ spec, ...(SETTINGS[spec.kind] ?? {}) }, v.at, v.yaw);
    const hands = spec.steeringWheel && new SteeringHands(spec.steeringWheel);
    return { car, spec, hands, model: await Model.load(gl, base + spec.model), awake: 0, engine: undefined };
}));
let driving, seatCam = true, nearCar;
// exhaust puffs while the engine runs, a little dust only when the tyres slide (coloured by the ground); both drawn by
// @polywar/smoke (the grenades' smoke)
const DUST_LAYER = { count: 1, shape: 'sphere', radius: .1, direction: [0, 1, 0], spread: .4, speed: [0, .2], life: [1, 1], size: [.3, .3], grow: 2, drag: 2, lift: .1, swirl: .4, stretch: .06, colour: [.5, .42, .32], bright: .7, dim: .4 };
const dustPuff = { layers: [DUST_LAYER] };
const DUST = { dirt: [.5, .42, .32], stone: [.6, .58, .54], wood: undefined, metal: undefined };
const puffOut = (at, v, puff) => {
    DUST_LAYER.life[0] = DUST_LAYER.life[1] = puff.life; DUST_LAYER.size[0] = puff.size * .6; DUST_LAYER.size[1] = puff.size * 1.4;
    DUST_LAYER.grow = puff.grow * 2; DUST_LAYER.drag = puff.drag;
    DUST_LAYER.delay = [puff.delay ?? 0, puff.delay ?? 0];
    // far away the trail reads bigger and lasts longer (a car seen driving in the distance)
    const e = layer.camera.worldPosition, far = e ? Math.min(2.5, 1 + Math.max(0, Math.hypot(at[0] - (e.x ?? e[0]), at[2] - (e.z ?? e[2])) - 25) / 60) : 1;
    DUST_LAYER.size[0] *= far; DUST_LAYER.size[1] *= far; DUST_LAYER.life[0] = DUST_LAYER.life[1] = puff.life * Math.sqrt(far);
    nades.smoke.burst(dustPuff, at, { velocity: [v[0], v[1], v[2]], colour: puff.colour, opacity: puff.opacity ?? 1 });
};
const exhaust = new Exhaust({ emit: puffOut });
window.exhaust = exhaust;
// wheel dust by the ground: dry dirt throws brownish dust, stone / gravel thin grey, grass hardly any; see-through (dither)
const DUST_GROUND = {
    dirt: { colour: [.5, .42, .32], amount: 1, opacity: .55, dry: .85 },
    stone: { colour: [.6, .59, .57], amount: .6, opacity: .4, dry: .6 },
    grass: { colour: [.5, .41, .3], amount: .3, opacity: .4, dry: .3 },
};
const dust = new Dust({
    rate: 4,
    emit: (at, v, puff) => {
        // stays a bit closer to the wheel than the default; size / life come from how dry the ground is
        v[0] *= .7; v[1] *= .7; v[2] *= .7;
        puffOut(at, v, puff);
    },
    ground: (x, z) => {
        const s = range.surface([x, range.ground(x, z) + .05, z]);
        if (s === 'wood' || s === 'metal') return undefined;
        if (s === 'stone') return DUST_GROUND.stone;
        // grass grows everywhere but the 'none' zones (lanes, yards): those are the bare dirt
        return inZone('none', x, z) ? DUST_GROUND.dirt : DUST_GROUND.grass;
    },
});
window.dust = dust;
window.cars = cars;
for (const c of cars) c.car.oncrash = (speed, impact) => thrown(c, speed, impact);
const chase = { yaw: 0, pos: [0, 0, 0], look: [0, 0] };
/** the tank gun (set up after the grenades: it uses their explosions) */
let gun;
/** the fighters (set up after the grenades: smoke for the vapour) */
let planes;
const carMatrix = Matrix4.create();
const forward = c => { const f = c.toWorld([0, 0, -1], undefined, 0); return Math.atan2(-f[0], -f[2]); };
// the player stands in the driven car: two cylinders per car for the mover (front / back half)
const baseColliders = range.colliders;
const withCars = (x, z) => {
    const list = baseColliders(x, z);
    const extra = cars.filter(c => c !== driving).flatMap(({ car }) => {
        const p = car.body.position, f = car.toWorld([0, 0, -1], undefined, 0);
        if (Math.hypot(p.x - x, p.z - z) > 8) return [];
        if (car.spec.kind === 'tank') return [-1.9, 0, 1.9].map(d => ({ kind: 'cylinder', x: p.x + f[0] * d, z: p.z + f[2] * d, radius: 1.45, bottom: p.y - 1, top: p.y + 2 }));
        const bike = car.spec.kind === 'bike', r = bike ? .35 : .85, d = bike ? .6 : .85;
        return [-d, d].map(d => ({ kind: 'cylinder', x: p.x + f[0] * d, z: p.z + f[2] * d, radius: r, bottom: p.y - 1, top: p.y + (bike ? .2 : .6) }));
    });
    return extra.length ? list.concat(extra) : list;
};
// the mover's colliders only (range.colliders stays boxes: surface / bullets use it)
player.mover.setting.colliders = withCars;
// the glass goes last (after the grass tufts): drawn earlier its depth would hide the grass behind it
const GLASS = ['Window'];
function drawCars() {
    for (const c of cars)
    {
        const { car, spec, model: m } = c;
        gun?.pose(c, m);
        planes?.pose(c, m);
        car.wheels.forEach((w, i) => m.move(w.spec.node, car.wheel(i, Matrix4.create())));
        const sw = car.steeringWheel(Matrix4.create());
        if (sw) m.move(spec.steeringWheel.node, sw);
        const fork = car.fork(Matrix4.create());
        if (fork) m.move(spec.fork.node, fork);
        m.draw(renderer, car.matrix(carMatrix), {}, { skip: GLASS });
    }
}
function drawGlass() {
    // after the SSAO pass / grass: blend + depth state back to the renderer's
    renderer.begin(layer.camera, null);
    for (const { car, model: m } of cars) m.draw(renderer, car.matrix(carMatrix), {}, { only: GLASS });
    renderer.reset();
}
// the driver: hips on the seat, feet on the pedals, knees up, hands on the rim (car space offsets from the seat)
const FEET = [[.17, -.42, -.62], [-.17, -.42, -.62]], KNEES = [[.22, .5, -1.2], [-.22, .5, -1.2]], ELBOWS = [[.8, -1, .3], [-.8, -1, .3]];
// the rider: feet on the pegs, knees bent to the tank, hands on the grips (which turn with the fork)
const PEGS = [[.2, -.55, -.3], [-.2, -.55, -.3]], BIKE_KNEES = [[.18, -.1, -.55], [-.18, -.1, -.55]], BIKE_ELBOWS = [[.8, -.6, .2], [-.8, -.6, .2]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** getting on / off: 0 standing by the exit spot .. 1 seated; the hips swing up and over */
let mount = 1, mounting = 0;
const MOUNT = .9;
function seatOffset(spec) {
    // hips start standing at the exit spot, arc up over the seat
    const t = smooth(mount), s = spec.seat, from = [spec.exit[0], spec.exit[1] + .95, spec.exit[2]];
    const p = lerp3(from, s, t);
    p[1] += Math.sin(Math.PI * t) * .3;
    return p;
}
function drawRider(camera) {
    const { car, spec } = driving, s = seatOffset(spec), t = smooth(mount);
    const at = o => { const p = car.toWorld(o); return [p[0], p[1], p[2]]; };
    const dir = d => { const p = car.toWorld(d, undefined, 0); return [p[0], p[1], p[2]]; };
    const seatM = car.matrix(Matrix4.create()).multiply(Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s[0], s[1], s[2], 1]));
    // feet: the near (left) foot stays down then steps onto its peg; the right leg swings up high and over the seat
    const swing = smooth(Math.min(1, mount * 1.4)), step = smooth(Math.max(0, mount * 1.6 - .6));
    const feet = PEGS.map((p, i) => {
        const peg = [spec.seat[0] + p[0], spec.seat[1] + p[1], spec.seat[2] + p[2]];
        const ground = [spec.exit[0] + (i ? 0 : .3), spec.exit[1] + .05, spec.exit[2] + (i ? .1 : -.1)];
        if (i) return at(lerp3(ground, peg, step));
        const f = lerp3(ground, peg, swing);
        f[1] += Math.sin(Math.PI * swing) * (spec.seat[1] + .25);
        f[2] += Math.sin(Math.PI * swing) * .35;
        return at(f);
    });
    const knees = BIKE_KNEES.map(k => at([s[0] + k[0], s[1] + k[1], s[2] + k[2]]));
    const F = car.fork(Matrix4.create()), turn = q => [F[0] * q[0] + F[4] * q[1] + F[8] * q[2] + F[12], F[1] * q[0] + F[5] * q[1] + F[9] * q[2] + F[13], F[2] * q[0] + F[6] * q[1] + F[10] * q[2] + F[14]];
    const grips = spec.grips.map((g, i) => {
        const bar = turn(g), side = turn([g[0] + (i ? 1 : -1), g[1], g[2]]);
        return { at: at(bar), axis: dir([side[0] - bar[0], side[1] - bar[1], side[2] - bar[2]]), palm: dir([0, -.7, -.7]) };
    });
    // drawSeated takes the hands [right, left]; grips are [left, right]
    player.drawSeated(camera, seatM, { feet, knees, elbows: BIKE_ELBOWS.map(dir), hands: [grips[1], grips[0]], take: 0 }, seatCam);
    if (player.down?.fixed) stowBack();
}
/** the rifle slung across the rider's back, muzzle up over the right shoulder (stow lays a gun flat: undo its turn + lift) */
function stowBack() {
    const { car, spec } = driving, s = seatOffset(spec), size = (player.held ?? player.carried[player.current]).model.size;
    player.stow(car.matrix(Matrix4.create())
        .multiply(Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s[0], s[1] + .42, s[2] + .17, 1]))
        .multiply(Matrix4.rotationZ(-.64)).multiply(Matrix4.rotationX(Math.PI / 2))
        .multiply(Matrix4.rotationZ(-Math.PI / 2)).multiply(Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -size[0] / 2, 0, 1])));
}
function drawDriver(camera) {
    if (driving.spec.kind === 'bike') return drawRider(camera);
    // tank: the crew sits inside, out of sight
    if (driving.spec.kind === 'tank' || driving.spec.kind === 'plane') return;
    const { car, spec, hands } = driving, s = spec.seat;
    const at = o => { const p = car.toWorld([s[0] + o[0], s[1] + o[1], s[2] + o[2]]); return [p[0], p[1], p[2]]; };
    const dir = d => { const p = car.toWorld(d, undefined, 0); return [p[0], p[1], p[2]]; };
    const seatM = car.matrix(Matrix4.create()).multiply(Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, s[0], s[1], s[2], 1]));
    const rim = hands ? hands.hands().map(h => { const p = car.toWorld(h.at); return { at: [p[0], p[1], p[2]], axis: dir(h.axis), palm: dir(h.palm) }; }) : [];
    player.drawSeated(camera, seatM, { feet: FEET.map(at), knees: KNEES.map(at), elbows: ELBOWS.map(dir), hands: rim, take: smooth(taking) }, seatCam);
}
// the gun rides on the passenger seat (spec.passenger, else the seat mirrored); E leans over and takes it, then out
let taking = -1, placing = false;
const TAKE = .6, smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const passenger = spec => spec.passenger ?? [-spec.seat[0], spec.seat[1] - .08, spec.seat[2]];
function stowGun() {
    if (!driving || !player.down?.fixed || driving.spec.kind === 'bike' || driving.spec.kind === 'tank' || driving.spec.kind === 'plane') return;
    const p = passenger(driving.spec);
    player.stow(driving.car.matrix(Matrix4.create()).multiply(Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1])));
}
function enter(c) {
    driving = c;
    taking = -1; placing = false;
    if (c.spec.kind === 'bike')
    {
        mount = 0; mounting = 1;
        if (c.car.fallen) c.car.raise();
        if (player.held && !player.down) stowBack();
    }
    else if (c.spec.kind === 'tank' || c.spec.kind === 'plane') { if (player.held && !player.down) player.stow(c.car.matrix(Matrix4.create()).multiply(Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...c.spec.seat, 1]))); }
    else if (player.held && !player.down) { player.stow(Matrix4.create()); stowGun(); taking = 1; placing = true; }
    c.hands?.reset(c.car.wheelTurn);
    if (c.spec.kind === 'plane') { const p = planes.of(c); p.air.engine(true); p.air.controls.throttle = 0; p.air.controls.flaps = 1; seatCam = true; }
    else c.engine ??= c.spec.kind === 'tank' ? new TankSound(player.feel.mixer, TANK_SOUND) : new EngineSound({ mixer: player.feel.mixer, ...(ENGINES[c.spec.kind] ?? {}) });
    chase.yaw = forward(c.car);
    // tank: the look is the gun's aim (world yaw / pitch), starts along the turret
    // tank: no inside view yet, so it starts in third person (V still swaps)
    if (c.spec.kind === 'tank') seatCam = false;
    if (c.spec.kind === 'tank') { const t = gun.turretOf(c); chase.aim = [chase.yaw + t.yaw, t.pitch]; }
    const p = c.car.body.position;
    chase.pos = [p.x + Math.sin(chase.yaw) * 7, p.y + 2.5, p.z + Math.cos(chase.yaw) * 7];
    chase.look = [0, 0];
}
function leave() {
    const c = driving.car, out = c.toWorld(driving.spec.exit);
    if ((driving.spec.kind === 'bike' || driving.spec.kind === 'tank' || driving.spec.kind === 'plane') && player.down?.fixed) player.takeBack();
    if (driving.spec.kind === 'plane') { const p = planes.of(driving); p.air.engine(false); p.guns.trigger = false; }
    driving.awake = 3;
    driving = undefined;
    mounting = 0; mount = 1;
    player.mover.place(out[0], out[2]);
}
/** crashed: thrown off / out where it is with its speed just before (jeep: open, no belts, only a hard one throws you) */
function thrown(c, speed, impact) {
    if (driving !== c || c.spec.kind === 'tank') return;
    // a plane: a hard hit (into the ground, a belly landing too fast) blows it up and throws the pilot out
    if (c.spec.kind === 'plane')
    {
        if (impact < 14) return;
        const at = c.car.body.position;
        nades.explosion.explode([at.x, at.y + .5, at.z], { power: 4, tag: 'plane' });
        planes.of(c).air.engine(false);
    }
    // slow: the bike just stops / tips and you step off; the jeep keeps you in
    if (speed < 6) { if (c.car.fallen) leave(); return; }
    if (c.spec.kind !== 'bike' && speed < 8) return;
    const v = c.car.crashVelocity, at = c.car.toWorld(c.spec.seat);
    if (player.down?.fixed) player.takeBack();
    driving.awake = 3;
    driving = undefined;
    mounting = 0; mount = 1;
    player.mover.place(at[0], at[2]);
    nades.fling([v[0] * .85, Math.max(1.5, v[1] + 1.5 + speed * .08), v[2] * .85], speed);
}
addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'v' && driving) seatCam = !seatCam;
    if (driving?.spec.kind === 'plane' && e.key.toLowerCase() === 'f') { const c = planes.of(driving).air.controls; c.flaps = c.flaps ? 0 : 1; return; }
    if (driving?.spec.kind === 'plane' && e.key.toLowerCase() === 'i') { const a = planes.of(driving).air; a.engine(!a.running); return; }
    if (e.key.toLowerCase() !== 'e' || !document.body.classList.contains('playing')) return;
    if (driving?.spec.kind === 'tank' || driving?.spec.kind === 'plane') { if (Math.abs(driving.car.speed) < 2) leave(); return; }
    if (driving?.spec.kind === 'bike') { if (!mounting && Math.abs(driving.car.speed) < 3) mounting = -1; return; }
    if (driving) { if (placing) return; if (player.down?.fixed) taking = Math.max(taking, 0); else leave(); }
    else if (nearCar) enter(nearCar);
});
// ---- dev third person (M): camera behind / round the body; no daze or blink over it ----
let third = false;
const orbit = [0, 0];
addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'm' || !document.body.classList.contains('playing')) return;
    third = !third; orbit[0] = orbit[1] = 0;
    if (!third) player.thirdPerson = undefined;
});
function thirdCamera(c) {
    if (!third) return;
    player.thirdPerson = Matrix4.create(Array.from(c.worldMatrix));
    const e = [c.position[0], c.position[1], c.position[2]], yaw = c.rotation.y + orbit[0], pitch = Math.max(-1.3, Math.min(1.3, c.rotation.x * .5 - .25 + orbit[1]));
    const cp = Math.cos(pitch), d = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp], dist = 3;
    const p = [e[0] - d[0] * dist + Math.cos(yaw) * .4, e[1] - d[1] * dist + .3, e[2] - d[2] * dist - Math.sin(yaw) * .4];
    p[1] = Math.max(p[1], range.ground(p[0], p[2]) + .3);
    c.position.set(p);
    c.rotation.set([pitch, yaw, 0]);
}
function driveCamera(camera, dt) {
    const { car, spec } = driving, input = player.input;
    const { dx, dy } = input?.consume() ?? { dx: 0, dy: 0 };
    let eye, yaw, pitch;
    if (spec.kind === 'plane')
    {
        // the mouse is the stick; seat: the pilot's eye rolls with the plane, chase: behind, banks half as much
        planes.mouse(dx, dy);
        const f = car.toWorld([0, 0, -1], undefined, 0), u = car.toWorld([0, 1, 0], undefined, 0), rt = car.toWorld([1, 0, 0], undefined, 0);
        const bank = Math.atan2(rt[1], u[1]);
        if (seatCam)
        {
            eye = car.toWorld(spec.eye);
            yaw = Math.atan2(-f[0], -f[2]); pitch = Math.asin(Math.max(-1, Math.min(1, f[1])));
            camera.position.set(eye); camera.rotation.set([pitch, yaw, bank]);
        }
        else
        {
            const p = car.body.position, v = car.body.velocity, sp = Math.hypot(v.x, v.y, v.z);
            // behind along the flight path when fast, the nose when slow
            const d = sp > 20 ? [v.x / sp, v.y / sp, v.z / sp] : [f[0], f[1], f[2]];
            const want = [p.x - d[0] * 16 + u[0] * 4, p.y - d[1] * 16 + u[1] * 4, p.z - d[2] * 16 + u[2] * 4];
            want[1] = Math.max(want[1], range.ground(want[0], want[2]) + 1);
            for (let i = 0; i < 3; i++) chase.pos[i] += (want[i] - chase.pos[i]) * Math.min(1, dt * 5);
            eye = chase.pos;
            const look = [p.x + f[0] * 20 - eye[0], p.y + f[1] * 20 - eye[1], p.z + f[2] * 20 - eye[2]];
            yaw = Math.atan2(-look[0], -look[2]); pitch = Math.atan2(look[1], Math.hypot(look[0], look[2]));
            camera.position.set(eye); camera.rotation.set([pitch, yaw, bank * .5]);
        }
        const cp = Math.cos(pitch);
        player.feel.mixer.setListener({ x: eye[0], y: eye[1], z: eye[2] }, { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp });
        return;
    }
    if (spec.kind === 'tank')
    {
        // the mouse aims (world yaw / pitch); seat = the gunner's sight on the turret, chase = behind + over the turret
        chase.aim[0] -= dx * .0018;
        chase.aim[1] = Math.max(-.3, Math.min(.5, chase.aim[1] - dy * .0018));
        yaw = chase.aim[0]; pitch = chase.aim[1];
        const cp = Math.cos(pitch), d = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
        const t = gun.turretOf(driving);
        if (seatCam)
        {
            const m = t.turretMatrix(), e = spec.eye;
            eye = car.toWorld([m[0] * e[0] + m[4] * e[1] + m[8] * e[2] + m[12], m[1] * e[0] + m[5] * e[1] + m[9] * e[2] + m[13], m[2] * e[0] + m[6] * e[1] + m[10] * e[2] + m[14]]);
        }
        else
        {
            const r = car.toWorld(spec.turret.position);
            eye = [r[0] - d[0] * 11, r[1] + 3.2 - d[1] * 6, r[2] - d[2] * 11];
            eye[1] = Math.max(eye[1], range.ground(eye[0], eye[2]) + 1);
            // look a little down at the tank: the aim point stays at the crosshair (centre) far off
            const far = [r[0] + d[0] * 400, r[1] + d[1] * 400, r[2] + d[2] * 400], to = [far[0] - eye[0], far[1] - eye[1], far[2] - eye[2]];
            pitch = Math.atan2(to[1], Math.hypot(to[0], to[2]));
        }
        chase.lookDir = d;
    }
    else if (seatCam)
    {
        chase.look[0] = Math.max(-2.2, Math.min(2.2, chase.look[0] - dx * .0022));
        chase.look[1] = Math.max(-1.2, Math.min(1.2, chase.look[1] - dy * .0022));
        eye = car.toWorld(spec.kind === 'bike' ? lerp3([spec.exit[0], spec.exit[1] + 1.65, spec.exit[2]], spec.eye, smooth(mount)) : spec.eye);
        const f = car.toWorld([0, 0, -1], undefined, 0);
        yaw = forward(car) + chase.look[0];
        pitch = Math.asin(Math.max(-1, Math.min(1, f[1]))) + chase.look[1];
        // taking the gun: the eye leans over toward the passenger seat, looking down at it
        const k = smooth(taking * 1.4);
        if (k > 0)
        {
            const g = car.toWorld(passenger(spec)), lean = car.toWorld([spec.eye[0] * .3 + passenger(spec)[0] * .3, spec.eye[1] - .2, spec.eye[2] + .05]);
            for (let i = 0; i < 3; i++) eye[i] += (lean[i] - eye[i]) * k;
            const to = [g[0] - eye[0], g[1] - eye[1], g[2] - eye[2]];
            let dy = Math.atan2(-to[0], -to[2]) - yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            yaw += dy * k;
            pitch += (Math.atan2(to[1], Math.hypot(to[0], to[2])) - pitch) * k;
        }
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
            const on = driving.spec.kind !== 'bike' || mount >= 1;
            if (driving.spec.kind === 'tank' || driving.spec.kind === 'plane') { const p = driving.car.body.position; player.mover.place(p.x, p.z); }
            inputs.set(driving.car, on ? { throttle: k('w') - k('s'), steer: k('d') - k('a'), handbrake: !!input?.key(' '), ridden: true } : { throttle: 0, steer: 0, parked: true, ridden: mount > .5 });
        }
        planes?.control(dt, driving, player.input, inputs);
        fleet.update(dt, inputs);
        planes?.update(dt, driving);
        gun?.update(dt, driving, driving?.spec.kind === 'tank' ? chase.lookDir : undefined);
        driving?.hands?.update(dt, driving.car.wheelTurn);
        if (mounting) { mount = Math.max(0, Math.min(1, mount + mounting * dt / MOUNT)); if (mount >= 1 && mounting > 0) mounting = 0; else if (mount <= 0 && mounting < 0) leave(); }
        if (driving && placing && (taking -= dt / TAKE) <= 0) { taking = -1; placing = false; }
        else if (driving && !placing && taking >= 0 && (taking += dt / TAKE) >= 1) { taking = -1; player.takeBack(); leave(); }
        for (const c2 of cars) { dust.update(dt, c2.car); if (c2.engine) exhaust.update(dt, c2.car); }
        // the player / grenades aren't ticked while driving: age the impacts + dust here
        if (driving) player.impacts.update(dt);
        for (const c2 of cars)
        {
            if (c2 !== driving && c2.awake > 0) c2.awake -= dt;
            // the engine runs while driven and a few seconds after (idling), then stops
            if (c2.engine)
            {
                const p = c2.car.body.position;
                const turn = c2 === driving ? Math.abs(inputs.get(c2.car)?.steer ?? 0) : 0;
                if (c2.spec.kind === 'tank') c2.engine.update({ rev: (c2.car.rpm - TANK.idle) / (TANK.redline - TANK.idle), load: Math.max(c2.car.power, turn * .7), tracks: Math.abs(c2.car.speed) + turn * 1.6, turn, turret: gun.turretOf(c2).rate, position: [p.x, p.y, p.z] });
                else c2.engine.update({ rpm: c2.car.rpm, load: c2.car.power, slip: c2.car.slip, position: [p.x, p.y, p.z] });
                if (c2 !== driving && c2.awake <= 0) { c2.engine.stop(.8); c2.engine = undefined; }
            }
        }
        if (driving) driveCamera(c, dt);
        else
        {
            // dev third person: hold Z to orbit (the mouse turns the camera, not you)
            if (third && player.input?.key('z')) { const { dx, dy } = player.input.consume(); orbit[0] -= dx * .004; orbit[1] = Math.max(-1.2, Math.min(1.2, orbit[1] - dy * .004)); }
            walkCam.update(c, dt);
            thirdCamera(c);
        }
    },
    destroy: () => walkCam.destroy?.(),
};
$('#play').onclick = () => {
    document.body.classList.add('playing');
    layer.camera = new Camera({ near: .2, far: 3000, controllers: [seat] });
};
// ---- grenades (H hold / let go, F at a crate): grenades.js ----
// smoke + explosions in the world's depth (before the hands, which clear it)
function drawAir(camera) { window.nades?.drawAir(camera); renderer.reset(); }
const nades = await grenades({ layer, gl, renderer, range, player, playing: () => document.body.classList.contains('playing') && !driving, busy: () => binoculars || menuOpen || !!tuner?.open,
    // in the tank the hull takes a blast: the crew gets 15% of the shock
    armour: () => driving?.spec.kind === 'tank' ? .15 : 1 });
window.nades = nades;
// ---- tank gun (left click while in the tank): tank.js ----
gun = tankGun({ gl, renderer, nades, shots, dust: (at, v) => { at[1] = range.ground(at[0], at[2]) + .3; puffOut(at, v, { life: 3.5, size: 2.2, grow: 1.2, drag: 1.4, colour: DUST_GROUND.dirt.colour, opacity: .6 }); } });
window.gun = gun;
// ---- fighters (hold click fires): plane.js ----
planes = planeSetup({ cars, player, shots, nades });
window.planes = planes;
addEventListener('mousedown', e => { if (e.button === 0 && driving?.spec.kind === 'plane') { planes.fire(driving, true); player.feel.mixer.context.resume?.(); } });
addEventListener('mouseup', e => { if (e.button === 0) for (const c of cars) planes.fire(c, false); });
window.TANK_SOUND = TANK_SOUND; // tune live: TANK_SOUND.tracks.links = 4 etc. (read on each update; band / tone set-up on getting in)
addEventListener('mousedown', e => {
    if (e.button !== 0 || driving?.spec.kind !== 'tank' || !document.body.classList.contains('playing')) return;
    if (gun.fire(driving)) player.feel.mixer.context.resume?.();
});
const walkTick = demo.tick;
demo.tick = dt => {
    if (driving)
    {
        if (!document.body.classList.contains('playing')) return;
        fAction = undefined;
        $('#prompt').value = `E  get ${driving.spec.kind === 'bike' ? 'off' : 'out'} · V ${seatCam ? 'chase' : 'seat'} cam`;
        $('#ammo').value = `${Math.abs(driving.car.speed * 3.6).toFixed(0)} km/h`;
        $('#cross').style.opacity = '0';
        if (driving.spec.kind === 'plane')
        {
            $('#prompt').value = `E get out (stopped) · V ${seatCam ? 'chase' : 'cockpit'} · Shift / Ctrl throttle · mouse, S / W pitch · A / D roll · Z / C rudder · B brakes · F flaps · I engine · hold click fire`;
            $('#ammo').value = planes.hud(driving);
            $('#cross').style.opacity = '1';
        }
        if (driving.spec.kind === 'tank')
        {
            $('#prompt').value += ` · click fire · ${gun.loading > 0 ? `loading ${gun.loading.toFixed(1)} s` : 'loaded'}`;
            $('#cross').style.opacity = '1';
        }
        nades.tick(dt);
        return;
    }
    walkTick(dt);
    nades.tick(dt);
    $('#glare').style.opacity = nades.glare() * .9;
    if (nades.held()) $('#prompt').value = nades.prompt();
    const f = player.mover.feet;
    nearCar = cars.find(({ car, spec }) => { const d = car.toWorld(spec.exit); return Math.hypot(d[0] - f[0], d[2] - f[2]) < 1.6; });
    if (nearCar && document.body.classList.contains('playing') && !$('#prompt').value) $('#prompt').value = nearCar.car.fallen ? 'E  lift the bike' : nearCar.spec.kind === 'bike' ? 'E  ride' : nearCar.spec.kind === 'tank' || nearCar.spec.kind === 'plane' ? 'E  climb in' : 'E  drive';
};
demo.draw = camera => {
    // the casters into the shadow map first (range, gun stands, cars; grass doesn't cast)
    shadows.cast(camera, renderer.light.sunDirection, view => { renderer.begin(view, null); drawWorld(view); drawStands(); drawCars(); renderer.reset(); });
    renderer.begin(camera, SKY);
    drawWorld(camera);
    drawStands();
    drawGrass(camera);
    drawCars();
    nades.draw();
    gun.draw();
    if (driving) { stowGun(); player.drawDown(); }
    glow.draw(camera, renderer.lights);
    renderer.reset();
    if (!document.body.classList.contains('playing')) { demo.endOcclusion(); drawTufts(camera); drawGlass(); player.impacts.draw(camera); renderer.reset(); drawAir(camera); }
    else if (driving) { drawDriver(camera); demo.endOcclusion(); drawTufts(camera); drawGlass(); drawAir(camera); }
    else player.draw(camera);
    // face against something / lying: dark from the centre (first person only)
    const cam = layer.camera;
    if (cam && document.body.classList.contains('playing') && !third && (!driving || seatCam))
    {
        const e = cam.worldPosition, x = cam.rotation.x, y = cam.rotation.y, cx = Math.cos(x);
        closeDark.update(1 / 60, [e[0] ?? e.x, e[1] ?? e.y, e[2] ?? e.z], [-Math.sin(y) * cx, Math.sin(x), -Math.cos(y) * cx], driving ? range.cast : shots, range.ground);
        // limp on the ground the eye is low: a closer near plane so the ground isn't cut open
        cam.near = player.ragdoll ? .04 : .25;
        closeDark.draw();
    }
    if (!third || driving) nades.drawDaze();
};

// ---- FPS (top left): frames counted over half a second ----
{
    let frames = 0, from = performance.now();
    const count = now => {
        frames++;
        if (now - from > 500) { $('#fps').value = `${Math.round(frames * 1000 / (now - from))} fps`; frames = 0; from = now; }
        requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
}
