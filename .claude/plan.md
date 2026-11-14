# Plan: weapons (branch `feature/weapon-assets`)

## Where we are
Phase A + B + C done, waiting for owner feedback (listen in `packages/utils/sfx-gen` view `sounds`, `packages/play/weapon-audio` view `scenes`, shells in `packages/play/debris` view `shells`, all of it in `player` view `range`). Next: phase D (body), see backlog "Playable character". Physics: always `@papit/rigidbody` (one shared `World`), shells now, gun toss (phase E) later; no own physics.

## Done
A. Weapons assets: 24 rifles + 3 scopes from `~/Developer/3d/store` (`tools/blender/packs/rifles.py`), `weapon.json` / `scope.json` points (`weapon-points.py`, check with `grid-shot.py`), meta (`tools/weapons/meta.mjs`), specs + calibers, `@polywar/armory` (loader, scope fit, `ArmedGun`, weapons-only view), gallery `focus` (header "show only"), catalog weapons under `models/weapons/armory`.
B. Aim: sight line rear `notch` -> `front` down the view middle (`Hold.front`), eye 12 cm behind the trigger, armory scopes (`<gun>@<scope>`), scope glass black from the start of the raise and the picture fading in (no pop in), Option / Alt toggles aim, Q / E lean.
C. Gun feel: `@polywar/sfx-gen` (synth, `npm run sfx` -> `assets/audio/effects/weapons/<model>/` + `brass/`, `sounds.json`, a set with one is kept), `Gun` cues per action (`oncue`: shot, dry, eject, bolt, magazine, rounds, slide; `spec.cues` for the garand clip), `@polywar/weapon-audio` (scene by rays, variant + pitch, late by distance, `@papit/audio` 3D), `@polywar/debris` (cases as `@papit/rigidbody` bodies, ground tiles, land once, settle out of the world, cap + fade), player `feel.ts` glue, range targets as static bodies. `@polywar/spatial` dropped (rigidbody has a broad phase and `overlap`). `tools/smoke.mjs` loads a view headless.
Range: every gun, aim tuning panel (`T`) -> weapon.json `aim` / `aim@<scope>` via `npm run aim` (`tools/weapons/aim.mjs`), `Hold.aim` in viewmodel.
Aimed shots follow the drawn sights (+ zero slider). New guns: MP40, MP28, Sterling, Ithaca 37 (pump, 9 pellets), Lahti L-39 (20 mm, sights 4.7 cm left, hand set); `rifles.py` reads `store/Weapons`, flip `r` for side magazines.
