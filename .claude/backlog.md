# Backlog

Grouped by feature. `[ ]` open, `[x]` done.

## Foundations
- [ ] Package folder layout (domain folders: world, npc, weapons, vehicles, systems, ui, game)
- [ ] Asset pipeline: OBJ/FBX → glTF 2.0 with rigs + baked animations
- [ ] Gallery view: browse all assets, per package views
- [ ] GitHub Pages deploy via `@papit/static`

## Rendering
- [ ] Lighting
- [ ] Toon shading
- [ ] Pixel style variant

## Animation / rig
- [ ] Proper rigs (FK + IK), full animation control
- [ ] Foot IK: walk cycle adapts legs to ground
- [ ] Ragdoll physics

## World
- [ ] Terrain
- [x] Grass field (owner's YouTube reference): `@polywar/grass`
  - [ ] `cross` + `mesh` sources
  - [ ] Check by hand: `cross` + `mesh`, `smooth` style, quality switch, sprite PNG override
  - [ ] Optional `noise` texture (url/image) + shared noise cache
- [ ] Biomes
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
