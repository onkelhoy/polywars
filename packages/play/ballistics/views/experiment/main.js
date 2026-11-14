import { Bullets, zeroAngle, dropAt } from '@polywar/ballistics';
import { GUNS, CALIBERS } from '@polywar/weapons';

const $ = s => document.querySelector(s);
const ctx = $('#chart').getContext('2d');
const COLOURS = ['#f80', '#4cf', '#8f4', '#f4a', '#ff4', '#a8f', '#fff', '#4fa'];

function draw() {
    const range = +$('#range').value, W = 1000, H = 420, top = 2, bottom = -8;
    $('#range').nextElementSibling.textContent = range;
    const x = d => d / range * W, y = h => (top - h) / (top - bottom) * H;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#fff3'; ctx.fillStyle = '#fff8';
    for (let h = bottom; h <= top; h++) { ctx.beginPath(); ctx.moveTo(0, y(h)); ctx.lineTo(W, y(h)); ctx.stroke(); ctx.fillText(`${h} m`, 4, y(h) - 2); }
    for (let d = 0; d <= range; d += 50) ctx.fillText(`${d}`, x(d) + 2, H - 4);
    let lines = '';
    Object.values(GUNS).forEach((spec, i) => {
        const c = CALIBERS[spec.caliber], angle = zeroAngle(c.speed, c.drag, spec.zero);
        const points = [];
        const bullets = new Bullets(() => null);
        const b = bullets.fire({ from: [0, 0, 0], direction: [Math.cos(angle), Math.sin(angle), 0], speed: c.speed, drag: c.drag, life: 5 });
        while (!b.gone && b.position[0] < range) { bullets.update(1 / 240); points.push([b.position[0], b.position[1]]); }
        ctx.strokeStyle = COLOURS[i % COLOURS.length]; ctx.lineWidth = 2; ctx.beginPath();
        points.forEach(([d, h], k) => k ? ctx.lineTo(x(d), y(h)) : ctx.moveTo(x(d), y(h)));
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle; ctx.fillText(spec.name, W - 120, 16 + i * 14);
        const at = d => { const p = points.find(p => p[0] >= d); return p ? p[1].toFixed(2).padStart(6) : '     -'; };
        lines += `${spec.name.padEnd(16)} ${spec.caliber.padEnd(7)} zero ${String(spec.zero).padStart(3)} m · 50 m ${at(50)} · 100 m ${at(100)} · 200 m ${at(200)} · 400 m ${at(400)}  (level drop @100 m ${dropAt(c.speed, c.drag, 100).toFixed(2)})\n`;
    });
    $('#info').value = lines;
}
$('#range').oninput = draw;
draw();
