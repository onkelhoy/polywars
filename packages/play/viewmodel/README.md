# @polywar/viewmodel

What's held in first person, in camera space (eye at 0, -z ahead): hip (bore at the middle `converge` ahead) to aimed (sight on the eye line), springs for the lag behind turns and steps, stride bob, breathing, strafe lean, landing dip, shot kick (+ the view's own kick), reload dip, sprint carry. No model, no input: the host draws its model at `world(camera.worldMatrix)`.

```ts
const vm = new ViewModel(hold);          // Hold: grip, fore?, muzzle, sight, hip, eye, weight?, converge? (item space / camera space)
vm.update(dt, { yaw, pitch, speed, strafe, grounded, landed, aimed, reload, sprint, shake });
vm.fire(gun.recoil());                   // kick
vm.matrix;                               // item -> camera
vm.muzzle;                               // { from, direction } camera space: fire from here
vm.hands;                                // { grip, fore } camera space: IK targets for arms
vm.view;                                 // [pitch, yaw] the view's own recoil this frame
```

`Scope(layer, { eyepiece, length, lens })`: `hold(hold, fov)` (the eye behind the eyepiece), `begin(cameraWorld, vm.matrix, projection)` -> a view to draw the scene with magnified (`zoom`), `end()`, `overlay(vm.matrix, projection, aspect)`: the glass with the scope shadow (the pupil shifts when the eye isn't on the axis: still = clear), duplex reticle. `mesh()`: a low poly scope.
Helpers: `Spring`, `compose`, `multiply`, `point`, `perspective`, `invertRigid`.

View `experiment`: a gun held over a range: aimed, speed, turn, reload, sprint, fire, scope zoom.
