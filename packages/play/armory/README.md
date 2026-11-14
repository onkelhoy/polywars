# @polywar/armory

Weapon asset data: weapon.json / scope.json (sight, hand, muzzle, eject, mount points), allowed scopes, a scope fitted on a gun.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/armory.svg?logo=npm)](https://www.npmjs.com/package/@polywar/armory)

---

## Files

- `assets/models/weapons/guns/<id>/weapon.json`: `action`, `sounds` (folder under `assets/audio/effects/weapons/`), `scopes` (ids that fit), `points` (glTF model space, metres: `muzzle`, `front` / `rear` sight, `trigger`, `grip`, `fore`, `eject`, `mount`).
- `assets/models/weapons/attachments/<id>/scope.json`: `zoom` [min, max], `points` (`eyepiece`, `objective`, `mount` = under the rings).

Made by `tools/blender/packs/rifles.py` (import), `weapon-points.py` (points guess, hand edits win), `tools/weapons/meta.mjs` (action / scopes / sounds). Check points with `tools/blender/packs/grid-shot.py`.

## Use

```ts
const armory = new Armory("/assets");
const kar = await armory.weapon("kar98k"), scope = await armory.scope("scope-2");
const offset = scopeOffset(kar, scope);          // scope model space -> gun model space
const eye = onGun(scope.points.eyepiece, offset);
gallery.items = await armory.items();             // every gun, every gun + scope (ArmedGun drawables)
```

View `armory`: the weapons only gallery.

## installation

```bash
npm install @polywar/armory
```

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
