import '@polywar/viewport';
import { Camera } from '@papit/game-engine';
import { Renderer, Model } from '@polywar/renderer';
import { Matrix4 } from '@papit/matrix';
import { GUNS } from '@polywar/weapons';
import { Player } from '@polywar/player';
import { RigidBody, Box } from '@papit/rigidbody';
import { ShootingRange } from '@polywar/shooting-range';

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
    character: '/assets/models/characters/knight/character.json',
    // ?guns=kar98k,svt-40@scope-3 for another loadout; the first ones go on the cases
    guns: new URLSearchParams(location.search).get('guns')?.split(',') ?? Object.keys(GUNS),
}, {
    hit: (bullet, hit) => {
        if (!hit.target) return;
        $('#marker').classList.add('on');
        requestAnimationFrame(() => requestAnimationFrame(() => $('#marker').classList.remove('on')));
        lastHit = `${hit.target.name} · ${bullet.travelled.toFixed(0)} m`;
    },
    exit: () => document.body.classList.remove('playing'),
}, range.spawn);
window.player = player;
// cases bounce off every box (the player steps its own world)
for (const s of range.solids)
{
    const at = s.min.map((v, k) => (v + s.max[k]) / 2), size = s.min.map((v, k) => Math.max(.02, s.max[k] - v));
    player.feel.world.add(new RigidBody({ shape: new Box(...size), position: { x: at[0], y: at[1], z: at[2] } }));
}
await player.ready;

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
let near = -1;
addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'f' || near < 0 || !document.body.classList.contains('playing')) return;
    player.select(stands[near].gun);
});

// ---- menu ----
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
    const g = player.gun, m = player.mover, c = player.held, f = m.feet;
    const camera = layer.camera, fov = 2 * Math.atan(Math.tan(camera.fov / 2) / camera.zoom);
    const gap = Math.tan(player.spread) / Math.tan(fov / 2) * layer.element.clientHeight / 2;
    $('#cross').style.setProperty('--gap', `${Math.max(4, gap).toFixed(1)}px`);
    $('#cross').style.opacity = String(1 - g.aimed);
    const i = range.standNear(f[0], f[2]);
    near = i >= 0 && stands[i].gun >= 0 && stands[i].gun !== player.current ? i : -1;
    $('#prompt').value = near >= 0 ? `F  take ${player.carried[stands[near].gun].gun.spec.name}` : '';
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
