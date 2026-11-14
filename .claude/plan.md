# Plan: weapons (branch `feature/weapon-assets`)

## Where we are
Phase A + B done, waiting for owner feedback (`packages/play/player` view `range`, `?guns=kar98k,svt-40@scope-3`; `packages/play/armory` view `armory`). Next: phase C (sounds, shells), see backlog "Playable character". Physics: always `@papit/rigidbody` (one shared `World`), shells now, gun toss (phase E) later; no own physics.

## Done
A. Weapons assets: 24 rifles + 3 scopes from `~/Developer/3d/store` (`tools/blender/packs/rifles.py`), `weapon.json` / `scope.json` points (`weapon-points.py`, check with `grid-shot.py`), meta (`tools/weapons/meta.mjs`), specs + calibers, `@polywar/armory` (loader, scope fit, `ArmedGun`, weapons-only view), gallery `focus` (header "show only"), catalog weapons under `models/weapons/armory`.
B. Aim: sight line rear `notch` -> `front` down the view middle (`Hold.front`), eye 12 cm behind the trigger, armory scopes (`<gun>@<scope>`), scope glass black from the start of the raise and the picture fading in (no pop in), Option / Alt toggles aim, Q / E lean.
