# @polywar/grass-material

Grass material for WebGL2: tuft and ground shaders, wind / sway / push, patches, toon light, cloud shadows, generated sprites.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-materials-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/grass-material.svg?logo=npm)](https://www.npmjs.com/package/@polywar/grass-material)

---

## installation

```bash
npm install @polywar/grass-material
```

## usage

```js
import { GrassMaterial, GrassPatch, GRASS_LOOK, GRASS_LOOKS } from "@polywar/grass-material";

// the material: your geometry, its shaders, noise and sprites
const material = new GrassMaterial(layer, { color: "#5d9a3a", bands: 3 });
if (material.useTufts(camera, light, time)) { /* bind your tuft vao, drawArraysInstanced */ }
if (material.useGround(camera, light, time)) { /* draw your floor */ }

// the material alone: a round patch (fits pw-3d-asset-preview `scene` and gallery items)
preview.scene = layer => new GrassPatch(layer, GRASS_LOOKS.dry);
```

Tuft attributes: 0 position (base y 0, height 1), 1 normal, 2 uv (v 0 at the root), 4 instance `x y z scale`. Ground: 0 position.
`GrassLook` holds every setting (size, colours, patches, accents, wind, sway, push, clouds or `null`, toon bands, pixel style, pushers, distance).
`@polywar/grass` (the generator) plants, chunks and culls tufts with this material.

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
