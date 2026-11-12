# Plan: M1 assets + browser

## Where we are
Branch `feat/character`: restructure done (folders below), next: "Next tasks". Older note: On `main`, task 8 next. `@polywar/renderer` + `@polywar/shading` done (materials gallery). Grass done (`@polywar/grass`, open bits in backlog). City: `.claude/plan-city.md` tasks 1-17 done, READMEs in `packages/generators/city*`. Baking tasks b3-b4 paused. Git LFS question for the .blend files still open.

## Facts
- Blender 5.2 headless. Scripts in `tools/blender/` (`lib/pw.py`, `lib/gun_rig.py`, `export.py`, `packs/ww2_weapons.py`).
- `npm run assets [-- --all]`: exports `.blend` → `.glb` (when stale) + writes `assets/manifest.json`.
- Pack script keeps existing files (hand edits); `--force` or delete one file to regenerate it.
- Guns: muzzle +Y Blender (glTF -Z), up +Z. Bones: root > body > action, trigger, hammer?, mag > round, muzzle, eject. Moving parts = vertex groups in `gun.blend`. Actions: idle, fire, reload, reload-empty.
- `game-mesh` has no textures → `export.py` bakes image textures into vertex colours.
- Render code (Renderer, Model, Grid, gltfFromMesh) is `@polywar/renderer` (`packages/ui/viewport/renderer`); shading styles + preview ball are `@polywar/shading`.
- Dev server treats folders named `asset`/`assets`/`public` as raw assets: never name a package that.

## Tasks
8. [ ] `@papit/static`: serve root `assets/` on GitHub Pages (check, report if papit lacks it).

## Character rig (confirmed 2026-11-12)
Goal: base humanoid rig (Blender editable, IK controls), basic clips, bones drawn like Blender, clip/frame picking in preview + gallery.
- Per character: `assets/models/characters/<name>/model.blend` → `model.glb` + `model.rig.json` (written by export.py: lengths, IK, copy rotation, deform) + hand written `character.json` (skins, sockets, parts, weapons later).
- papit gap: glTF bones point +Y, armature +X, `rig(gltf)` lengths 0 → papit IK can't run on glTF rigs. `@polywar/skeleton` converts (+X, real lengths).
- Done: base rig + clips (`tools/blender/lib/human_rig.py`), rig.json export, `@polywar/skeleton` (rig, IK, `RigGizmo` bone drawing, view `ik`), preview bones / IK / mesh toggles for any `Skeleton` skin, gallery clip picker (any case).
- Notes: Blender check scripts live in the session only; `npm run assets` exports base. Limb bones are rolled to face their pole (Blender pole angle 90) so Blender and the runtime IK match (< 0.02).

## Layout (2026-11-12)
`animation/skeleton` · `library/{catalog (@polywar/assets), materials/*, grass, city, building-builder}` · `ui/game/*` · `ui/viewport/{3d-demo, 3d-asset-preview, gallery, renderer}` · `network/*` · `tools/mesh-bake`.
`npm run assets` serves `library/catalog` view `all`. Folder `catalog` (not `assets`: the dev server serves such folders raw).

## Next tasks
- n1. [ ] `@polywar/characters` (`packages/library/characters`): one package for all characters: base rig specs (humanoid now), `character.json` loader (sockets, parts, skins), view.
- n2. [ ] Skeleton view: click a bone, drag it (FK rotate / move IK targets) to play with the pose.
- n3. [ ] Animal rigs: the farm pack glbs have a skin + clips (Idle, Walk, Run, ...) but bones show scattered: node scale (unsupported in papit `rig()` and `Skeleton`). Fix in Skeleton, then base rigs quadruped (cow) and biped (chicken).
- n4. [ ] Guns in the catalog: show their rig bones (gun_rig.py), check clips.
- n5. [ ] Bone map for downloaded humanoid models (Mixamo etc.) onto the base rig, once the owner has one.
- n6. [ ] Weapons come alive (sniper scope, fire anims, flash, bullet, shell), FPS arms on hand IK; per weapon later.

## Medieval buildings + baked surfaces (confirmed 2026-11-11)
Goal: buildings like the store screenshots (gables, jetties, timber frame), flat stone/ground pieces as quad + maps for phones.
- Baked pieces: `assets/models/modular-village-baked/<Piece>/model.glb` + `color.png`, `normal.png`, `ao.png`, `spec.png` (glb references them). Rebake: `node tools/bake-village.mjs`.
- mesh-bake: `papit.type` is `node` so `src/bin.ts` builds to `lib/bin.js` (browser type fails on `node:` imports); `lib/bundle.js` stays browser safe (bin is not exported from index).
- b3. [ ] `packages/library/materials/textured`: albedo + normal + spec + ao, maps optional, own view.
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
- `@papit/game-mesh`: `rig(gltf)` bones get length 0 and point along +Y (glTF) while `armature` bones point +X, so papit IK can't run on glTF rigs (`@polywar/skeleton` converts). glTF `extras` are dropped. `SKINNING_GLSL` caps at 64 joints (Mixamo with fingers is ~65).
- `@papit/armature`: IK turns chain bones the shortest way, so twist drifts and a knee's hinge axis leaves the bend plane (Blender keeps it on the root/target/pole plane); `@polywar/skeleton` corrects it.
- `@papit/web-component`: a re-render builds the template's custom elements again and runs `firstRender` on the detached copies (pw-3d-asset-preview now guards; character-preview creates its preview outside the template).
- `@papit/game-engine`: no lit mesh renderer (polywar has `@polywar/renderer`); `Layer3D.createProgram` keeps the shader objects after linking.
