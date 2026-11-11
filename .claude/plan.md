# Plan: M1 assets + browser

## Where we are
Plan drafted, waiting on owner confirm.

## Facts
- Blender 5.2 at `/Applications/Blender.app`. Headless scripts → `tools/blender/` (only reusable ones).
- `game-mesh` loads glTF only → runtime format `.glb`. FBX/OBJ converted by Blender script.
- Engine camera has `fps`, `orbit`, `pan`, `zoom` controllers. Use them.
- WW2 weapons `.blend`: 7 guns (M1 Garand, M1911, Mauser C96, PPSH 41, STG 44, Thompson M1, TT Pistol) each with mag/clip, 5 ammo types (bullet+case), 2 knives, 3 grenades. No rigs, no actions. No Springfield gun, only 30-06 Springfield ammo (Garand).

## Asset layout
```
assets/
  models/guns/<gun>/      gun.blend  mag.blend  model.blend (links parts, rig + actions)  model.glb
  models/ammo/<calibre>/  bullet.blend  case.blend  model.glb   (shared, guns link it)
  models/knives/<name>/   grenades/<name>/
  models/vehicles/<ww2-tank|ww2-truck|...>/  parts + texture + model.glb
  models/village/modular/ <piece>.glb  (+ source .obj)
  audio/songs/menu/  audio/songs/game/
  manifest.json (generated)
tools/blender/  split-pack.py, convert.py, export.py, rig-gun.py
```
Edit flow: open `bullet.blend`, edit, save → `model.blend` picks it up via Blender library link → `npm run assets` re-exports `.glb`.

## Tasks
1. [ ] Copy songs from arrow-warfare → `audio/songs/menu` + `audio/songs/game`.
2. [ ] `tools/blender/split-pack.py`: weapons pack → per gun/ammo/knife/grenade `.blend` files, origins + scale fixed.
3. [ ] `tools/blender/convert.py`: FBX/OBJ → `.glb`. Run on WW2 tank, truck, motorcycle, fighter, bomber, Modular Village (keep sources next to it).
4. [ ] `tools/blender/rig-gun.py`: per gun `model.blend` linking gun/mag/ammo, armature (root, mag, bolt/slide, trigger, bullet, case), actions `idle`, `fire`, `reload`, `reload-empty`. Exported into `model.glb`.
5. [ ] `npm run assets`: runs export for changed `.blend`, writes `assets/manifest.json`.
6. [ ] `npm run create` → `packages/tools/asset-preview`: 3D (orbit/pan/zoom ↔ FPS toggle, light, grid, animation picker + play/scrub), audio player, image view.
7. [ ] `npm run create` → `packages/tools/assets`: gallery of everything from manifest, filter/search, opens preview.
8. [ ] Server serves root `assets/` in dev + `@papit/static` copies it (check, report if papit lacks it).

## Open questions
- Songs: which go to menu vs game? (default: arena/battle/guardians → game, tavern ones → menu)
- Branch `feature/assets` or `main`?
