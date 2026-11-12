# Plan: M1 assets + browser

## Where we are
On `main`, task 8 next. `@polywar/renderer` + `@polywar/shading` done (materials gallery). Grass done (`@polywar/grass`, open bits in backlog). City: `.claude/plan-city.md` tasks 1-17 done, READMEs in `packages/generators/city*`. Baking tasks b3-b4 paused. Git LFS question for the .blend files still open.

## Facts
- Blender 5.2 headless. Scripts in `tools/blender/` (`lib/pw.py`, `lib/gun_rig.py`, `export.py`, `packs/ww2_weapons.py`).
- `npm run assets [-- --all]`: exports `.blend` → `.glb` (when stale) + writes `assets/manifest.json`.
- Pack script keeps existing files (hand edits); `--force` or delete one file to regenerate it.
- Guns: muzzle +Y Blender (glTF -Z), up +Z. Bones: root > body > action, trigger, hammer?, mag > round, muzzle, eject. Moving parts = vertex groups in `gun.blend`. Actions: idle, fire, reload, reload-empty.
- `game-mesh` has no textures → `export.py` bakes image textures into vertex colours.
- Render code (Renderer, Model, Grid, gltfFromMesh) is `@polywar/renderer` (`packages/render/renderer`); shading styles + preview ball are `@polywar/shading`.
- Dev server treats folders named `asset`/`assets`/`public` as raw assets: never name a package that.

## Tasks
