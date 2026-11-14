import '@polywar/viewport';
import { Renderer, Model } from '@polywar/renderer';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { GUNS, Gun } from '@polywar/weapons';
import { ViewModel, Scope, perspective, mat4 } from '@polywar/viewmodel';

const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const gl = demo.gl, renderer = new Renderer(demo.layer);

// a range to look at
const b = new MeshBuilder().plane('#6f8f4e', { scale: [400, 1, 800], at: [0, 0, -380] });
for (const d of [25, 50, 100, 200, 400]) b.box('#d8d0c0', { at: [0, 1, -d], scale: [1, 2, .1] }).box('#202020', { at: [0, 1.2, -d + .06], scale: [.3, .3, .02] });
const range = upload(gl, b.build()), identity = Matrix4.create();
demo.look([0, 1.6, 0], [0, 1.4, -50]);

/** a hold from the gun's bones (what @polywar/player does too) */
function holdOf(model, spec) {
    const bone = n => { const h = model.rig.armature.find(n).head; const m = model.skeletonMatrix; const p = [h.x, h.y, h.z]; return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; };
    const trigger = bone('trigger'), muzzle = bone('muzzle'), action = bone('action'), top = model.bounds.max[1];
    const kind = spec.kind;
    return {
        grip: [trigger[0], trigger[1] - .035, trigger[2] + .03], muzzle,
        fore: kind === 'pistol' ? undefined : [muzzle[0], muzzle[1] - .035, trigger[2] + (muzzle[2] - trigger[2]) * .45],
        sight: [0, top + .004, kind === 'pistol' ? trigger[2] + .02 : action[2]],
        hip: kind === 'pistol' ? [.17, -.19, -.42] : kind === 'smg' ? [.15, -.17, -.3] : [.14, -.16, -.26],
        eye: kind === 'pistol' ? .42 : kind === 'smg' ? .25 : .22,
        weight: kind === 'pistol' ? .7 : kind === 'smg' ? 1.1 : 1.4,
    };
}

let gun, model, hold, scope, scopeMesh;
const vm = new ViewModel({ grip: [0, 0, 0], muzzle: [0, 0, -1], sight: [0, 0, 0], hip: [.15, -.2, -.3], eye: .2 });
for (const [id, spec] of Object.entries(GUNS)) $('#pick').add(new Option(spec.name, id));
async function pick(id) {
    gun = new Gun(id);
    model = await Model.load(gl, `/assets/models/weapons/guns/${gun.spec.model}/model.glb`);
    hold = holdOf(model, gun.spec);
    scope?.destroy(); scope = scopeMesh = undefined;
    if (gun.spec.scope)
    {
        const top = model.bounds.max[1];
        scope = new Scope(demo.layer, { eyepiece: [0, top + .045, .12], length: .3, lens: .018 });
        scopeMesh = upload(gl, scope.mesh());
        hold = scope.hold(hold, demo.camera.fov);
    }
    vm.set(hold);
}
$('#pick').onchange = e => pick(e.target.value);
$('#fire').onclick = () => vm.fire(gun.recoil());
$('#pick').value = 'm1-garand';
await pick('m1-garand');

const near = mat4(), toCamera = mat4();
demo.tick = dt => {
    const aimed = +$('#aimed').value, reload = +$('#reload').value;
    gun.aimed = aimed;
    vm.update(dt, { yaw: +$('#turn').value * dt, pitch: 0, speed: +$('#speed').value, grounded: true, aimed, reload, sprint: $('#sprint').checked });
    if (scope) scope.zoom = +$('#zoom').value;
    const m = vm.muzzle;
    $('#info').value = `bore ${m.direction.map(v => v.toFixed(3)).join(' ')}`;
};
demo.draw = camera => {
    const sky = [.62, .72, .82, 1];
    renderer.begin(camera, sky);
    renderer.draw(range, identity);
    // the gun: own near plane, depth cleared so it never goes into walls
    const aspect = camera.width / camera.height;
    perspective(near, camera.fov, aspect, .01, 10);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const world = Matrix4.create(Array.from(vm.world(camera.worldMatrix)));
    renderer.begin({ viewMatrix: camera.viewMatrix, projectionMatrix: near, worldPosition: camera.worldPosition }, null);
    model.pose('idle', 0);
    model.draw(renderer, world);
    if (scopeMesh) renderer.draw(scopeMesh, world);
    if (scope && scope.coverage(vm.matrix, camera.projectionMatrix) > scope.threshold * 0 && +$('#aimed').value > .3)
    {
        const view = scope.begin(camera.worldMatrix, vm.matrix, camera.projectionMatrix);
        renderer.begin(view, sky);
        renderer.draw(range, identity);
        scope.end();
        renderer.reset();
        scope.overlay(vm.matrix, near, aspect);
    }
    renderer.reset();
};
