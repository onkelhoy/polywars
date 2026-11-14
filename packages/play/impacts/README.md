# @polywar/impacts

What bullets leave behind, drawn unlit in one pass after the scene: tracer streaks, bits and dust off a hit (only within `far` of the camera), marks on the surface, muzzle flashes and smoke.

```ts
const impacts = new Impacts(layer, { far: 150, marks: 600 });
bullets.onhit = (b, hit) => impacts.hit(hit.point, hit.normal, hit.surface, b.direction);
impacts.flash(muzzle, direction);
// each frame
impacts.update(dt);
impacts.tracers(bullets.list.filter(b => b.tracer));
impacts.draw(camera); renderer.reset();
```

`SURFACES`: looks per surface (`ground`, `wood`, `metal` sparks, `stone`, `flesh`, `water`, `default`); pass `surfaces` to add or change. `clear()` drops all.
View `experiment`: a gun firing on its own at ground, wood, steel, stone and a body.
