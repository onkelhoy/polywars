# Plan

## Where we are
On `feature/grenade` (off `feature/explosion`): grenades in the training camp (rough), need look. Next: owner tries grenades. Then smoke 4 (jeep dust). Then jeep 7 (gun on the passenger seat, `.claude/plan.jeep.md`). Open: arms-grip 5 (grab animation: owner designs).
Everything is on `main`. On `feature/gun-drop`: A (gun drop / swap) built, needs check. FX fixes built, needs check. Next: B smoke (`@polywar/smoke`, then jeep dust). Open: arms-grip 5 (grab animation: owner designs).

## Needs in-game check (owner)
Range rework (`feature/range` tasks: ditch, targets per board, markers, props, movable lane targets, binoculars / fixed scopes, scope on any gun), gun obstruction, arms-grip 4 / 4b (brace hand on walls / rails, aim at a wall backs off), jeep 1-8 (7: gun on passenger seat, hand reach), lights + glow, doors, jeep crash fix (`fleet.cast` skips a chassis the ray starts inside), optics 1-6, grass on the range (falloff, no SSAO on tufts, grass in the gun scope).

Optics notes (rough first pass):
- `Focus` (`@polywar/viewmodel`): `player.focus.start({ eye, look })` / `stop()`.
- Gun put down before an optic: `player.putDown()` / `pickUp()` (F bends to it) / `down`. Straight fall, laid on its side.
- Spotting scope: F eases the eye to the eyepiece (.7 s), view blends in. Binoculars: G raises the desk model (`player.binocularsAt`), view blends in.
- Steel targets from 200 m (`STEEL_FROM` in training-camp.ts), metal sparks seen to 900 m.
- Grass: `falloff` quality setting; range look = `assets/grass/range.json` (saved from the grass view; 120 m, falloff 3).

## Tasks (confirmed, `feature/arms-grip`)
Done: 1-4b (body arms on the rig's IK + grip, 3 store soldiers, rig resync (`characters/base/model.blend` authoring rig, `export.py --bake`, runtime IK via `Skeleton.addIK`, soldiers fitted by `lib/base_rig.py`, brace hand, aim at a wall).
5. Backlog: papit math cleanup (play), drop box arms, mag / bullet grab, pockets, first shot flyer.

## Smoke (confirmed, `feature/smoke`)
Look (pass 3): low poly. Puffs = flat shaded icosahedrons (20 or 80 faces), toon band per face (white top, body, cool shade), slow spin, no outlines. Filler = low poly 6 sided tubes from each puff to its parent (burst: nearest earlier puff, emitter: the one before) while close; ends stay lone balls. Motion: curl noise (Bridson) at puff scale growing with age, vortex roll on explosion caps, wind drag grows with age / height, shrink out.
1-3. Done: `@polywar/smoke` (packages/play/smoke): `burst`, `emitter`, `spawn`; `look` live (sun, wind, shade, highlight, detail, thickness, reach, swirl); presets `explosion` (flat base, stem, cap ~50 m, spikes), `blast`, `campfire`, `exhaust`, `dust`, `puff`; view `views/experiment`.
4. Jeep dust uses it.
Clouds: `smoke.cloud(at, size, { kind, density, height, lean })`: skeleton masses per kind, a core + few big overlapping 20 face lobes on each mass's upper surface, lit with the normal leaned to their mass centre (one body), flat bottom line, no sheet, no spin, no tubes. Soft facet ramp white -> `look.skyShade` (blends lobes into one body). Marching cubes mesh tried: owner rejected (giant blobs). `smoke.sky(at, { count, cover })` scatters a mix. Explosion work moved to backlog (own package).
Later: fog on far smoke / clouds, weather package drives `sky` cover with noise.

## Grenade (confirmed, `feature/grenade`)
Shooting range renamed: `@polywar/training-camp` (view `camp`, `tools/blender/packs/training-camp.py`).
Done, needs look: `Grenade` + `GRENADES` (frag, stick) in `@polywar/weapons` (pull, throw by hold, fuse, own ball flight: bounce off ground + boxes, roll, `onexplode` / `onbounce`, `Grenade.arc` preview). Camp glue `views/camp/grenades.js`: crates by the pit (one kind each: frag, stick; F takes 4), quick throw: hold G = gun dips into the off hand (`viewmodel.offhand`, `player.busyHand`: trigger hand to the grenade), wind up (arc dots), let go = throw (fuse starts on release), hand back on the grip (.4 s), right click = pin back. Throws the first kind you have. (`player.stowed`: gun put away, unused now); explosion + smoke + force + sound + daze + knockdown (`knockGun` from .5). Pit at x 25 z 38: sandbag ring, crates + dummies (own rigidbody world), Shift+G resets them.
Later: owner's grenade boxes in the .blend (kind per box),  grenade glb (owner), throw animation / hand model, bounce sound, grenade slot / count, damage.

## Explosion (confirmed, `feature/explosion`)
Feel: sharp, crisp, fast, scary; low poly; power (kg TNT) drives everything. All in `@polywar/explosion` (look, force, sound, daze); clouds split to `@polywar/clouds`.
Done, needs look: flash, fireball, white spikes, shock shell (smooth edge line ground/top + light bend), solid ground ring, kicked dust, swirling surge (clean ring, tumbles in), suck back (middle only), mushroom, rock + trails, dark grit lines, scorch marks (`onmark` -> `grass.clear`), smoke eaten by noise + dithered fade. Force: `BlastForce` + `bodyTargets` / `worldCover`. Sound: `ExplosionAudio` (near/far/distant), `stun` (silence -> live ring in -> world back muffled). `Daze` (smear), `shellShock(kPa)` 15..70. Walk: `lookScale`, `lookSpring`, `moveScale`; mover push staggers. View `experiment` has it all + play (P).
Knockdown (built, needs look): `Knockdown` (limp fall the push's way, eyes shut on the thud, slow blinks + drifting view, hands on the ground, push up), `Daze.blink` lids, `Target.lift` / `cap` (+ `hit.over`), walker `pose`, player `setting.pose` + `knockGun` + hands IK. View sliders: push cap, lift, knock from.
Next: wire explosions into the game (player hit -> daze, stun, knockdown, `knockGun`).
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
7. `@polywar/shadows` (viewport/shadows): 2 levels, 1024² each: near 12 m (2.3 cm texels), far 45 m (redrawn every 2nd frame), faded out 20 -> 45 m, strength .45. Renderer, grass, terrain receive; range model, stands, cars cast (grass doesn't). `shadows.*` live. View `views/shadows`.
8. Parked cars hold every wheel (`DriveInput.parked`, idle input), a bump no longer rolls them.
9. Jeep glass (`Window` node) drawn last, after the grass tufts (`Model.draw(.., parts)` only / skip): grass shows through it.
Skipped: 6 ground map (RGB paint map for grass density / height / fog), backlog.

## B. Smoke (confirmed, next)
1. `@polywar/smoke`: low poly puffs (icosahedrons, flat / toon), grow, rise, drift, shrink out; one instanced draw; config; view.
2. Jeep dust uses it.
