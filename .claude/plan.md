# Plan

## Where we are
On `feature/smoke`: smoke 1-3 built, needs look. Next: smoke 4 (jeep dust). Then jeep 7 (gun on the passenger seat, `.claude/plan.jeep.md`). Open: arms-grip 5 (grab animation: owner designs).

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

## Smoke (confirmed, `feature/smoke`)
Look (pass 2): puffs are soft blobs summed into a half res field, cut at a threshold: merged shape with filler, lone puffs stay balls, stretched along speed + wind. Toon bands from the merged normal (white highlight, body, cool shade), no outlines, depth from the field. Dissolve: wind drag grows with age / height, swirl grows (roll in), shrink pinches the shape into balls.
1-3. Done: `@polywar/smoke` (packages/play/smoke): `burst`, `emitter`, `spawn`; `look` live (sun, wind, shade, highlight, threshold, resolution); presets `explosion` (flat base, stem, cap ~50 m, spikes), `blast`, `campfire`, `exhaust`, `dust`, `puff`; view `views/experiment`.
4. Jeep dust uses it.
Later: clouds (redo on the field), shockwave ring, low-poly switch, fog on far smoke, field edge bumpiness / shading banding at half res.
