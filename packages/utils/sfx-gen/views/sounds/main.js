import { GUNS } from '@polywar/weapons';

const $ = s => document.querySelector(s);
const base = '/assets/audio/effects/weapons/';
const context = new AudioContext(), buffers = new Map();

async function buffer(url) {
    if (!buffers.has(url)) buffers.set(url, fetch(url).then(r => r.arrayBuffer()).then(b => context.decodeAudioData(b)));
    return buffers.get(url);
}
async function play(url) {
    await context.resume();
    const source = context.createBufferSource();
    source.buffer = await buffer(url);
    source.connect(context.destination);
    source.start();
}

async function set(id, title, parent) {
    const json = await fetch(`${base}${id}/sounds.json`).then(r => r.ok ? r.json() : null);
    const h = document.createElement('h2');
    h.textContent = json ? title : `${title} (no sounds.json)`;
    const row = document.createElement('div');
    row.className = 'set';
    parent.append(h, row);
    for (const [cue, files] of Object.entries(json?.sounds ?? {}))
    {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = cue; b.className = cue.startsWith('shot') ? 'shot' : '';
        b.onclick = () => play(`${base}${id}/${files[Math.floor(Math.random() * files.length)]}`);
        row.append(b);
    }
}

await set('brass', 'brass (per surface)', $('#brass'));
const models = [...new Map(Object.values(GUNS).map(g => [g.model, g])).values()];
for (const g of models) await set(g.model, `${g.name} · ${g.caliber}`, $('#guns'));
