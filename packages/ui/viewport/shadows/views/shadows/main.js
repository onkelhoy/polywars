import '@polywar/viewport';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer } from '@polywar/renderer';
import { Shadows } from '@polywar/shadows';

// toon sun shadows through the renderer: boxes and poles on a floor, the sun turning round
const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const renderer = new Renderer(demo.layer), gl = demo.gl;
let shadows, size = 0;
const floor = upload(gl, new MeshBuilder().box([.35, .55, .28], {}).build());
const box = upload(gl, new MeshBuilder().box([.75, .6, .45], {}).build());
const at = (x, y, z, sx, sy, sz) => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1];
const things = [];
for (let i = 0; i < 40; i++)
{
    const a = i * 2.39, r = 3 + i * .9, h = 1 + (i * 7 % 5);
    things.push(at(Math.cos(a) * r, h / 2, Math.sin(a) * r, i % 3 ? 1.2 : .3, h, i % 3 ? 1.2 : .3));
}
const scene = () => {
    renderer.draw(floor, at(0, -.5, 0, 200, 1, 200));
    for (const m of things) renderer.draw(box, m);
};
demo.draw = camera => {
    const s = 2 ** Number($('#size').value);
    if (s !== size) { shadows?.destroy(); shadows = new Shadows(gl, { size: s }); size = s; renderer.light.shadow = shadows; }
    shadows.radius = [Number($('#near').value), Number($('#far').value)];
    const fade = Number($('#fade').value);
    shadows.fade = [fade * .45, fade];
    shadows.strength = Number($('#strength').value);
    const a = Number($('#sun').value), l = renderer.light;
    l.sunDirection = [Math.cos(a) * .6, .7, Math.sin(a) * .6];
    l.toon = Number($('#toon').value);
    $('#values').value = `${s}² · ${shadows.texels.map(t => (t * 100).toFixed(1)).join(' / ')} cm per texel`;
    shadows.cast(camera, l.sunDirection, view => { renderer.begin(view, null); scene(); renderer.reset(); });
    renderer.begin(camera, demo.background);
    scene();
};
demo.look([18, 12, 22], [0, 1, 0]);
