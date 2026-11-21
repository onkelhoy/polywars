import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { Smoke } from '@polywar/smoke';
import { Clouds } from '@polywar/smoke';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const renderer = new Renderer(demo.layer), smoke = new Smoke(demo.layer), clouds = new Clouds(smoke);
const SKY = [.55, .72, .88, 1];
const mesh = upload(demo.gl, new MeshBuilder().plane('#7d9a55', { scale: [8000, 1, 8000] }).build()), identity = Matrix4.create();

const build = () => {
    smoke.clear();
    const kind = $('#cloud').value, cover = +$('#cover').value;
    if (kind === 'sky') return clouds.sky([0, 0, 0], { count: 14, cover, near: 1400, far: 3200 });
    clouds.cloud([-300, 230, -1900], 380, { kind, density: cover, lean: .5 });
    clouds.cloud([900, 250, -2500], 300, { kind, density: cover, lean: -.4 });
    clouds.cloud([-1500, 220, -2200], 260, { kind, density: cover });
};
build();
$('#cloud').onchange = $('#cover').onchange = $('#again').onclick = build;
demo.look([-55, 6, 80], [0, 60, -200]);
demo.tick = dt => {
    smoke.look.wind = [+$('#wind').value, 0, 0];
    const a = +$('#sun').value * Math.PI / 180;
    smoke.look.sun = [Math.cos(a) * .5, .8, Math.sin(a) * .5];
    smoke.update(dt);
};
demo.draw = camera => {
    renderer.begin(camera, SKY);
    renderer.draw(mesh, identity);
    smoke.draw(camera);
    renderer.reset();
};
