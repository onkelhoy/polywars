# @polywar/mesh-bake

Bakes a relief mesh into one quad plus colour, normal, ambient occlusion and spec maps. Core for node and browser, CLI and GUI.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-tools-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/mesh-bake.svg?logo=npm)](https://www.npmjs.com/package/@polywar/mesh-bake)

---

## installation

```bash
npm install @polywar/mesh-bake
```

## GUI (view `experiment`)

Drop a .glb (or `#/assets/…/piece.glb` in the url): the mesh shows right away in `pw-3d-asset-preview` (3d-demo camera, direction arrows, light panel).
Pick settings, hit **bake**: maps, lit preview (baked quad repeated, original, or both) and downloads (`model.glb`, folder .zip).
Changing settings after a bake turns the button orange: bake again to see them.

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
