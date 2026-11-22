# Plan

## Where we are
Everything is on `main` (farm, smoke, explosion, knockdown, grenades, camp upgrade, gun drop, fx fixes). Smoke 4 done, jeep 7 was already done. Open: arms-grip 5 (grab animation: owner designs). Vehicles round: motorbike + ragdoll + close-dark merged to main (needs check below). Next: fighter round 1 check, then bomber.

## Needs in-game check (owner)
- Camp: range rework (ditch, targets per board, markers, props, movable lane targets, binoculars / fixed scopes, scope on any gun), gun obstruction, lights + glow, doors, grass (falloff, no SSAO on tufts, grass in the scope), optics 1-6.
- Jeep dust now via `@polywar/smoke` (grenades' `nades.smoke`, one puff per Dust emit).
- Arms-grip 4 / 4b (brace hand on walls / rails, aim at a wall backs off). Jeep 1-8, jeep crash fix.
- Gun drop / swap: G `drop` (lay on a top, lean on a wall, else throw), F `pickUp` (swap). Stand guns still instant.
- FX fixes: camera near .25, smoke after tufts, marks ride on what they hit (`Hit.carrier`), muzzle sound scene rays, `@polywar/fog`, `@polywar/shadows`, parked cars hold, jeep glass last.
- Explosion (`@polywar/explosion`): look, `BlastForce`, `ExplosionAudio` + `stun`, `Daze`, `Knockdown` (a new blast always counts, from the current pose).
- Grenades: `Grenade` / `GRENADES` (mk2, f1, M24 stick: flips + twists) in `@polywar/weapons`. Camp `views/camp/grenades.js`: crates at x 16 z 40-44, F takes 4 (one in hand: gun to the off hand, `viewmodel.offhand*`, `player.busyHand`), hold fire = wind up + arc, let go = throw, H next / put back, right click pin back. Cover by the camp's own walls. Console: `nades.lastHit()`, `nades.live()`.

## Motorbike (on main): needs in-game check (owner)
Then: ww2 tank, ww2 truck, ww2 fighter (plan each when we get there).
- Asset: `tools/blender/packs/motorbike.py` (reads the owner's model.blend, never saves it) -> model.glb (texture kept, star shows) + vehicle.json (`kind: "bike"`, `fork` raked 28°, `grips`, seat / eye / exit eyeballed). Camp: asset empties `vehicles/ww2-motorcycle/model` become vehicles in the exporter (`ASSET_VEHICLES` in training-camp.py).
- Physics: `Vehicle` bike mode: balance torque leans into turns (`balance`, `balanceDamping`, `maxLean`), kickstand lean when parked (weak: a good shove tips it), no sideways glide when slow, tyre load straight up off the ground. Crash (`fallen` + `oncrash`): roll + spin kick, tyres skid, it tumbles and slides on its side; `raise()` (E at a fallen bike). Drive view: `?v=ww2-motorcycle`.
- Fork + front wheel turn round the raked axis, wheels spin. Sound: `ENGINES.bike` (V-twin).
- Camp: E ride / get off (hips swing over the seat, ~.9 s), rider on pegs + grips, rifle slung on the back (back in the hands on getting off). Crash: thrown with the speed, `nades.fling` -> knockdown + daze (hard = down long).

## Motorbike round 2 (on main): needs in-game check (owner)
- Grips fixed (hands were crossed). Bike: upside down counts as fallen, rolls onto a side, stays down. Getting on: right leg swings up over the seat.
- Dev cam: M third person (whole body + gun, no daze / lids), hold Z to orbit. `player.thirdPerson` = the eye matrix.
- `@polywar/ragdoll` (packages/animation): heavy verlet (copied from arrow-warfare) + `HumanRagdoll` (points from the HUMANOID bones, torso as one block, limbs `pointAt`). `player.limp(v)` / `player.rise()`; eye rides the head. Blast knockdown and thrown off a vehicle go limp; the get up starts where the hips lie (snap, no blend yet).
- Crash: `Vehicle.oncrash` for cars too (`crashAt` 7 m/s lost in a step, `crashVelocity`); the jeep throws you over 8 m/s. `nades.fling(v, speed)`: <4 m/s blur + stumble, more = down, >7 m/s out cold (`Knockdown.hit(..., out)`, up to 8 s eyes shut).
- `@polywar/close-dark` (packages/ui/viewport): 5 short rays round the look, dark from the centre with a dithered grit edge; camera near .04 while limp.

## Tank round 1 (feature/tank): needs in-game check (owner)
- Asset: `tools/blender/packs/tank.py` (reads model.blend, never saves) -> model.glb (texture baked to vertex colours, as before) + vehicle.json (`kind: "tank"`, x3.1 = 6.2 m, 30 t, a contact per side per wheel, `turret`, `gun` + muzzle). Camp: parked at x 16 z 22 (`VEHICLES` in main.js, not in the exported layout yet).
- Physics: `Vehicle` tank mode: track throttle -+ steer, yaw torque to `pivotTurn` (turns on the spot), sideways grip from the hull's velocity (skid steer), `rolling` drag. `Vehicle.kick(at, impulse, time)`. Camp `TANK` setting (~40 km/h top, 4 gears).
- `Turret` (`@polywar/vehicle`): slow traverse (18°/s) + elevation (5°/s, -8..20°), barrel run back, `muzzle()` / `direction()`.
- Camp `views/camp/tank.js`: E climb in / out (< 2 km/h), mouse aims, V gunner sight / chase, click fires (6 s reload). Shell 6.8 kg 790 m/s (`GUN`), recoil kick, muzzle blast (explosion 1.2 kg) + dust ring, hit = 2.5 kg shatter blast, cars hit get shoved. Crew inside gets 15% of any blast (`armour` in grenades.js): daze / muffle, no knock down.
- Sound: `ENGINES.tank` (V12, track clatter + squeal, `clatter` / `revs` settings). Explosions louder + carry further, less hidden when deafened, `ExplosionAudio.thump` (sub bass) for 1 kg+.

## Tank round 2 (feature/tank): needs in-game check (owner)
- Gun up / down: elevation 9°/s, -10..25° (math checked headless, no bug found: was just slow + narrow).
- Sound: replaced by `TankSound` + `TANK_SOUND` look (`@polywar/vehicle-audio`, rebuilt from the owner's two reference mp3s by measured spectrum + rhythm): engine harmonics of a ~42-70 Hz firing rate (uneven, muffled, rasp), track clicks 3.7 / m (2.6 kHz broad) + slaps + rumble, hull turn scrub, turret motor whine (800 + 1600 Hz, 50 Hz rough, gear hiss) from `Turret.rate`. `ENGINES.tank` + EngineSound clatter removed. Console: `TANK_SOUND`.
- Tank blasts `deep` (`ExplosionAudio.play(..., { deep })`): pitched down, bigger sub thump + 3 s rumble. `ExplodeOptions.mark` (muzzle: no mark, impact: mark) + `tag` back on the blast.
- Recoil x3 (hull slides ~10 cm, rocks ~3°), softer suspension (1 Hz, damping .32, travel .38, roll 1: squats / dives).

## Notes
- Steel targets from 200 m (`STEEL_FROM` in training-camp.ts), metal sparks seen to 900 m.
- Grass look = `assets/grass/range.json` (120 m, falloff 3).
- Smoke look: low poly icosahedron puffs + tubes, curl noise; Marching cubes + puff clouds rejected (owner: the sky's noise cloud layer is the look).

## Farm (`@polywar/farm`, on main): needs in-game check (owner)
All 7 done (first pass) + owner round 1 (gates, doors, chicken run, crops, props, view spot). Views: `farm/views/experiment` (top down, show = edits), `world/views/farm` (one farm on a 640 m real world, buttons top / yard / bench). World: `settings.farms` adds farm areas; farm sites get a farm (up to 220 m, heaviest first, clear of towns). Flatten pads into the height grid, paint into the ways paint grid, no grass / no trees on yard / fields / pastures, hedgerows + bank trees (`FARM_TREES`), crops (`CROPS`, `cropRows`), fences generated (bridges `fence`, follow the slope), buildings + props in `world.farmBuilt` (farm lods via `assets/models/buildings/farm/lod.json`).
Known rough: yard + fields paint all brown, edits per field cell, few fields on steep maps, no animals, props/village has no lods.

## Terrain cover (feature/terrain-control): needs in-game check (owner)
Terrain owns the grass ground: `material.cover(map)` (RGBA8: R grass, G dry, B height 0..2, A flowers; `coverMap` / `coverAt` in `@polywar/terrain-material`), look `grass` (color, patches, dry, blend to the terrain colour, darken, edge; edge -1 = grassy everywhere). Tufts plant from the same map and take the ground colour from `bakeAlbedo` (`grass.ground(albedo)`). `drawPart(mesh, matrix)` draws any model's earth as terrain (camp: model earth drawn once, no grass floor copy). `Grass.drawGround/setGround` gone. Debug `cover`. World / farm / terrain / grass / camp views wired.

## Weather round 1 (feature/weather): needs check (owner)
Clouds = the sky shader layer only (puff clouds removed), weather changes over minutes, world view first.
- `@polywar/weather` (world/nature, headless): humidity = biome moisture + wind-blown noise + slow swing (`bias` knob); `at(x, z)` -> cover, grey, kind (clear / cirrus / fair / towering / storm / overcast), base / top, precipitation, snow (cold), storm. Seed + time only (same on every client). View `weather`: 60 km map, desert left -> wet cold right.
- `@polywar/sky` (world/nature): gradient dome + sun, toon cloud layer to the horizon (noise always there, cover shows it, banded light, grey undersides), cirrus streaks. `sky.light(clear, out)` dims sun / greys ambient / fog = horizon. Draw right after `renderer.begin`. View `sky`: sliders.
- Day / night: `sky.setTime(hour, phase)` (sun + moon, moon trails by phase), `sky.day`. Dusk glow round the setting sun, warm low sun; night gradient, twinkling stars + faint milky band (behind cloud, gone by day), moon disc lit from the sun's side; clouds lit by sun / moon. `sky.light` at night: moon is the key light (cold, by phase), ambient sinks. View: hour, day speed, moon phase. Heavy cover shades from the raw noise (lumpy dark bases), darker storm greys.
- `@polywar/lightning` (world/fx): `strike(x, z, { kind })`: `ground` = stepped leader with dying branches (~.1-.2 s), return stroke + 1-4 re-strokes flicker; `spider` = 5-18 km channel crawling near level along the cloud base (~18-33 km/s), forking. `storm` random strikes round the eye, `onstrike`, `flash` / `flashAt` -> `sky.state.flash` (clouds lit from inside round the bolt, ambient kick). Additive glow ribbons, min width by distance. View `lightning` (strike buttons, thunder with sound).
- World view: weather panel (on, sound, hour, day speed, wetness, weather speed, storm auto / off / some / heavy): `terrain.climateAt` feeds `Weather`; sky drawn first, lightning + rain after the world, audio surfaces from the biome (forest = leaves, water). Ground wetness not on the terrain material yet.
- `@polywar/precipitation` (world/nature): `state` intensity 0..1 (mild = few faint drops, dense = 24k streaks), snow (wobbling flakes), wind slant. Drops all GPU (wrapping box round the eye), splashes CPU (ring + crown, `ground` height, rate by intensity²). `wetness` / `snowCover` rise + dry slowly (not on materials yet). Draw after the world. View `rain` (+ sound button).
- `@polywar/weather-audio` (packages/audio): CC0 recordings (bigsoundbank.com, `tools/weather-sounds.mjs` fetches, cuts steadiest 30 s loops, AAC -> `assets/audio/weather/`, 3.8 MB): beds ground light / heavy, water, leaves, tent (tarp), roof (tin), vehicle light / heavy, wind light / strong / inside. `state.surfaces` (outside, muffled by `inside`), `state.under` (close). Thunder `thunder(distance, pan)`: near cracks < 1.5 km / far rolls, late by 343 m/s, duller with distance; `state.storm` = random strikes + `onstrike` (for the flash). Live synth worklet kept as `state.detail` (default 0). View `weather-audio` (presets + thunder buttons).

## Weather next
- Camp hook-up (task 7 second half): not done yet.

## Open tasks
1. Arms-grip 5 (backlog): papit math cleanup, drop box arms, mag / bullet grab, pockets, first shot flyer. Grab animation: owner designs.

## Milestones (proposed, not planned yet)
1. Farm: building-builder + papit irregular grid, fields / fences / barn / house / silo / paths from existing assets. LOD for all assets (shared LOD package). Later castles, villages.
2. Weather + day/night: per-biome weather state, cloud cover grays + damps light, fog, mostly-overcast before rain (rare big-cloud bursts), rain / snow by biome.
3. Vehicles: generic core from jeep, then motorbike, tank, airplane.
4. Destruction: damage per vehicle / building, wrecks, parts break off, planes shot down.
5. Animals (on the farm).

## Fighter round 1 (feature/fighter): needs in-game check (owner)
- Asset: `tools/blender/packs/fighter.py` (reads model.blend, never saves) -> model.glb (vertex colours, no texture), x5.1 = 11.3 m span, vehicle.json (`kind: "plane"`, 4 t, `centre`, `wing` span / area / tips, `propeller`, 6 `guns`, seat / eye eyeballed).
- Camp layout: owner's placed tank + fighters are real vehicles now (`ASSET_VEHICLES` in training-camp.py: ww2-tank nose -pi/2, ww2-fighter +pi/2); hardcoded camp tank gone. Truck + bomber still props.
- `@polywar/aircraft` (packages/play): `Aircraft` on the Vehicle (`onstep` hook, `spec.centre`, `freeRoll`, `airDrag` added to Vehicle): thrust (1.1 MW, 20 kN static), lift / drag by angle of attack, thin air up high, stall (wing drop, spin), flaps (down on getting in, F toggles), sideslip, pitch / roll / yaw by dynamic pressure, stability + damping, wind + gusts (`planes.wind`, gust 2.5 m/s). Headless check: lift off ~440 m at ~57 m/s, 4 g pulls show vapour.
- `Guns`: 6 x M2 .50, 800 rpm each, 400 / 270 rounds (1880), 870 m/s, converge 300 m, tracer every 4th, recoil. Sound: `double-deuce` set (every 3rd round).
- Camp `views/camp/plane.js`: E in / out (stopped), Shift / Ctrl throttle, mouse or S / W pitch, A / D roll, Z / C rudder, B brakes, I engine, hold click fires, V cockpit / chase (banks). HUD: speed, height, throttle, g, stall, ammo. Crash > 14 m/s: blast + thrown out.
- Sound: `PlaneSound` (`@polywar/vehicle-audio`): V12 + 3 blade buzz + wind roar.
- Next: bomber (bomb whistle + big blasts), star textures, enemy plane, damage.

## Challenger A30 (feature/fighter): needs in-game check (owner)
- `tools/blender/packs/challenger.py` -> `vehicles/tanks/challenger-a30/` (model.glb + vehicle.json, 33 t, 16 wheels, turret + gun). No materials in the blend: olive drab / dark tracks / gun metal given. `Human` figure dropped.
- Camp: placeable as an asset empty `vehicles/tanks/challenger-a30/model` (`ASSET_VEHICLES`); until placed it parks at x -96 z 28 (main.js). Drives like the ww2 tank (same TANK setting, gun, sound). Headless: ~38 km/h.
- Later: ww2-tank into `tanks/`.

## Fighter round 2 (feature/fighter): needs in-game check (owner)
- Controls: mouse aim (`instruct` in `@polywar/aircraft`: banks / pulls / rudders the flight path onto the aim, levels the wings near it, eases off near the stall). Ground: W go, S brake then back up, A / D steer. Air: W / S throttle, A / D roll by hand. Flaps auto (down on the ground / low and slow). I engine. Chase cam on the aim, level horizon (V cockpit); a ring shows where the nose / guns point.
- Gusts 1 m/s (was 2.5). Headless: 90° turn in ~7 s, no wing rocking, holds height after.
- Round 3: `assist` (arcade, camp: 1): controls are turn rates (pitch 1.4 / roll 3 / yaw .5 rad/s, reached fast), the flight path follows the nose (`grip` 2.5/s), lift holds it up above ~50 m/s. Tail wheel steer fixed (was mirrored going forward). Chase cam fixed to the plane (no lag). Headless: off the ground ~200 m, 90° turn in ~3 s. Wheels / folding gear: owner fixes the model. Touch controls for phone: later.
