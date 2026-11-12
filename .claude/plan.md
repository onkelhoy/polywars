# Plan: M1 assets + browser

## Where we are
`main`. Grass done (`@polywar/grass`, open bits in backlog). City: `.claude/plan-city.md` tasks 1-17 done, READMEs in `packages/generators/city*`. Baking tasks b3-b4 paused. Git LFS question for the .blend files still open.

## Facts
- Blender 5.2 headless. Scripts in `tools/blender/` (`lib/pw.py`, `lib/gun_rig.py`, `export.py`, `packs/ww2_weapons.py`).
- `npm run assets [-- --all]`: exports `.blend` → `.glb` (when stale) + writes `assets/manifest.json`.
- Pack script keeps existing files (hand edits); `--force` or delete one file to regenerate it.
- Guns: muzzle +Y Blender (glTF -Z), up +Z. Bones: root > body > action, trigger, hammer?, mag > round, muzzle, eject. Moving parts = vertex groups in `gun.blend`. Actions: idle, fire, reload, reload-empty.
- `game-mesh` has no textures → `export.py` bakes image textures into vertex colours.
- Render code (Renderer, Model, Grid, gltfFromMesh) lives in `packages/stage/3d-asset-preview/src/render`, exported by `@polywar/3d-asset-preview`.
- Dev server treats folders named `asset`/`assets`/`public` as raw assets: never name a package that.

## Tasks
Restructure + materials (confirmed 2026-11-12, branch `restructure-materials`):
- r1. [x] Folders: stage/ (3d-demo, 3d-asset-preview, gallery), render/materials/ (textured), generators/, tools/, ui/, network/. Table in CLAUDE.md.
- r2. [x] 3d-demo: direction arrow bottom-left, `axes` attribute + bar button.
- r3. [ ] 3d-asset-preview: in-memory mesh + maps.
- r4. [ ] mesh-bake view on 3d-asset-preview: load shows mesh, settings, big bake button.
- r5. [ ] Grass shaders into `render/materials/grass`, grass generator uses it.
- r6. [ ] Materials view: pw-gallery, one tile per material, click opens preview.
8. [ ] `@papit/static`: serve root `assets/` on GitHub Pages (check, report if papit lacks it).

## Medieval buildings + baked surfaces (confirmed 2026-11-11)
Goal: buildings like the store screenshots (gables, jetties, timber frame), flat stone/ground pieces as quad + maps for phones.
- Baked pieces: `assets/models/modular-village-baked/<Piece>/model.glb` + `color.png`, `normal.png`, `ao.png`, `spec.png` (glb references them). Rebake: `node tools/bake-village.mjs`.
- mesh-bake: `papit.type` is `node` so `src/bin.ts` builds to `lib/bin.js` (browser type fails on `node:` imports); `lib/bundle.js` stays browser safe (bin is not exported from index).
- b3. [ ] `packages/render/materials/textured`: albedo + normal + spec + ao, maps optional, own view.
- b3b. [ ] mesh-bake GUI view: drop glb, live maps + lit preview, settings, download.
- b5. [ ] Generator massing: main volume, wing, lean-to, jetty.
- b6. [ ] Generator roofs: gable default, cross-gable, dormers, ridge/rake.
- b7. [ ] Generator facades: bays, aligned windows, timber frame rules.
- b8. [ ] Attachments + archetypes (cottage, townhouse, inn, mill, gatehouse).
- b9. [ ] Generator uses baked pieces, view shows triangle count.

## Later
- Vehicle parts from FBX are not assembled/rigged (artillery gun sits off its base). Vehicle scale is the pack's (tank ~2 m).

## Report to owner (papit)
- `@papit/create`: name starting with a digit gives an invalid class name (`3dAssetPreview`).
- `@papit/server`: package folder named `assets` is served raw (no CSS import rewrite).
- `@papit/web-component`: attribute bindings briefly pass `__marker__` as the value.
- `@papit/build`: a package `bin` entry gets bundled for the browser (fails on `node:` imports).
- `@papit/quaternion`: `writeMatrix(out, position)` and `fromAxisAngle(axis)` are typed `{x,y,z}` but read `[0],[1],[2]` (NaN with objects).
- `@papit/matrix`: static `Matrix4.multiply(a, b)` fails to type-check (`this` of `typeof Matrix4`); `multiply(Float32Array(16))` reads it as 16x1 (wrap in `Matrix4.create`); no point transform (`m.clone.multiply([x,y,z,1])` works).
- `@papit/game-engine`: `fps` walks on the ground only and `pan` is 2D (3d-demo has its own `fly` / `panZoom`); theme custom properties come back unresolved (`light-dark()`), read a resolved colour instead.
- `@papit/game-engine`: no lit mesh renderer (polywar keeps `Renderer` in 3d-asset-preview); `Layer3D.createProgram` keeps the shader objects after linking.
