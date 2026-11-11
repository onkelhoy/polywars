# Plan: M1 assets + browser

## Where we are
Branch `city-generation-village-pack` (`init/assets` merged to `main`). Next: owner answers Git LFS for the ~150 MB of copied .blend files (not committed yet), then task 8.

## Facts
- Blender 5.2 headless. Scripts in `tools/blender/` (`lib/pw.py`, `lib/gun_rig.py`, `export.py`, `packs/ww2_weapons.py`).
- `npm run assets [-- --all]`: exports `.blend` → `.glb` (when stale) + writes `assets/manifest.json`.
- Pack script keeps existing files (hand edits); `--force` or delete one file to regenerate it.
- Guns: muzzle +Y Blender (glTF -Z), up +Z. Bones: root > body > action, trigger, hammer?, mag > round, muzzle, eject. Moving parts = vertex groups in `gun.blend`. Actions: idle, fire, reload, reload-empty.
- `game-mesh` has no textures → `export.py` bakes image textures into vertex colours.
- Render code (Renderer, Model, Grid, gltfFromMesh) lives in `packages/ui/3d-asset-preview/src/render`, exported by `@polywar/3d-asset-preview`.
- Dev server treats folders named `asset`/`assets`/`public` as raw assets: never name a package that.

## Tasks
1. [x] Songs → `audio/songs/menu` + `audio/songs/game`.
2. [x] WW2 weapons pack → per gun/ammo/knife/grenade `.blend` files.
3. [x] `convert` FBX/OBJ → `.blend` + `.glb`: WW2 tank, truck, motorcycle, fighter, bomber, Modular Village (156 OBJ).
4. [x] Gun rigs + generated actions (in `model.blend`, exported into `model.glb`).
5. [x] `npm run assets`.
6. [x] `packages/ui/3d-asset-preview` (`pw-3d-asset-preview`): turntable / orbit (+ right/shift drag pan) / FPS, animation picker, play/pause, scrub, toon, grid.
7. [x] gallery (now task 9): every asset, one shared canvas for 3D tiles, audio players, images, filter + search, click opens preview.
9. [x] Generic gallery: rename `asset-gallery` → `packages/ui/gallery` (`pw-gallery`).
   - `location` (default `/assets`): reads `<location>/manifest.json`, headings per folder (h2 top folder, h3 rest).
   - `items` property: extra/generated entries `{ name, group, kind, src? | gltf? | mesh? }`, e.g. generated buildings. `location=""` shows items only.
   - manifest generator ships with the package (`bin/manifest.mjs`, not a package `bin`: @papit/build bundles it for the browser), works on any folder.
   - `pw-3d-asset-preview` gets a `gltf` property so generated items open in the preview too.
   - views: `experiment` (root assets), `generated` (procedural houses via `items`).
10. [x] All store packs copied (`tools/blender/packs/store.mjs`): nature, farm animals, farm buildings, castle, dungeon, vehicles, modular-village. Materials normalised to one Principled output on export.
11. [x] Manifest is an `Assets` tree (`{ name, assets: (Asset | Assets)[] }`); gallery takes `tree`; `npm run assets` ends serving the gallery (view `everything`).
8. [ ] `@papit/static`: serve root `assets/` on GitHub Pages (check, report if papit lacks it).

## Medieval buildings + baked surfaces (confirmed 2026-11-11)
Goal: buildings like the store screenshots (gables, jetties, timber frame), flat stone/ground pieces as quad + maps for phones.
- Baked pieces: `assets/models/modular-village-baked/<Piece>/model.glb` + `color.png`, `normal.png`, `ao.png`, `spec.png` (glb references them). Rebake: `node tools/bake-village.mjs`.
- mesh-bake: `papit.type` is `node` so `src/bin.ts` builds to `lib/bin.js` (browser type fails on `node:` imports); `lib/bundle.js` stays browser safe (bin is not exported from index).
- b1. [x] `tools/bake.mjs` (`npm run bake`): glb + axis + size → quad glb + albedo/normal/spec.
- b2. [x] Bake cobblestone, dirt transitions, stone floors, stone walls.
- b3. [ ] `packages/material/textured`: albedo + normal + spec + ao, maps optional, own view.
- b3a. [x] `packages/tools/mesh-bake` (moves to papit later: no `@polywar/*` runtime deps, no village specifics): core (node + browser), CLI (`npm run bake`), ao as own map. `tools/bake.mjs` removed, `tools/bake-village.mjs` stays (game's piece list).
- b3b. [ ] mesh-bake GUI view: drop glb, live maps + lit preview, settings, download.
- b4. [ ] Preview + gallery draw maps.
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
