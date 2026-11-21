import '@polywar/viewport';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer } from '@polywar/renderer';

// @polywar/fog through the renderer: a valley floor, pillars every 100 m out to 2 km, a hill and a tower
const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const renderer = new Renderer(demo.layer), gl = demo.gl;
const SKY = [.62, .72, .84];
renderer.light.fogColor = SKY;
const floor = upload(gl, new MeshBuilder().box([.3, .55, .25], {}).build());
const pillar = upload(gl, new MeshBuilder().box([.7, .65, .55], {}).build());
const at = (x, y, z, sx, sy, sz) => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1];
demo.draw = camera => {
    const l = renderer.light;
    l.fogDensity = Number($('#density').value);
    l.fogFalloff = Number($('#falloff').value);
    l.fogBase = Number($('#base').value);
    $('#values').value = `density ${l.fogDensity} · falloff ${l.fogFalloff} · base ${l.fogBase}`;
    renderer.begin(camera, [...SKY, 1]);
    renderer.draw(floor, at(0, -1, -1000, 4000, 2, 4000));
    for (let d = 100; d <= 2000; d += 100) for (const x of [-30, 30]) renderer.draw(pillar, at(x, 10, -d, 6, 20, 6));
    renderer.draw(floor, at(-300, 40, -900, 300, 80, 200));
    renderer.draw(pillar, at(200, 75, -700, 15, 150, 15));
};
demo.look([0, 6, 20], [0, 4, -100]);
