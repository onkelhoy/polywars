import '@polywar/3d-demo';
import { Grid, Model, Renderer } from '@polywar/renderer';
import { Skeleton } from '@polywar/skeleton';
import { RigGizmo } from '@polywar/rig-gizmo';

// the base character: mesh + bones like Blender, clips, IK on/off
const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const renderer = new Renderer(demo.layer), grid = new Grid(demo.gl, 4, .5);
const gizmo = new RigGizmo(demo.gl);
const model = await Model.load(demo.gl, '/assets/models/characters/base/model.glb', { skin: Skeleton.skin });
const skeleton = model.skin;
for (const a of model.animations) $('#clip').add(new Option(a.name, a.name));
$('#clip').value = 'walk';
$('#ik').onchange = e => skeleton.ikEnabled = e.target.checked;
$('#info').value = `${skeleton.armature.bones.length} bones, ${skeleton.deform.size} deform, ${skeleton.ik.size} IK`;

let time = 0;
demo.tick = dt => {
    const clip = model.animation($('#clip').value);
    if ($('#play').checked) time += dt;
    else if (clip) time = Number($('#time').value) * clip.duration;
    if (clip && $('#play').checked) $('#time').value = (time % clip.duration) / clip.duration;
    model.pose(clip, time);
};
demo.draw = camera => {
    renderer.begin(camera, demo.background);
    grid.draw(renderer);
    if ($('#mesh').checked) model.draw(renderer);
    if ($('#bones').checked) gizmo.draw(renderer, skeleton, model.skeletonMatrix, { inFront: $('#front').checked });
};
demo.look([2.2, 1.6, 2.6], [0, .9, 0]);
