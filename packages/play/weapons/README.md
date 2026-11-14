# @polywar/weapons

Guns as data + one gun's state. No drawing, no input, no bullets (those are `@polywar/ballistics`).

- `GUNS`: every gun in `assets/models/weapons/guns/` by folder (+ `m1-garand-scoped`): magazine, semi / auto, interval, reload times, zero, spread (`hip`, `aimed`, `moving`, `bloom`, `settle`), recoil (`kick`, `climb`, `side`), `raise`, `scope`.
- `CALIBERS`: muzzle speed, drag, life, ammo model folder.
- `Gun`: `trigger(held)` -> `"shot" | "empty" | "reload"`, `aim(held)` (eases `aimed` 0..1 over `raise`), `reload()`, `update(dt)` -> `"reloaded"`, `spread(moving)`, `scatter(moving)` (a random [yaw, pitch] in the cone, blooms), `recoil()`, `progress`, `emptyReload` (pick the `reload-empty` clip), `sinceShot`.

```ts
const gun = new Gun("stg-44");
gun.aim(rightMouse);
if (gun.trigger(leftMouse) === "shot") { const [yaw, pitch] = gun.scatter(speed / 4.5); /* fire along the view turned by them */ }
gun.update(dt);
```

View `experiment`: pick a gun, hold fire, aimed / moving, hits at 50 m.
