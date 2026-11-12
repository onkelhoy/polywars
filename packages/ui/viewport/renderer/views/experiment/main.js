import '@polywar/viewport';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Grid, Renderer } from '@polywar/renderer';

// the renderer alone: a few lit shapes on the grid, a lamp circling them
const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const renderer = new Renderer(demo.layer), grid = new Grid(demo.gl, 10);
const shapes = [
    [upload(demo.gl, new MeshBuilder().box([.8, .3, .2], {}).build()), [-2.5, .5, 0]],
    [upload(demo.gl, new MeshBuilder().sphere([.25, .55, .8], {}, 2).build()), [0, 1, 0]],
    [upload(demo.gl, new MeshBuilder().box([.4, .7, .3], {}).build()), [2.5, .5, 0]],
];
const bulb = upload(demo.gl, new MeshBuilder().sphere([1, .85, .6], {}, 1).build());
demo.draw = camera => {
    const l = renderer.light, t = demo.time;
    l.toon = Number($('#toon').value);
    l.lampStrength = Number($('#lamp').value);
    l.lampPosition = [Math.cos(t) * 2, 1.2, Math.sin(t) * 2];
    renderer.begin(camera, demo.background);
    grid.draw(renderer);
    for (const [mesh, [x, y, z]] of shapes) renderer.draw(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
    renderer.draw(bulb, [.08, 0, 0, 0, 0, .08, 0, 0, 0, 0, .08, 0, ...l.lampPosition, 1], { unlit: true });
};
demo.look([5, 4, 7], [0, .7, 0]);
