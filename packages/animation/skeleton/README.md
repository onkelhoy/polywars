# @polywar/skeleton

glTF skin as a @papit/armature rig (+X bones, real lengths), IK and copy rotation from rig.json, clip sampling and blending, joint matrices.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-animation-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/skeleton.svg?logo=npm)](https://www.npmjs.com/package/@polywar/skeleton)

---

## installation

```bash
npm install @polywar/skeleton
```

## usage

```js
import { Model } from "@polywar/renderer";
import { Skeleton } from "@polywar/skeleton";

// loads <model>.rig.json next to the .glb when there is one
const model = await Model.load(gl, "/assets/models/characters/base/model.glb", { skin: Skeleton.skin });
const skeleton = model.skin;

model.pose("walk", time);          // rest + clip + FK + IK + copy rotation + joint matrices
skeleton.ikEnabled = false;         // pure FK (what the clip baked)
skeleton.setIK("forearm.R", 1);     // arm IK on, e.g. a hand on a weapon

// by hand: blend clips, move IK targets, then update
skeleton.reset();
skeleton.sample(walk, t);
skeleton.mix(run, t, .3);
skeleton.armature.find("foot.ik.L").offset[2] += .1;
skeleton.update();                  // -> skeleton.matrices for the skin shader
```

## what it does

- glTF bones point along +Y, `@papit/armature` bones along +X, and `rig()` from `@papit/game-mesh` gives them length 0, so papit IK can't work on them. `Skeleton` builds the armature turned onto +X (local `C⁻¹ r C`, offsets `C⁻¹ t`) with lengths from `rig.json` (else the distance to a child straight along the bone) and puts `C⁻¹` into the bind matrices. FK matches `rig()` exactly.
- `rig.json` (written by `tools/blender/export.py`): `bones` (length, deform), `ik` (bone, chain, target, pole, weight), `copyRotation` (bone, target, weight).
- IK twist: papit turns chain bones the shortest way, so their twist drifts. Each chain bone keeps its rest relation to the plane (chain root, target, pole), like Blender. With limb rolls facing the pole (Blender pole angle 90) the result matches Blender's baked clip.
- Copy rotation: after IK, `bone` takes `target`'s world rotation (same rest orientation).

| member | |
| --- | --- |
| `armature`, `bones` (per joint), `nodes` (per glTF node) | the rig |
| `deform`, `ik` (by bone name), `copies` | what `rig.json` says |
| `pose(clip, time, loop?)` | rest + clip + `update()` |
| `reset()`, `sample(clip, t)`, `mix(clip, t, weight)`, `update()` | build a pose by hand |
| `ikEnabled`, `setIK(bone, weight)` | IK on/off, one IK's weight |
| `matrices` | one 4x4 per joint |
| `Skeleton.skin`, `Skeleton.rigFor(url)` | factory for `Model.load`, rig.json loader |

## bones (RigGizmo)

`new RigGizmo(gl).draw(renderer, skeleton, matrix * model.skeletonMatrix, { inFront, lines, selected, scale })`: Blender style octahedral bones, joint balls, dashed parent lines; IK bone yellow, chain pale yellow, target orange, pole blue, copy rotation green, controls purple. Works for any `{ armature, deform?, copies? }`. `pw-3d-asset-preview` uses it for its bones toggle. View (`views/`): the base rigs (humanoid, quadruped, biped) in `pw-3d-asset-preview`, with clips and posing.

## posing by hand (Poser)

`new Poser(skeleton)`: `press(x, y, project, ray)` selects a bone or grabs a handle, `drag(ray)`, `release()`, `apply()` after each `pose()` (edits stay over the clip), `clear()`. IK targets, poles, roots move (view plane, or X / Y / Z arrows); moving a target or pole turns its IK on. Other bones turn (around the view axis, or rings around their own X / Y / Z). `gizmo.handles(renderer, matrix, poser.handles(), poser.active)` draws the arrows and rings. `pw-3d-asset-preview` wires it up when bones are shown.
