import '@polywar/3d-asset-preview';
import { Gun, GUNS } from '@polywar/weapons';

const $ = s => document.querySelector(s);
const preview = $('pw-3d-asset-preview');
let gun, held = false, last = performance.now(), hits = [];

for (const [id, spec] of Object.entries(GUNS)) $('#pick').add(new Option(spec.name, id));
const pick = id => {
    gun = new Gun(id);
    hits = [];
    preview.src = `/assets/models/weapons/guns/${gun.spec.model}/model.glb`;
};
$('#pick').onchange = e => pick(e.target.value);
$('#fire').onpointerdown = () => { held = true; };
window.addEventListener('pointerup', () => { held = false; });
$('#reload').onclick = () => gun.reload();
pick(Object.keys(GUNS)[0]);

const ctx = $('#spread').getContext('2d');
function frame(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    gun.aim($('#aim').checked);
    const moving = $('#moving').checked ? 1 : 0;
    const shot = gun.trigger(held);
    if (shot === 'shot')
    {
        const [x, y] = gun.scatter(moving);
        hits.push([x * 50, y * 50]);
        if (hits.length > 60) hits.shift();
        preview.animation = 'fire';
    }
    if (shot === 'reload' || (shot === null && gun.reloading > 0 && preview.animation !== 'reload' && preview.animation !== 'reload-empty')) preview.animation = gun.emptyReload ? 'reload-empty' : 'reload';
    if (gun.update(dt) === 'reloaded' || (preview.animation === 'fire' && gun.sinceShot > .5)) preview.animation = 'idle';
    const s = gun.spec;
    $('#info').value = `${gun.rounds} / ${s.magazine} · ${s.auto ? 'auto' : 'semi'} · ${Math.round(60 / s.interval)} rpm\n`
        + `${s.caliber} · zero ${s.zero} m · aimed ${(gun.aimed * 100).toFixed(0)}%\n`
        + `spread now ${(gun.spread(moving) * 1000).toFixed(1)} mrad · bloom ${(gun.bloom * 1000).toFixed(1)}`
        + (gun.reloading > 0 ? `\nreloading ${(gun.progress * 100).toFixed(0)}%` : '');
    const w = 240, scale = w / 6; // 6 m across
    ctx.clearRect(0, 0, w, w);
    ctx.strokeStyle = '#fff4'; ctx.beginPath(); ctx.arc(w / 2, w / 2, scale / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#f80'; ctx.beginPath(); ctx.arc(w / 2, w / 2, Math.max(1, gun.spread(moving) * 50 * scale), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const [x, y] of hits) ctx.fillRect(w / 2 + x * scale - 1.5, w / 2 + y * scale - 1.5, 3, 3);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
