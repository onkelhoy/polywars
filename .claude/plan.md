# Plan

## Where we are
Everything is on `main`. On `feature/gun-drop`: A (gun drop / swap) built, needs check. FX fixes built, needs check. Next: B smoke (`@polywar/smoke`, then jeep dust). Open: arms-grip 5 (grab animation: owner designs).

## Needs in-game check (owner)
Range rework (`feature/range` tasks: ditch, targets per board, markers, props, movable lane targets, binoculars / fixed scopes, scope on any gun), gun obstruction, arms-grip 4 / 4b (brace hand on walls / rails, aim at a wall backs off), jeep 1-8 (7: gun on passenger seat, hand reach), lights + glow, doors, jeep crash fix (`fleet.cast` skips a chassis the ray starts inside), optics 1-6, grass on the range (falloff, no SSAO on tufts, grass in the gun scope).

Optics notes (rough first pass):
- `Focus` (`@polywar/viewmodel`): `player.focus.start({ eye, look })` / `stop()`.
- Gun put down before an optic: `player.putDown()` / `pickUp()` (F bends to it) / `down`. Straight fall, laid on its side.
- Spotting scope: F eases the eye to the eyepiece (.7 s), view blends in. Binoculars: G raises the desk model (`player.binocularsAt`), view blends in.
- Steel targets from 200 m (`STEEL_FROM` in shooting-range.ts), metal sparks seen to 900 m.
- Grass: `falloff` quality setting; range look = `assets/grass/range.json` (saved from the grass view; 120 m, falloff 3).

## Tasks (confirmed, `feature/arms-grip`)
Done: 1-4b (body arms on the rig's IK + grip, 3 store soldiers, rig resync (`characters/base/model.blend` authoring rig, `export.py --bake`, runtime IK via `Skeleton.addIK`, soldiers fitted by `lib/base_rig.py`, brace hand, aim at a wall).
5. Backlog: papit math cleanup (play), drop box arms, mag / bullet grab, pockets, first shot flyer.

## Gun drop / swap (`feature/gun-drop`, built, needs check)
- Loose guns are `@polywar/debris` pieces in the feel's world (every range box is in it): `player.loose`, `down` = the held one out of hands.
- G `drop(camera)`: looked at top (1.8 m) -> laid on it, wall -> leant (butt on ground, muzzle up, 12 deg), else thrown.
- F `pickUp()`: nearest loose gun; a held one is put down first (swap), bend + hand to grip, take.
- Not done: stand guns still instant (select); no lean stability tuning.

## FX fixes (`feature/fx-fixes`, off gun-drop, built, needs check)
1. Depth: range camera near .1 -> .25 (seat .2). If lanes still flicker far out: try SSAO off (AO at distance), then reversed-Z.
2. Smoke / impacts drawn after the grass tufts (and after SSAO).
3. Marks ride on what they hit: `Hit.carrier` (cars set it), `Impacts` keeps them in its space. Lane targets keep `shift`.
4. Sound scene: 16 rays at the muzzle + .9 m higher, a wall must block both; indoor needs a roof (2 of 3 up rays).
5. `@polywar/fog` (materials/fog): distance + height fog in renderer, grass, terrain, water. Range: density .0009, falloff .015, base 0 (`renderer.light.fog*` live). View `views/fog`.
7. `@polywar/shadows` (viewport/shadows): 512² map, 45 m round the player, strength .5, nearest = blocky. Renderer, grass, terrain receive; range model, stands, cars cast (grass doesn't). `shadows.*` live. View `views/shadows`.
Skipped: 6 ground map (RGB paint map for grass density / height / fog), backlog.

## B. Smoke (confirmed, next)
1. `@polywar/smoke`: low poly puffs (icosahedrons, flat / toon), grow, rise, drift, shrink out; one instanced draw; config; view.
2. Jeep dust uses it.
