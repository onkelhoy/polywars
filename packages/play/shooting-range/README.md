# @polywar/shooting-range

Shooting range: the model (glb + range.json points), ground, colliders, bullet hits and gun stands.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/shooting-range.svg?logo=npm)](https://www.npmjs.com/package/@polywar/shooting-range)

---

## installation

```bash
npm install @polywar/shooting-range
```

## usage

```js
const range = await ShootingRange.load();            // asset /shooting-range/range.json
const model = await Model.load(gl, range.model);     // /shooting-range/model.glb
new Player(layer, renderer, { ground: range.ground, colliders: range.colliders, cast: range.cast, surface: range.surface, ... }, range.spawn);
range.standNear(x, z);                               // gun case in reach, or -1
```

`hit.target` is the scored `Target` (`name`, `distance`) when a target board / moving target is hit.

## the model

Made in Blender (`~/Developer/3d/shooting-range/model.blend`). Export after editing:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --disable-autoexec ~/Developer/3d/shooting-range/model.blend -P tools/blender/packs/shooting-range.py
```

Writes `asset/shooting-range/model.glb` + `range.json` (ground triangles, solid boxes, gun stands, targets, spawn). Roles come from object names (`ROLES` in the script): ground, stand (gun case), target, steps (stairs: a box per step), hollow (a box per face), else solid (a box per loose part). The .blend is never saved.

## views

- `range`: walk the range, shoot, F takes the gun floating over the case in front of you.

## License

Licensed under the @Papit License 1.0 - Copyright (c) 2024 Henry Pap (@onkelhoy)

**Key points:**

- ✅ Free to use in commercial projects
- ✅ Free to modify and distribute
- ✅ Attribution required
- ❌ Cannot resell the component itself as a standalone product

See the [LICENSE](https://github.com/onkelhoy/papit/blob/main/LICENSE) file for full details.

## Related Components

- [@papit/web-component](https://github.com/onkelhoy/papit/tree/main/packages/web/engines/web-component): Core utilities, decorators, and base component class
