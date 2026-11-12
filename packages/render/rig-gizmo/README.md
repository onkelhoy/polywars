# @polywar/rig-gizmo

Draws an @papit/armature like Blender: see-through octahedral bones, joint balls, dashed parent lines, IK chains, targets and poles coloured.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-render-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/rig-gizmo.svg?logo=npm)](https://www.npmjs.com/package/@polywar/rig-gizmo)

---

## installation

```bash
npm install @polywar/rig-gizmo
```

## usage

```js
import { RigGizmo } from "@polywar/rig-gizmo";

const gizmo = new RigGizmo(gl);
renderer.begin(camera);
model.draw(renderer, matrix);
// armature space -> world: the model matrix * the skeleton's non-joint ancestors
gizmo.draw(renderer, skeleton, matrix.clone.multiply(model.skeletonMatrix), { inFront: true });
```

Draws any `@papit/armature` (`{ armature, deform?, copies? }`, a `@polywar/skeleton` fits) the way Blender shows octahedral bones:

- see-through octahedron per bone (head, square waist at 10%, tail), dark outline, a ball on every joint
- dashed line to a parent the bone isn't connected to
- IK: constrained bone yellow, its chain pale yellow, target orange, pole blue, dashed tip -> target and joint -> pole
- copy rotation green, other controls (non-deforming) purple, `selected` bones highlighted

| option | default | |
| --- | --- | --- |
| `inFront` | `true` | draw over the mesh |
| `lines` | `true` | outlines, parent and IK lines |
| `selected` | none | `Set<Bone>` drawn highlighted |
| `scale` | `1` | bone body thickness |

`gizmo.colors` holds the colours (linear RGBA). View `base-rig`: the base character with clips, mesh / bones / in front / IK toggles.
