# @polywar/ssao

Screen space ambient occlusion pass for WebGL2: depth only, normals rebuilt from depth, half res, blurred, multiplied over the frame.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-viewport-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/ssao.svg?logo=npm)](https://www.npmjs.com/package/@polywar/ssao)

---

## installation

```bash
npm install @polywar/ssao
```

## usage

```js
import { SSAO } from "@polywar/ssao";

const ao = new SSAO(layer, { radius: .5, strength: 1 }); // programs from the layer (async, `ao.ready`)
ao.begin();                       // the frame goes offscreen (multisampled like the canvas)
renderer.begin(camera, clear);    // draw as usual, any WebGL2 drawing works
renderer.draw(mesh, matrix);
ao.end(camera);                   // AO from depth, frame times AO into the canvas, depth written back
```

Options (`ao.options`, live): `radius` metres, `strength` 0..1, `power`, `bias` metres, `samples` 1..16, `scale` AO resolution (.5 = half), `fade` [start, end] metres, `debug` shows the AO alone. View: `views/experiment`.

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
