# Plan

## Where we are
Infrastructure tasks 0–9 done 2026-11-13 on `feature/infrastructure` (not merged): owner review. Open: portal terrain cut (portals stand in front of the slope, no ground hole), fence/bench facing to check, footbridge beams double sided (tris), placements not yet sent over network.
Rivers rework merged. Road routing details in `plan-road.md` (still valid for topology/routing). LOD branch `lod` waits for owner check.

## Rules for this plan
- Very low poly, reuse assets first (list below). New packages via `npm run create`, each with a `views/` page.
- Packages pure + decoupled: they take curves / spans / config, know nothing of terrain or world. `@polywar/world` wires them.
- Everything placed (bridges, portals, fences, lamps, benches, ...) goes through the placement record (task 7).
- River flow shader looked bad: leave it, don't polish water look here.

## Assets to reuse
- Rail: `assets/models/transport/train/RailwayTrack_Straight` / `_Curve` (cut one sleeper + one rail piece out in Blender).
- Arches / tunnels: `buildings/modular-village/Stone_Arch`, `Stone_Arch_Outer`, `Stucco_Arch_*`; `buildings/castle/Tunnel`, `Bridge`, `WallEntrance`.
- Railings / posts: `modular-village/Wood_Railing_*`, `Wood_Post_Large`, `Stone_Stairs_Railing`; `buildings/farm/Fence`, `Fence2`.
- Props: `assets/models/props/village/` (copied from arrow-warfare: bench, street-lamp, double-lamp, signpost, fence, lantern, stone-lantern, log, woodpile, barrel, crate, ...). `modular-village/Prop_Lamp_Street`, `Wall_Prop_Sign_1` (notice board). Rocks in `nature/`.

## Tasks
- [x] 0. Branch `feature/infrastructure`. Register `props/village` in the asset pipeline (`npm run assets`, manifest, catalog gallery shows them; LODs only if cheap).
- [x] 1. Site markers: world view toggle draws a translucent / flat shaded sphere per site (city, village, farm, landmarks) sized by `radius`, colour per kind.
- [x] 2. `@polywar/sweep` (`packages/utils/sweep`): mesh along a 3D polyline. Input points + per point width; profile (2D cross section points, e.g. flat, crowned road, curb, river bed with banks); `bank`: `"flat"` (always level across, slopes along OK: water) or `{ max: rad }` (tiny tilt into curves: roads); `step` / `lods` (fewer rings + fewer profile points per level); UV/vertex colour along length. Handles self overlap on tight curves (clamp inner offset). View: editable curve, toggle profiles + bank + LOD.
- [x] 3. Use sweep in world: roads (per class profile: highway concrete slabs = coloured bands every ~5 m, road gravel, lane dirt, path narrow), rivers / streams (flat water ribbon from hydrology lines, width by order). Replace current flat strips. Bridges/tunnel spans skip the ground ribbon.
- [x] 4. `@polywar/rail` (`packages/library/rail`): Blender script cuts `rail-sleeper.glb` + `rail-segment.glb` from RailwayTrack_Straight. Lays sleepers every gauge step along a curve (instanced, aligned to tangent + bank), rails as sweep profile. LODs: near = sleepers + rails, mid = rails + one ballast strip, far = one strip. View: editable curve. World: rail roads use it.
- [x] 5. Tunnel portals (`@polywar/portals` or inside `bridges` package if small): generated stone arch ring + wing walls + key stone, sized per class (rail single/double, road). Option to use `Stone_Arch` / castle `Tunnel` piece instead. World: at each tunnel span end, flatten/cut terrain face into the mouth, hide ground inside, scatter rocks + bushes around (ecosystem gets a "boost" mask near portals, no trees right on the arch).
- [x] 6. `@polywar/bridges` (`packages/library/bridges`): generator `bridge(type, curve, span, height)` → mesh pieces (deck by sweep + generated supports). Types: `foot-wood` (planks + rope/railing, small), `slab-stone` (flat stones on piers), `arch-stone` (medieval: arches spaced by height, parapet), `trestle-wood` (rail: X braced bents), `girder` (big steel/concrete truss for wide/high spans). Pick rule (config): class + span + height + era. Railings from assets where they fit. View: pick type, span, height sliders.
- [x] 7. `@polywar/placements` (`packages/utils/placements`): the one record of placed things. `Placement = { id, kind (asset name or generator id), x, y, z, yaw, pitch?, roll?, scale, seed?, params? }`; groups by source (roads, bridges, trails, ...); `toJSON` / `load`, compact binary pack for network, stable ids from seed so clients can rebuild instead of send. Trees: store ecosystem seed + changes only (felled, burnt), not every tree. World reads it to draw (scatter instancing per kind).
- [x] 8. Trail furniture (rules in world or `@polywar/trails` package with config): along `path` / `lane` roads: at viewpoints + forest clearings + path ends → bench (+ lamp, signpost / notice board, sometimes log/woodpile). Fences / railings along path edges where side slope or drop is steep (sample ground left/right of path), posts at junctions (signpost). Lamps on village roads. All via placements.
- [x] 9. Extra: boardwalk / short footbridge where a path runs along a lake edge or wet ground (hydrology wetlands mask), small stone bridges over streams on lanes/paths.

## Notes
- Owner trains while this runs: run "next task" through all, one line status each, commit per task on the branch. Don't merge to main; owner reviews.
- Headless check with playwright when a view needs a look (screenshot), no tests.
