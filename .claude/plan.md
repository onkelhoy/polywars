# Plan

## Where we are
Everything is on `main` (smoke, explosion, knockdown, grenades, camp upgrade, gun drop, fx fixes). Smoke 4 done, jeep 7 was already done. Open: arms-grip 5 (grab animation: owner designs).

## Needs in-game check (owner)
- Camp: range rework (ditch, targets per board, markers, props, movable lane targets, binoculars / fixed scopes, scope on any gun), gun obstruction, lights + glow, doors, grass (falloff, no SSAO on tufts, grass in the scope), optics 1-6.
- Jeep dust now via `@polywar/smoke` (grenades' `nades.smoke`, one puff per Dust emit).
- Arms-grip 4 / 4b (brace hand on walls / rails, aim at a wall backs off). Jeep 1-8, jeep crash fix.
- Gun drop / swap: G `drop` (lay on a top, lean on a wall, else throw), F `pickUp` (swap). Stand guns still instant.
- FX fixes: camera near .25, smoke after tufts, marks ride on what they hit (`Hit.carrier`), muzzle sound scene rays, `@polywar/fog`, `@polywar/shadows`, parked cars hold, jeep glass last.
- Explosion (`@polywar/explosion`): look, `BlastForce`, `ExplosionAudio` + `stun`, `Daze`, `Knockdown` (a new blast always counts, from the current pose).
- Grenades: `Grenade` / `GRENADES` (mk2, f1, M24 stick: flips + twists) in `@polywar/weapons`. Camp `views/camp/grenades.js`: crates at x 16 z 40-44, F takes 4 (one in hand: gun to the off hand, `viewmodel.offhand*`, `player.busyHand`), hold fire = wind up + arc, let go = throw, H next / put back, right click pin back. Cover by the camp's own walls. Console: `nades.lastHit()`, `nades.live()`.

## Notes
- Steel targets from 200 m (`STEEL_FROM` in training-camp.ts), metal sparks seen to 900 m.
- Grass look = `assets/grass/range.json` (120 m, falloff 3).
- Smoke look: low poly icosahedron puffs + tubes, curl noise; clouds via `@polywar/clouds`. Marching cubes clouds rejected.

## Farm (`@polywar/farm`, feature/farm): needs in-game check (owner)
All 7 done (first pass). Views: `packages/world/farm` `experiment` (top down, show = edits) and `scene` (3D, fake terrain). World: farm sites get a farm (up to 220 m, heaviest first, clear of towns), flatten pads into the height grid, paint into the ways paint grid, no grass / no ecosystem trees on yard / fields / pastures, hedgerows + river bank trees (`FARM_TREES`), buildings + fences in `world.farmBuilt` with lods (`assets/models/buildings/farm/lod.json`).
Known rough: fields one soil colour (no crop rows), edits per field cell (~1000 per farm), on steep maps few fields, fences sit on segment centres (ends float on slopes), no animals yet.

## Open tasks
1. Arms-grip 5 (backlog): papit math cleanup, drop box arms, mag / bullet grab, pockets, first shot flyer. Grab animation: owner designs.

## Milestones (proposed, not planned yet)
1. Farm: building-builder + papit irregular grid, fields / fences / barn / house / silo / paths from existing assets. LOD for all assets (shared LOD package). Later castles, villages.
2. Weather + day/night: per-biome weather state, cloud cover grays + damps light, fog, mostly-overcast before rain (rare big-cloud bursts), rain / snow by biome.
3. Vehicles: generic core from jeep, then motorbike, tank, airplane.
4. Destruction: damage per vehicle / building, wrecks, parts break off, planes shot down.
5. Animals (on the farm).
