import '@polywar/3d-demo';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { Grid, Renderer } from '@polywar/renderer';

const demo = document.querySelector('pw-3d-demo');
await demo.ready;
const renderer = new Renderer(demo.layer);
renderer.light.toon = 3;
const grid = new Grid(demo.gl, 50, 1, 5);
const box = upload(demo.gl, new MeshBuilder().box([.8, .5, .3]).build());
const ball = upload(demo.gl, new MeshBuilder().sphere([.3, .6, .85], {}, 2).build());
const size = document.querySelector('#size');

demo.draw = camera => {
    renderer.begin(camera, demo.background);
    grid.draw(renderer);
    const k = Number(size.value);
    for (let i = -3; i <= 3; i++)
        renderer.draw(i % 2 ? box : ball, Matrix4.create().translate(i * 3, .5 * k, 0).scale(k, k, k).rotateY(demo.time + i));
};
