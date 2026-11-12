# Facts

Knowledge that outlives a plan. Trust code over this.

## General
- Blender 5.2 headless. Scripts in `tools/blender/` (`lib/pw.py`, `lib/gun_rig.py`, `export.py`, `packs/ww2_weapons.py`).
- `npm run assets [-- --all]`: exports `.blend` → `.glb` (when stale) + writes `assets/manifest.json`.
- Pack script keeps existing files (hand edits); `--force` or delete one file to regenerate it.
- Guns: muzzle +Y Blender (glTF -Z), up +Z. Bones: root > body > action, trigger, hammer?, mag > round, muzzle, eject. Moving parts = vertex groups in `gun.blend`. Actions: idle, fire, reload, reload-empty.
- `game-mesh` has no textures → `export.py` bakes image textures into vertex colours.
- Render code (Renderer, Model, Grid, gltfFromMesh) is `@polywar/renderer` (`packages/ui/viewport/renderer`); shading styles + preview ball are `@polywar/shading`.
- Dev server treats folders named `asset`/`assets`/`public` as raw assets: never name a package that.

## Characters / rigs
- Per character: `model.blend` → `model.glb` + `model.rig.json` (export.py writes it for every armature: lengths, IK, copy rotation, deform) + hand written `character.json` (`@polywar/characters`). Farm animals: `<Name>.character.json`.
- Base rigs: humanoid (`human_rig.py`, `characters/base`), quadruped (farm pack, Cow), biped (`bird_rig.py`, `characters/bird`). Specs in `@polywar/characters` `RIGS`.
- papit gap: glTF bones point +Y, armature +X, `rig(gltf)` lengths 0. `@polywar/skeleton` converts. Posing by hand: `Poser` (tools select / move / rotate) in `pw-3d-asset-preview`.
- export.py trims trailing holds off actions. Limb bones are rolled to face their pole so Blender and runtime IK match.

## Terrain
- Stages shape → erosion → water → cities → climate → biomes; `Generator` caches per stage (key = the options it reads), `Terrain.set` redoes only dirty stages, look changes are uniforms only.
- Grid heights in metres, `n = resolution + 1` nodes, centred on the origin. Erosion runs in grid units scaled by `resolution / 256`.
- Skirt (far fields / sea floor) has flow -1: material draws it smooth, no face shades.
- Ground mesh: one RTIN over the whole grid (needs 2^k + 1 nodes: `resolve` rounds `resolution`), cut into chunks by triangle centre. Biome borders add `mesh.edges` error so they stay sharp.
- Camera: `pw-3d-demo` `pan="screen"` (default, full 3D) or `"ground"` (in-game RTS style), `max-distance` zoom limit.

## Ecosystem
- `@polywar/nature`: `assets/models/nature/nature.json` is hand kept (families, variants by index). `@polywar/ecosystem` (pure CPU: cover maps + placement, `grassAt`), `@polywar/scatter` (instanced props, `Renderer.drawInstanced`), `@polywar/world` (all together, world code `<terrain>~<ecosystem>`, view `world`).
- Grass planting `grow` + `window` + `grass.follow(x, z)`: chunks seeded per chunk. Instance attributes: grass 4 tuft + 5 cover; renderer instanced 6 `x y z scale` + 7 `yaw tint sway _`.
- Stand things on `terrain.groundAt(x, z)` (height of the drawn RTIN triangles, finest level), not `heightAt` (smooth grid, up to ~2 m below the mesh: buried the grass).
- Forest cores: `EcosystemOptions.core` (depth into a core biome) scales group size / density / spacing (`group.core`). Clearings: `biomes[b].open` share + `clearings` noise, only grass (ground not tinted).
- Ground look: watercolour in `terrain-material` (`look.paint`: washes, rim, warmth, grain, billowy biome borders from a biome grid texture `material.biomes(map)`); gloss `look.gloss` (rock, wet via `toWater`). Props: renderer `Surface` (bands, soft, grit, gloss) via scatter `surface` / `gloss` per kind.
- Play: `walk` controller (viewport-camera), `pw-3d-demo` `mode="walk"` + `walking.ground`, Esc fires `walkexit`.
- Headless browser checks: playwright chromium is installed (`node_modules/playwright`).

## Layout (2026-11-12)
`animation/skeleton` · `library/{catalog (@polywar/assets), materials/*, grass, city, building-builder}` · `ui/game/*` · `ui/viewport/{3d-demo, 3d-asset-preview, gallery, renderer}` · `network/*` · `utils/{mesh-bake, noise}`.
`npm run assets` serves `library/catalog` (`views/`, no sub views). Folder `catalog` (not `assets`: the dev server serves such folders raw).

## Medieval buildings (facts)
Goal: buildings like the store screenshots (gables, jetties, timber frame), flat stone/ground pieces as quad + maps for phones.
- Baked pieces: `assets/models/modular-village-baked/<Piece>/model.glb` + `color.png`, `normal.png`, `ao.png`, `spec.png` (glb references them). Rebake: `node tools/bake-village.mjs`.
- mesh-bake: `papit.type` is `node` so `src/bin.ts` builds to `lib/bin.js` (browser type fails on `node:` imports); `lib/bundle.js` stays browser safe (bin is not exported from index).
