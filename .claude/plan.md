# Plan

## Where we are
Everything is on `main` (farm, smoke, explosion, knockdown, grenades, camp upgrade, gun drop, fx fixes). Smoke 4 done, jeep 7 was already done. Open: arms-grip 5 (grab animation: owner designs). Vehicles round started: motorbike first pass on `feature/motorbike`.

## Needs in-game check (owner)
- Camp: range rework (ditch, targets per board, markers, props, movable lane targets, binoculars / fixed scopes, scope on any gun), gun obstruction, lights + glow, doors, grass (falloff, no SSAO on tufts, grass in the scope), optics 1-6.
- Jeep dust now via `@polywar/smoke` (grenades' `nades.smoke`, one puff per Dust emit).
- Arms-grip 4 / 4b (brace hand on walls / rails, aim at a wall backs off). Jeep 1-8, jeep crash fix.
- Gun drop / swap: G `drop` (lay on a top, lean on a wall, else throw), F `pickUp` (swap). Stand guns still instant.
- FX fixes: camera near .25, smoke after tufts, marks ride on what they hit (`Hit.carrier`), muzzle sound scene rays, `@polywar/fog`, `@polywar/shadows`, parked cars hold, jeep glass last.
- Explosion (`@polywar/explosion`): look, `BlastForce`, `ExplosionAudio` + `stun`, `Daze`, `Knockdown` (a new blast always counts, from the current pose).
- Grenades: `Grenade` / `GRENADES` (mk2, f1, M24 stick: flips + twists) in `@polywar/weapons`. Camp `views/camp/grenades.js`: crates at x 16 z 40-44, F takes 4 (one in hand: gun to the off hand, `viewmodel.offhand*`, `player.busyHand`), hold fire = wind up + arc, let go = throw, H next / put back, right click pin back. Cover by the camp's own walls. Console: `nades.lastHit()`, `nades.live()`.

## Motorbike (`feature/motorbike`): needs in-game check (owner)
Then: ww2 tank, ww2 truck, ww2 fighter (plan each when we get there).
- Asset: `tools/blender/packs/motorbike.py` (reads the owner's model.blend, never saves it) -> model.glb (texture kept, star shows) + vehicle.json (`kind: "bike"`, `fork` raked 28°, `grips`, seat / eye / exit eyeballed). Camp: asset empties `vehicles/ww2-motorcycle/model` become vehicles in the exporter (`ASSET_VEHICLES` in training-camp.py).
- Physics: `Vehicle` bike mode: balance torque leans into turns (`balance`, `balanceDamping`, `maxLean`), kickstand lean when parked (weak: a good shove tips it), no sideways glide when slow, tyre load straight up off the ground. Crash (`fallen` + `oncrash`): roll + spin kick, tyres skid, it tumbles and slides on its side; `raise()` (E at a fallen bike). Drive view: `?v=ww2-motorcycle`.
- Fork + front wheel turn round the raked axis, wheels spin. Sound: `ENGINES.bike` (V-twin).
- Camp: E ride / get off (hips swing over the seat, ~.9 s), rider on pegs + grips, rifle slung on the back (back in the hands on getting off). Crash: thrown with the speed, `nades.fling` -> knockdown + daze (hard = down long).

## Round 2 (`feature/motorbike`): needs in-game check (owner)
- Grips fixed (hands were crossed). Bike: upside down counts as fallen, rolls onto a side, stays down. Getting on: right leg swings up over the seat.
- Dev cam: M third person (whole body + gun, no daze / lids), hold Z to orbit. `player.thirdPerson` = the eye matrix.
- `@polywar/ragdoll` (packages/animation): heavy verlet (copied from arrow-warfare) + `HumanRagdoll` (points from the HUMANOID bones, torso as one block, limbs `pointAt`). `player.limp(v)` / `player.rise()`; eye rides the head. Blast knockdown and thrown off a vehicle go limp; the get up starts where the hips lie (snap, no blend yet).
- Crash: `Vehicle.oncrash` for cars too (`crashAt` 7 m/s lost in a step, `crashVelocity`); the jeep throws you over 8 m/s. `nades.fling(v, speed)`: <4 m/s blur + stumble, more = down, >7 m/s out cold (`Knockdown.hit(..., out)`, up to 8 s eyes shut).
- `@polywar/close-dark` (packages/ui/viewport): 5 short rays round the look, dark from the centre with a dithered grit edge; camera near .04 while limp.

## Notes
- Steel targets from 200 m (`STEEL_FROM` in training-camp.ts), metal sparks seen to 900 m.
- Grass look = `assets/grass/range.json` (120 m, falloff 3).
- Smoke look: low poly icosahedron puffs + tubes, curl noise; clouds via `@polywar/clouds`. Marching cubes clouds rejected.

## Farm (`@polywar/farm`, on main): needs in-game check (owner)
All 7 done (first pass) + owner round 1 (gates, doors, chicken run, crops, props, view spot). Views: `farm/views/experiment` (top down, show = edits), `world/views/farm` (one farm on a 640 m real world, buttons top / yard / bench). World: `settings.farms` adds farm areas; farm sites get a farm (up to 220 m, heaviest first, clear of towns). Flatten pads into the height grid, paint into the ways paint grid, no grass / no trees on yard / fields / pastures, hedgerows + bank trees (`FARM_TREES`), crops (`CROPS`, `cropRows`), fences generated (bridges `fence`, follow the slope), buildings + props in `world.farmBuilt` (farm lods via `assets/models/buildings/farm/lod.json`).
Known rough: yard + fields paint all brown, edits per field cell, few fields on steep maps, no animals, props/village has no lods.

## Terrain cover (feature/terrain-control): needs in-game check (owner)
Terrain owns the grass ground: `material.cover(map)` (RGBA8: R grass, G dry, B height 0..2, A flowers; `coverMap` / `coverAt` in `@polywar/terrain-material`), look `grass` (color, patches, dry, blend to the terrain colour, darken, edge; edge -1 = grassy everywhere). Tufts plant from the same map and take the ground colour from `bakeAlbedo` (`grass.ground(albedo)`). `drawPart(mesh, matrix)` draws any model's earth as terrain (camp: model earth drawn once, no grass floor copy). `Grass.drawGround/setGround` gone. Debug `cover`. World / farm / terrain / grass / camp views wired.

## Open tasks
1. Arms-grip 5 (backlog): papit math cleanup, drop box arms, mag / bullet grab, pockets, first shot flyer. Grab animation: owner designs.

## Milestones (proposed, not planned yet)
1. Farm: building-builder + papit irregular grid, fields / fences / barn / house / silo / paths from existing assets. LOD for all assets (shared LOD package). Later castles, villages.
2. Weather + day/night: per-biome weather state, cloud cover grays + damps light, fog, mostly-overcast before rain (rare big-cloud bursts), rain / snow by biome.
3. Vehicles: generic core from jeep, then motorbike, tank, airplane.
4. Destruction: damage per vehicle / building, wrecks, parts break off, planes shot down.
5. Animals (on the farm).
