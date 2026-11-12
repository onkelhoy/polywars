# Plan: M1 assets + browser

## Where we are
`restructure-materials` branch (fixes f1-f7 next). Grass done (`@polywar/grass`, open bits in backlog). City: `.claude/plan-city.md` tasks 1-17 done, READMEs in `packages/generators/city*`. Baking tasks b3-b4 paused. Git LFS question for the .blend files still open.

## Facts
- Blender 5.2 headless. Scripts in `tools/blender/` (`lib/pw.py`, `lib/gun_rig.py`, `export.py`, `packs/ww2_weapons.py`).
- `npm run assets [-- --all]`: exports `.blend` → `.glb` (when stale) + writes `assets/manifest.json`.
- Pack script keeps existing files (hand edits); `--force` or delete one file to regenerate it.
- Guns: muzzle +Y Blender (glTF -Z), up +Z. Bones: root > body > action, trigger, hammer?, mag > round, muzzle, eject. Moving parts = vertex groups in `gun.blend`. Actions: idle, fire, reload, reload-empty.
- `game-mesh` has no textures → `export.py` bakes image textures into vertex colours.
- Render code (Renderer, Model, Grid, gltfFromMesh) lives in `packages/stage/3d-asset-preview/src/render`, exported by `@polywar/3d-asset-preview`.
- Dev server treats folders named `asset`/`assets`/`public` as raw assets: never name a package that.

## Tasks
Fixes + material styles (confirmed 2026-11-12, branch `restructure-materials`; r1-r6 done: folders, 3d-demo axes, preview pixel maps/keep-view/`scene`, mesh-bake bake button, `@polywar/grass-material` + `GrassPatch`, gallery `material` kind + view `materials`):
- f1. [x] Grass density: over `maxTufts` it fills rows then stops (bare strip). Thin evenly instead (lower effective density in `place.ts`), show "capped" in the view info.
- f2. [x] Grass defaults: medium = owner's code `density 47, distance 42, sizeScale 1.55, framerate 7 (pixel style), shape mixed`; low/high scaled alike.
- f3. [x] Clouds: view sliders for speed, direction, contrast, threshold, height, diverge (only scale/min now); default speed faster (.01 ≈ 0.4 m/s, looks frozen).
- f4. [x] 3d-demo pivot: `panZoom.start` sets pivot to the ground hit (`controllers.ts`), so `look(from, to)` orbits the wrong point. Pivot = `to`. Preview already centres the mesh (bbox), so it then orbits the mesh centre.
- f5. [x] 3d-demo `pan="ground | screen"`: screen = pan in the view plane (up/down too). 3d-asset-preview (so mesh-bake) uses screen.
- f6. [x] Origin dot (yellow, black border, Blender-like) in 3d-demo, toggle in bar, settable position; preview puts it on the asset's own origin.
- f7. [ ] Materials gallery with shading styles: Renderer/Model/Grid out of 3d-asset-preview into `packages/render/`; its shading as materials (lit, toon 2/3 bands, unlit, normal-mapped); each material on a Blender-like preview ball (grass keeps its patch). Water etc. later as `render/materials/*`. Gallery view: `packages/stage/gallery` view `materials`.
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
