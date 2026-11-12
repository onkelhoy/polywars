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

## Animation / rig
- [x] Proper rigs (FK + IK), full animation control
- [ ] Foot IK: walk cycle adapts legs to ground
- [ ] Ragdoll physics
- [ ] Base animation flows per rig (humanoid, quadruped, biped, later spiders etc.): shared clips/states (nice to have)

## World
- [x] Terrain generator + editor: `@polywar/terrain` (+ `terrain-material`, `@polywar/noise`)
  - [ ] Generation in a worker (now sliced on the main thread; high = ~6 s)
  - [x] Adaptive mesh (RTIN): flat land few triangles, ridges full detail
  - [ ] LOD by distance (RTIN error per chunk + crack fix)
  - [ ] Rivers from the erosion flow map
  - [ ] Real water (waves, shore foam)
  - [ ] Share code helper shared by grass + terrain (copied now)
  - [ ] Mountains still a bit spiky at defaults: tune by hand
- [x] Grass field (owner's YouTube reference): `@polywar/grass`
  - [ ] `cross` + `mesh` sources
  - [ ] Check by hand: `cross` + `mesh`, `smooth` style, quality switch, sprite PNG override
  - [ ] Optional `noise` texture (url/image) + shared noise cache
- [ ] Biomes: classification done (terrain `biome` grid, `biomeAt`); props per biome open
- [ ] Modular city/village builder (reusable, own package)
- [ ] Nature placement

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
