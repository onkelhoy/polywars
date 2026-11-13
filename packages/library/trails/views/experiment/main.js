import { furnish } from '@polywar/trails';

const $ = s => document.querySelector(s);
const canvas = $('#map'), ctx = canvas.getContext('2d');
const COLOUR = { bench: '#f94', lantern: '#ff6', 'street-lamp': '#fe8', signpost: '#6cf', fence: '#c85', log: '#a63', woodpile: '#a63', Rock: '#999' };
const colour = kind => Object.entries(COLOUR).find(([k]) => kind.includes(k))?.[1] ?? '#f0f';
$('#legend').innerHTML = Object.entries(COLOUR).map(([k, c]) => `<i style="background:${c}"></i>${k}`).join(' ');

function build() {
    for (const id of ['hills', 'restEvery', 'view', 'drop']) $(`#${id} + span`).textContent = $('#' + id).value;
    const seed = Number($('#seed').value), hills = Number($('#hills').value);
    const ground = (x, z) => hills * (Math.sin(x / 60 + seed) * Math.cos(z / 80) + .5 * Math.sin((x + z) / 25 + seed * 2));
    // a winding trail on the ground, a village road with a village spot, a viewpoint at the trail end
    const trail = [], road = [];
    for (let t = 0; t <= 1; t += .005) { const x = -450 + t * 900, z = Math.sin(t * 9 + seed) * 150; trail.push([x, ground(x, z), z]); }
    for (let t = 0; t <= 1; t += .01) { const x = -400 + t * 300, z = 250 - t * 40; road.push([x, ground(x, z), z]); }
    const ways = [{ id: 1, class: 'path', points: trail, width: 1.5 }, { id: 2, class: 'road', points: road, width: 5.5 }];
    const spots = [{ kind: 'village', x: -250, z: 220, radius: 90 }, { kind: 'viewpoint', x: trail.at(-1)[0], z: trail.at(-1)[2], radius: 10 }];
    const { items, fences } = furnish({ ways, spots, ground, mouths: [{ x: 300, y: 0, z: -300, dx: 1, dz: 0 }] }, { seed, restEvery: Number($('#restEvery').value), view: Number($('#view').value), fence: { drop: Number($('#drop').value) } });

    canvas.width = innerWidth; canvas.height = innerHeight;
    const k = Math.min(innerWidth, innerHeight) / 1000, cx = innerWidth / 2, cy = innerHeight / 2, img = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1)
    {
        const h = ground((x - cx) / k, (y - cy) / k), v = 60 + h * 1.5, i = (y * canvas.width + x) * 4;
        img.data[i] = v * .6; img.data[i + 1] = v; img.data[i + 2] = v * .5; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    for (const w of ways) { ctx.strokeStyle = w.class === 'path' ? '#dcb' : '#fff'; ctx.lineWidth = w.width * k + 1; ctx.beginPath(); w.points.forEach(([x, , z], i) => i ? ctx.lineTo(cx + x * k, cy + z * k) : ctx.moveTo(cx + x * k, cy + z * k)); ctx.stroke(); }
    for (const run of fences) { ctx.strokeStyle = '#c85'; ctx.lineWidth = 3; ctx.beginPath(); run.forEach(([x, , z], i) => i ? ctx.lineTo(cx + x * k, cy + z * k) : ctx.moveTo(cx + x * k, cy + z * k)); ctx.stroke(); }
    for (const it of items) { ctx.fillStyle = colour(it.kind); ctx.beginPath(); ctx.arc(cx + it.x * k, cy + it.z * k, 3, 0, 7); ctx.fill(); }
    const counts = {};
    for (const it of items) { const n = it.kind.split('/').pop(); counts[n] = (counts[n] ?? 0) + 1; }
    $('#info').value = `${items.length} items\n` + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ');
}
for (const el of document.querySelectorAll('aside input')) el.oninput = build;
onresize = build;
build();
