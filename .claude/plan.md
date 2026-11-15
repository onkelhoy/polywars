# Plan: weapons (branch `feature/weapon-assets`)

## Where we are
Branch `feature/ssao` (has pistol sound + eject fix, SSAO in viewport + both range views, `AimTuner` T panel in `@polywar/player`). Next: gun handling tasks below, in order, one line status each. Owner checks in the shooting range view.

## Tasks (confirmed)
1. Arms toggle: "show arms" checkbox in both range menus (`player` + `shooting-range` views), kept in localStorage; player skips `Arms.draw` when off.
3. Sway (`viewmodel/src/viewmodel.ts`): aimed, the gun turns round the rear sight (pivot already `h.sight`) and the eye/rear line stays put: translation sway (`ox`/`oy` breath, `shift` from turning) fades out with `aimed`, angular sway stays, so the front sight drifts, not the near one. Sway grows with move speed, settles over ~1-2 s standing still.
4. Recoil: a shot = gun snaps back toward the player (z) + muzzle up, turning round a point under the bore (grip / shoulder), not the sight; fast attack (~30 ms), damped return. Strength from caliber energy / gun weight. `control` 0..1 factor (fatigue later) scales how much is held back.
5. Elbow lag: elbows (IK pole in `player/src/arms.ts`) trail the hands a little when looking round (from the viewmodel turn springs).

## Done
A. Weapons assets: 24 rifles + 3 scopes from `~/Developer/3d/store` (`tools/blender/packs/rifles.py`), `weapon.json` / `scope.json` points (`weapon-points.py`, check with `grid-shot.py`), meta (`tools/weapons/meta.mjs`), specs + calibers, `@polywar/armory` (loader, scope fit, `ArmedGun`, weapons-only view), gallery `focus` (header "show only"), catalog weapons under `models/weapons/armory`.
B. Aim: sight line rear `notch` -> `front` down the view middle (`Hold.front`), eye 12 cm behind the trigger, armory scopes (`<gun>@<scope>`), scope glass black from the start of the raise and the picture fading in (no pop in), Option / Alt toggles aim, Q / E lean.
C. Gun feel: `@polywar/sfx-gen` (synth, `npm run sfx` -> `assets/audio/effects/weapons/<model>/` + `brass/`, `sounds.json`, a set with one is kept), `Gun` cues per action (`oncue`: shot, dry, eject, bolt, magazine, rounds, slide; `spec.cues` for the garand clip), `@polywar/weapon-audio` (scene by rays, variant + pitch, late by distance, `@papit/audio` 3D), `@polywar/debris` (cases as `@papit/rigidbody` bodies, ground tiles, land once, settle out of the world, cap + fade), player `feel.ts` glue, range targets as static bodies. `@polywar/spatial` dropped (rigidbody has a broad phase and `overlap`). `tools/smoke.mjs` loads a view headless.
Range: every gun, aim tuning panel (`T`) -> weapon.json `aim` / `aim@<scope>` via `npm run aim` (`tools/weapons/aim.mjs`), `Hold.aim` in viewmodel.
Aimed shots follow the drawn sights (+ zero slider). New guns: MP40, MP28, Sterling, Ithaca 37 (pump, 9 pellets), Lahti L-39 (20 mm, sights 4.7 cm left, hand set); `rifles.py` reads `store/Weapons`, flip `r` for side magazines.
