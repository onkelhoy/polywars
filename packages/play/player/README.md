# @polywar/player

A playable character in first person, tying the play packages together: `@polywar/mover` (feet), `@polywar/weapons` (guns), `@polywar/viewmodel` (held gun, sway, scope), `@polywar/ballistics` (bullets), `@polywar/impacts` (tracers, hits, marks), `@polywar/characters` (body under the view).

```js
const player = new Player(layer, renderer, {
    ground, colliders, cast,                     // the world: feet, bullets
    scene: view => drawWorld(view),              // drawn again for the scope's picture
    worldDrawn: () => demo.endOcclusion(),       // after the world, before the hands (SSAO stops here)
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

Gun feel (`player.feel`, `feel.ts`): each gun's cues (`Gun.oncue`) become sounds (`@polywar/weapon-audio`, the shot by the scene round the shooter, parts at the gun) and cases thrown from weapon.json `eject` (`@polywar/debris`) into a `@papit/rigidbody` world: the setting's `world` (the host steps it) or the player's own. `mixer` (an `@papit/audio` `AudioMixer`) and `surface(at)` (what a case landed on: `dirt`, `stone`, `wood`, `metal`) are optional.

Aim tuning: `Hold.aim` (`@polywar/viewmodel`) moves / turns the aimed pose on top of the sight line; weapon.json `aim` (iron sights) or `aim@<scope>` (`{ offset: [x, y, z] m, angle: [pitch, yaw, roll] deg }`) is read on load (`aimOf`). `new AimTuner(player, document.body, { active })` is the T panel (sliders, kept in the browser, export for `npm run aim`); call `tuner.update()` each frame.

View `range`: every gun (`?guns=` for a list), 1-9 / `[` `]` / wheel switch, `T` the aim tuning panel (sliders on the held gun, kept in the browser, "export all" -> `npm run aim -- ~/Downloads/aim.json` writes weapon.json).  a shooting range: targets at 25 - 400 m (steel, wood, dummies), a cone too steep to climb, a ridge, a road, crates; gun picker, hit marker, ammo, spread crosshair.
