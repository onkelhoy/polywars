import '@polywar/3d-demo';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer } from '@polywar/renderer';
import { loadNature, modelUrl } from '@polywar/nature';
import { Scatter } from '@polywar/scatter';

// random nature props on a flat field: every family, by its scale range
const $ = s => document.querySelector(s);
const demo = $('pw-3d-demo');
await demo.ready;
const renderer = new Renderer(demo.layer);
renderer.light.fogDensity = .002;
renderer.light.fogColor = [.62, .72, .82];
const list = await loadNature();
const scatter = new Scatter(renderer, (name, lod) => modelUrl(list, name, lod));
const size = 1200;
const ground = upload(demo.layer.gl, new MeshBuilder().box([.3, .45, .2], { at: [0, -.5, 0], scale: [size, 1, size] }).build());

const plant = async count => {
    const families = list.families.filter(f => f.biomes.length);
    let s = 1;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const batches = new Map();
    for (let i = 0; i < count; i++)
    {
        const f = families[Math.floor(rand() * families.length)], model = f.models[Math.floor(rand() * f.models.length)];
        let b = batches.get(model);
        if (!b) batches.set(model, b = { model, kind: f.kind, list: [] });
        b.list.push((rand() - .5) * size, 0, (rand() - .5) * size, f.scale[0] + rand() * (f.scale[1] - f.scale[0]), rand() * 6.28, .9 + rand() * .2, f.sway, 0);
    }
    await scatter.place([...batches.values()].map(b => ({ ...b, data: new Float32Array(b.list), count: b.list.length / 8 })));
};
const count = $('#count');
count.oninput = () => { count.nextElementSibling.textContent = count.value; plant(Number(count.value)); };
$('#quality').onchange = e => scatter.set({ quality: e.target.value });
$('#wind').oninput = e => scatter.set({ wind: { ...scatter.options.wind, strength: Number(e.target.value) } });
count.oninput();

let frames = 0, clock = 0;
demo.tick = dt => {
    frames++; clock += dt;
    if (clock < .5) return;
    $('#info').value = `${scatter.count} props · ${scatter.drawn} drawn · ${scatter.calls} calls · ${(frames / clock).toFixed(0)} fps`;
    frames = clock = 0;
};
demo.draw = camera => {
    renderer.begin(camera, [...renderer.light.fogColor.map(c => Math.pow(c, 1 / 2.2)), 1]);
    renderer.draw(ground, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    scatter.draw(camera, demo.time);
};
demo.look([30, 12, 40], [0, 2, 0]);
