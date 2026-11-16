import '@polywar/viewport';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer } from '@polywar/renderer';
import { SSAO } from '@polywar/ssao';

// the renderer's shapes with corners and gaps for the occlusion to find: a floor, walls, stairs, a crate stack
const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const gl = demo.gl, renderer = new Renderer(demo.layer), ao = new SSAO(demo.layer);
const box = color => upload(gl, new MeshBuilder().box(color, {}).build());
const unit = box([.75, .72, .66]), crate = box([.55, .4, .25]), ball = upload(gl, new MeshBuilder().sphere([.25, .55, .8], {}, 2).build());
const at = (x, y, z, sx, sy, sz) => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1];
const parts = [
    [unit, at(0, -.05, 0, 12, .1, 12)],
    [unit, at(-3, 1, -2, .3, 2, 4)],
    [unit, at(-1, 1, -4, 4, 2, .3)],
    ...[1, 2, 3, 4, 5].map(i => [unit, at(2.5, i * .125, -2 + i * .5, 2, i * .25, .5)]),
    [crate, at(-1, .4, 1, .8, .8, .8)], [crate, at(-.15, .4, 1.1, .8, .8, .8)], [crate, at(-.6, 1.2, 1.05, .8, .8, .8)],
    [ball, at(1, .5, 1.5, 1, 1, 1)],
];
demo.draw = camera => {
    const o = ao.options;
    o.debug = $('#debug').checked;
    for (const k of ['radius', 'strength', 'power', 'samples', 'scale']) o[k] = Number($('#' + k).value);
    const on = $('#on').checked;
    if (on) ao.begin();
    renderer.begin(camera, demo.background);
    for (const [mesh, matrix] of parts) renderer.draw(mesh, matrix);
    if (on) ao.end(camera);
};
demo.look([6, 5, 7], [0, .7, 0]);
