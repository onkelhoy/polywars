# @polywar/player

A playable character in first person, tying the play packages together: `@polywar/mover` (feet), `@polywar/weapons` (guns), `@polywar/viewmodel` (held gun, sway, scope), `@polywar/ballistics` (bullets), `@polywar/impacts` (tracers, hits, marks), `@polywar/characters` (body under the view).

```js
const player = new Player(layer, renderer, {
    ground, colliders, cast,                     // the world: feet, bullets
    scene: view => drawWorld(view),              // drawn again for the scope's picture
    character: "/assets/models/characters/knight/character.json",
    guns: ["m1911", "stg-44", "m1-garand-scoped"],
}, { hit: (bullet, hit) => {}, exit: () => {} }, [x, y, z]);
await player.ready;
layer.camera = new Camera({ near: .1, far: 3000, controllers: [player.controller] });
// each frame, after the world (same renderer.begin)
player.draw(camera);
```

Keys: WASD walk, shift run, space jump, left mouse fire, right mouse aim, R reload, 1-9 / wheel guns (wheel zooms a scope while aimed), Esc lets go.
Parts: `holdOf(model, spec)` (a hold from the gun's bones: grip under the trigger, fore end, front sight tip on the view's middle), `scopeMountOf`, `Arms` (first person arms, two bone IK to the hands), `Input` (pointer lock, keys, buttons, wheel).

View `range`: a shooting range: targets at 25 - 400 m (steel, wood, dummies), a cone too steep to climb, a ridge, a road, crates; gun picker, hit marker, ammo, spread crosshair.
