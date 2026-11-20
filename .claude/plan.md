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
Look (pass 3): low poly. Puffs = flat shaded icosahedrons (20 or 80 faces), toon band per face (white top, body, cool shade), slow spin, no outlines. Filler = low poly 6 sided tubes from each puff to its parent (burst: nearest earlier puff, emitter: the one before) while close; ends stay lone balls. Motion: curl noise (Bridson) at puff scale growing with age, vortex roll on explosion caps, wind drag grows with age / height, shrink out.
1-3. Done: `@polywar/smoke` (packages/play/smoke): `burst`, `emitter`, `spawn`; `look` live (sun, wind, shade, highlight, detail, thickness, reach, swirl); presets `explosion` (flat base, stem, cap ~50 m, spikes), `blast`, `campfire`, `exhaust`, `dust`, `puff`; view `views/experiment`.
4. Jeep dust uses it.
Clouds: `smoke.cloud(at, size, { kind, density, height, lean })`: skeleton masses per kind, a core + round 80 face lobes on each mass's upper outer surface, flat bottom line, no sheet, no spin, no tubes. Soft facet ramp white -> `look.skyShade` (blends lobes into one body). Marching cubes mesh tried: owner rejected (giant blobs). `smoke.sky(at, { count, cover })` scatters a mix. Explosion work moved to backlog (own package).
Later: fog on far smoke / clouds, weather package drives `sky` cover with noise.
