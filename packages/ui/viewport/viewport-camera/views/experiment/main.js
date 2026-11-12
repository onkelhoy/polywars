import '@polywar/viewport';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer } from '@polywar/renderer';

// the controllers in pw-viewport: a field of boxes to move around in
const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const renderer = new Renderer(demo.layer);
const box = upload(demo.gl, new MeshBuilder().box([.6, .65, .7], {}).build());
const boxes = [];
for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) boxes.push([i * 4, (Math.sin(i * 1.3 + j) + 1.5) * 1.5, j * 4]);
$('#pan').onchange = () => demo.pan = $('#pan').value;
demo.draw = camera => {
    renderer.begin(camera, demo.background);
    for (const [x, h, z] of boxes) renderer.draw(box, [1, 0, 0, 0, 0, h, 0, 0, 0, 0, 1, 0, x, h / 2, z, 1]);
};
demo.look([20, 15, 25], [0, 0, 0]);
