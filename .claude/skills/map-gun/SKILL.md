---
name: map-gun
description: Map a gun the owner rigged in Blender (assets/models/weapons/guns/<id>/<id>.model.blend) into the game - check clips, keep colours (wood / metal), export the glb, write the `animation` block of its weapon.json, wire it. Use when the owner says they fixed / rigged / saved a gun.
---

# Map a gun

Owner rigs + animates in Blender; we export and map.
Files per gun folder `assets/models/weapons/guns/<id>/`: `<id>.model.blend`, `<id>.model.glb`, `<id>.weapon.json`. Never edit the owner's animations; ask if something is missing.

## 1. Inspect the .blend
`Blender -b <blend> --python <script>` (Blender: `/Applications/Blender.app/Contents/MacOS/Blender`). Print:
- actions: name, frame range, which bones really move (keys differ). Blender 5 actions: fcurves under `a.layers[].strips[].channelbags[].fcurves`.
- materials: name, node types, base colour; mesh material slots.
- armature bones, `exit.*` empties (muzzle / shell).
Report to the owner: clips found, bones without clips, anything odd (empty actions, overwritten clips). Unused clips: `NOT-USED*` (left out on export).

## 2. Colours
Target: **two materials, `wood` and `metal`** (Principled BSDF). Later: one material each + a tiny palette texture (UV mapped).
- `tools/blender/packs/gun-clips.py` turns Diffuse BSDF into Principled (glTF drops Diffuse) and gives default grey `wood` / `metal` their colour.
- More than 2 materials: tell the owner (don't merge silently).
- Check after export: every glb material has `baseColorFactor`.

## 3. Export
`Blender -b <blend> --python tools/blender/packs/gun-clips.py -- --no-shoot` (`--no-shoot` when the owner made `shoot`). It copies the blend to `original.blend` first, keeps every action (fake user, no NLA tracks), saves the blend and writes `<id>.model.glb` (skin + all clips).
Check the glb: skin joints, animation names.

## 4. `animation` in <id>.weapon.json
Per gun timing lives in the `animation` property of the gun's weapon.json, not in player code. Frames at the blend's fps (write `fps`).
```json
"animation": {
  "fps": 24,
  "shoot": { "clip": "shoot", "eject": 4 },
  "cycle": { "clip": "cycle", "open": 10, "eject": 12, "close": 30 },
  "reload": [
    { "clip": "eject-mag", "share": .35 },
    { "hold": "eject-mag", "share": .2 },
    { "clip": "insert-mag", "to": 9, "share": .45, "cues": { "mag-in": 4, "bolt-close": 9 } }
  ],
  "toggles": {
    "sight": { "key": "v", "clip": "ironscope" },
    "stock": { "key": "b", "clip": "foldstock" }
  },
  "empty": "empty-mag"
}
```
- frame 0 of `shoot` = the shot.
- `share`: part of the reload time; `from` / `to`: frames; `reverse: true` plays backwards.
- toggle: one `clip` (forward on, backward off) or `on` / `off` pair.
- `empty`: pose layered when the gun has 0 rounds.
Ask the owner for anything you can't read off the clips (which frame the shell flies, the mag clicks).

## 5. Wire + check
- <id>.weapon.json: `sounds` set exists under `assets/audio/effects/weapons/` (else the gun is silent), `points` present (else `tools/blender/packs/weapon-points.py`).
- Owner's empties `exit.bullet` / `exit.barrel` (muzzle, bullet out along its -z / bore) and `exit.shell` (case out): read them into weapon.json `points.muzzle` / `points.eject` (they win over guessed points). Missing: ask.
- `packages/play/weapons/src/specs.ts` has the gun.
- Toggled / layered clips only move their own bones (`Model.layer`).
- Tell the owner what to try in the shooting range.
