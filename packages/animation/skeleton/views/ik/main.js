import '@polywar/3d-demo';
import { Grid, Model, Renderer } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Skeleton, RigGizmo } from '@polywar/skeleton';

const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const renderer = new Renderer(demo.layer), grid = new Grid(demo.gl, 4, .5);
const gizmo = new RigGizmo(demo.gl);
const box = upload(demo.gl, new MeshBuilder().box([.5, .45, .4], {}).build());
const model = await Model.load(demo.gl, '/assets/models/characters/base/model.glb', { skin: Skeleton.skin });
const skeleton = model.skin;
window.skeleton = skeleton; // for the console
for (const a of model.animations) $('#clip').add(new Option(a.name, a.name));
$('#clip').value = 'idle';
$('#ik').onchange = e => skeleton.ikEnabled = e.target.checked;

const footL = skeleton.armature.find('foot.ik.L'), handR = skeleton.armature.find('hand.ik.R');
let time = 0;
demo.tick = dt => {
    time += dt;
    model.pose(model.animation($('#clip').value), time);
    // after the clip: lift the left foot, put both feet on a step, reach with the right hand (armature space, y up)
    const step = Number($('#step').value);
    footL.moveTo([footL.head[0], footL.head[1] + Number($('#foot').value) + step, footL.head[2]]);
    skeleton.setIK('forearm.R', Number($('#hand').value));
    handR.moveTo([-.2 + .1 * Math.sin(time * 2), 1.3 + .12 * Math.cos(time * 2), .35]);
    skeleton.update();
};
demo.draw = camera => {
    renderer.begin(camera, demo.background);
    grid.draw(renderer);
    const step = Number($('#step').value);
    // the step under the left foot
    if (step > 0) renderer.draw(box, [.3, 0, 0, 0, 0, step, 0, 0, 0, 0, .5, 0, .1, step / 2, 0, 1]);
    model.draw(renderer);
    gizmo.draw(renderer, skeleton, model.skeletonMatrix);
};
demo.look([2.2, 1.6, 2.6], [0, .9, 0]);
