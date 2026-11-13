import { Placements } from '@polywar/placements';

const $ = s => document.querySelector(s);
const canvas = $('#map'), ctx = canvas.getContext('2d');
const KINDS = ['props/village/bench', 'props/village/street-lamp', 'props/village/signpost', 'props/village/fence'], COLOURS = ['#e94', '#ff6', '#6cf', '#a86'];
const record = new Placements();

function generate() {
    $('#count + span').textContent = $('#count').value;
    record.clear('trails');
    let s = Number($('#seed').value) * 7919 + 1;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < Number($('#count').value); i++) record.add('trails', KINDS[(rnd() * 4) | 0], rnd() * 1000 - 500, 0, rnd() * 1000 - 500, rnd() * 6.28);
    record.applyChanges();
}

function draw() {
    canvas.width = innerWidth; canvas.height = innerHeight;
    const k = Math.min(innerWidth, innerHeight) / 1100, cx = innerWidth / 2, cy = innerHeight / 2;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const p of record.all()) { ctx.fillStyle = COLOURS[KINDS.indexOf(p.kind)]; ctx.fillRect(cx + p.x * k - 2, cy + p.z * k - 2, 4, 4); }
    const json = JSON.stringify(record.toJSON()).length, packed = record.pack().byteLength;
    const round = new Placements(); round.unpack(record.pack());
    $('#info').value = `${record.size} placements · ${record.changes.length} changes\nJSON ${(json / 1024).toFixed(1)} kB · packed ${(packed / 1024).toFixed(1)} kB\nunpack round trip: ${round.size} items, ids match ${record.all().every(p => round.get(p.id)?.kind === p.kind)}\nchanges only (seeded source): ${JSON.stringify(record.changes).length} B`;
}

canvas.onclick = e => {
    const k = Math.min(innerWidth, innerHeight) / 1100, x = (e.clientX - innerWidth / 2) / k, z = (e.clientY - innerHeight / 2) / k;
    const near = record.all().reduce((b, p) => { const d = Math.hypot(p.x - x, p.z - z); return d < b.d ? { d, p } : b; }, { d: 15 / k, p: null });
    if (near.p) record.remove(near.p.id);
    draw();
};
$('#count').oninput = $('#seed').oninput = () => { record.changes = []; generate(); draw(); };
$('#regen').onclick = () => { generate(); draw(); };
onresize = draw;
generate(); draw();
