# @polywar/renderer

WebGL2 renderer for game-mesh meshes and glTF: one light (sun, hemisphere, lamp, fog, toon), skins, maps, line grid.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-browser-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/renderer.svg?logo=npm)](https://www.npmjs.com/package/@polywar/renderer)

---

## installation

```bash
npm install @polywar/renderer
```

## usage

```js
import { Renderer, Model, Grid, gltfFromMesh } from "@polywar/renderer";

const renderer = new Renderer(layer);            // programs come from the layer (async, `renderer.ready`)
renderer.light.toon = 3;                         // sun, hemisphere ambient, one lamp, fog; colours linear
renderer.begin(camera, [0, 0, 0, 1]);            // clear + camera
renderer.draw(gpuMesh, matrix, { tint, unlit, maps, joints });
const model = new Model(gl, await loadGLTF(url)); // glTF with skins, animations and maps (@polywar/textured)
model.pose("fire", time); model.draw(renderer, matrix);
new Grid(gl, 20).draw(renderer);
```

`Drawable` / `Scene`: anything that draws itself with its own shader (materials), what `pw-3d-asset-preview` and `pw-gallery` show.
View `experiment`: lit shapes, toon and lamp sliders.

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
