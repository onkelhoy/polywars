# Plan: M1 assets + browser

## Where we are
Branch `init/assets` (shared with 2 other sessions: commit only own paths). Next: task 3 (vehicles + village), then 8.

## Facts
- Blender 5.2 headless. Scripts in `tools/blender/` (`lib/pw.py`, `lib/gun_rig.py`, `export.py`, `packs/ww2_weapons.py`).
- `npm run assets [-- --all]`: exports `.blend` → `.glb` (when stale) + writes `assets/manifest.json`.
- Pack script keeps existing files (hand edits); `--force` or delete one file to regenerate it.
- Guns: muzzle +Y Blender (glTF -Z), up +Z. Bones: root > body > action, trigger, hammer?, mag > round, muzzle, eject. Moving parts = vertex groups in `gun.blend`. Actions: idle, fire, reload, reload-empty.
- `game-mesh` has no textures → `export.py` bakes image textures into vertex colours.
- Dev server treats folders named `asset`/`assets`/`public` as raw assets: never name a package that.

## Tasks
1. [x] Songs → `audio/songs/menu` + `audio/songs/game`.
2. [x] WW2 weapons pack → per gun/ammo/knife/grenade `.blend` files.
3. [ ] `convert` FBX/OBJ → `.blend` + `.glb`: WW2 tank, truck, motorcycle, fighter, bomber, Modular Village (156 OBJ).
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
8. [ ] `@papit/static`: serve root `assets/` on GitHub Pages (check, report if papit lacks it).

## Report to owner (papit)
- `@papit/create`: name starting with a digit gives an invalid class name (`3dAssetPreview`).
- `@papit/server`: package folder named `assets` is served raw (no CSS import rewrite).
- `@papit/web-component`: attribute bindings briefly pass `__marker__` as the value.
- `@papit/build`: a package `bin` entry gets bundled for the browser (fails on `node:` imports).
