# Backlog

Grouped by feature. `[ ]` open, `[x]` done.

## Foundations
- [x] Package folder layout: stage, render, generators, tools, ui, network (table in CLAUDE.md)
- [ ] Asset pipeline: OBJ/FBX → glTF 2.0 with rigs + baked animations
- [x] Gallery view: browse all assets, per package views (+ materials view)
- [ ] GitHub Pages deploy via `@papit/static`

## Rendering
- [x] Pull Renderer / Model / Grid out of `@polywar/3d-asset-preview` into `packages/render/` (preview + gallery use it)
- [ ] More materials as `library/materials/*` packages, each with a sample (`Drawable`) for the materials gallery
- [ ] Lighting
- [x] Toon shading (`@polywar/shading`)
- [ ] Pixel style variant
- [ ] River flow shader looked bad (owner): redo later

## Animation / rig
- [x] Proper rigs (FK + IK), full animation control
- [ ] Foot IK: walk cycle adapts legs to ground
- [ ] Ragdoll physics
- [ ] Base animation flows per rig (humanoid, quadruped, biped, later spiders etc.): shared clips/states (nice to have)

## World
- [x] Terrain generator + editor: `@polywar/terrain` (+ `terrain-material`, `@polywar/noise`)
  - [ ] Generation in a worker (now sliced on the main thread; high = ~6 s)
  - [x] Adaptive mesh (RTIN): flat land few triangles, ridges full detail
  - [x] LOD by distance (per chunk RTIN, skirts)
  - [x] Rivers (drainage tree, carved beds)
  - [x] Water: `@polywar/water` (waves, shore foam, gloss, ripples, caustics, underwater)
  - [x] Water by hand: foam, glare, streaks, exact waterline
  - [ ] Water: renderer models not tinted under water
  - [ ] Ocean mesh LOD (now one quad per mesh cell)
  - [ ] Share code helper shared by grass + terrain (copied now)
  - [ ] Mountains still a bit spiky at defaults: tune by hand
- [x] Grass field (owner's YouTube reference): `@polywar/grass`
  - [ ] `cross` + `mesh` sources
  - [ ] Check by hand: `cross` + `mesh`, `smooth` style, quality switch, sprite PNG override
  - [ ] Optional `noise` texture (url/image) + shared noise cache
- [x] Biomes: classification done (terrain `biome` grid, `biomeAt`); props per biome: `@polywar/ecosystem`
- [ ] Modular city/village builder (reusable, own package)
- [x] Nature placement: `@polywar/nature` (hand kept `nature.json`), `@polywar/ecosystem`, `@polywar/scatter`, `@polywar/world`
  - [x] Far trees: 3 LOD levels per nature model (`lod.json`, `tools/blender/lod.py`), picked per cell by distance
  - [x] Fewer draw calls: one stream buffer per frame, one call per model / lod / part (~450)
  - [ ] Ecosystem grow in a worker (~0.2-0.4 s on the main thread)
  - [ ] Assets missing: mushrooms, ferns, reeds, desert shrubs, more flowers (listed in `nature.json` `missing`)
  - [ ] Grass colour matched to the terrain biome colour under it
  - [ ] Ambient life near the camera: fireflies at night, butterflies, birds / seagulls (arrow-warfare `birds.ts`)
  - [ ] Animals in the world (rigs exist), farms / castles / fields (building-builder first)

## NPC
- [ ] Bots, enemy types
- [ ] Animals, each own package + behaviour (pets / farm / wild, e.g. npc/animals/farm/chicken)
- [ ] Shared animal behaviour system (generic)

## Combat
- [ ] Melee: knife, sword, lance
- [ ] Ranged: guns, bow & arrow, crossbow
- [ ] Shooting physics (configurable)
- [ ] Hit physics / damage (configurable)
- [ ] Explosion package (many inputs)
- [ ] Killcam (many inputs)

## Vehicles / mounts
- [ ] Horses
- [ ] Tanks
- [ ] Airplanes

## Network / perf
- [ ] `@papit/game-network` integration
- [ ] Spatial partition (k-d tree)
- [ ] Distributed authority: bot/NPC sim offloaded across peers, not only host

## Game
- [ ] Modes: battle royale (default), capture the flag, last man standing, domination
- [ ] Game creation config: map, objects, many settings (like arrow-warfare)
- [ ] Massive lobby, host public/private games

## Open tasks (moved from plan, 2026-11-12)
- [ ] `@papit/static`: serve root `assets/` on GitHub Pages (check, report if papit lacks it).
- [ ] Bone map for downloaded humanoid models (Mixamo etc.) onto the base rig, once the owner has one.
- [ ] Weapons come alive (sniper scope, fire anims, flash, bullet, shell), FPS arms on hand IK; per weapon later.
- [ ] Git LFS for the .blend files (question open).
- Medieval buildings + baked surfaces (confirmed 2026-11-11, paused; goal: store screenshot style, flat pieces as quad + maps for phones):
  - [ ] `packages/library/materials/textured`: albedo + normal + spec + ao, maps optional, own view.
  - [ ] mesh-bake GUI view: drop glb, live maps + lit preview, settings, download.
  - [ ] Generator massing: main volume, wing, lean-to, jetty.
  - [ ] Generator roofs: gable default, cross-gable, dormers, ridge/rake.
  - [ ] Generator facades: bays, aligned windows, timber frame rules.
  - [ ] Attachments + archetypes (cottage, townhouse, inn, mill, gatehouse).
  - [ ] Generator uses baked pieces, view shows triangle count.
- [ ] Vehicle parts from FBX are not assembled/rigged (artillery gun sits off its base). Vehicle scale is the pack's (tank ~2 m).

## Report to owner (papit)
- `@papit/create`: name starting with a digit gives an invalid class name (`3dAssetPreview`).
- `@papit/create`: `--destination` is the parent folder (package lands in `<destination>/<name>`), and it commits by itself.
- `@papit/server`: package folder named `assets` is served raw (no CSS import rewrite).
- `@papit/web-component`: attribute bindings briefly pass `__marker__` as the value.
- `@papit/build`: a package `bin` entry gets bundled for the browser (fails on `node:` imports).
- `@papit/quaternion`: `writeMatrix(out, position)` and `fromAxisAngle(axis)` are typed `{x,y,z}` but read `[0],[1],[2]` (NaN with objects).
- `@papit/matrix`: static `Matrix4.multiply(a, b)` fails to type-check (`this` of `typeof Matrix4`); `multiply(Float32Array(16))` reads it as 16x1 (wrap in `Matrix4.create`); no point transform (`m.clone.multiply([x,y,z,1])` works).
- `@papit/game-engine`: `fps` walks on the ground only and `pan` is 2D (viewport has its own `fly` / `panZoom`); theme custom properties come back unresolved (`light-dark()`), read a resolved colour instead.
- `@papit/game-mesh`: `rig(gltf)` bones get length 0 and point along +Y (glTF) while `armature` bones point +X, so papit IK can't run on glTF rigs (`@polywar/skeleton` converts). glTF `extras` are dropped. `SKINNING_GLSL` caps at 64 joints (Mixamo with fingers is ~65).
- `@papit/armature`: IK turns chain bones the shortest way, so twist drifts and a knee's hinge axis leaves the bend plane (Blender keeps it on the root/target/pole plane); `@polywar/skeleton` corrects it.
- `@papit/web-component`: a re-render builds the template's custom elements again and runs `firstRender` on the detached copies (pw-3d-asset-preview now guards; character-preview creates its preview outside the template).
- `@papit/game-engine`: no lit mesh renderer (polywar has `@polywar/renderer`); `Layer3D.createProgram` keeps the shader objects after linking.
- [ ] papit report: `@papit/game-engine` Layer has no render scale / max pixel ratio (polywar sets `layer.setting.width/height` from `pw-viewport max-pixel-ratio` as a workaround)

## Roads (parked)
- [ ] Continue `plan-road.md` (phase 2/3)
