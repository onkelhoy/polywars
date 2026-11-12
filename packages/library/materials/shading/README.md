# @polywar/shading

Shading materials on the renderer: lit, toon, unlit, normal-mapped, shown on a preview ball.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-material-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/shading.svg?logo=npm)](https://www.npmjs.com/package/@polywar/shading)

---

## installation

```bash
npm install @polywar/shading
```

## usage

```js
import { SHADINGS, ShadingBall } from "@polywar/shading";

preview.scene = layer => new ShadingBall(layer, SHADINGS["toon 3"]);       // pw-3d-asset-preview / gallery item `scene`
new ShadingBall(layer, { toon: 2, normal: "/x/normal.png", repeat: [4, 2], color: [.2, .4, .8] });
```

Styles (`SHADINGS`): `lit`, `toon 2`, `toon 3`, `unlit`, `normal mapped` (procedural bumps), `normal tiles` (procedural bricks).
A `Shading` is `{ toon?, unlit?, normal?, repeat?, color? }`; the ball is a uv sphere over a checker floor, lit by the light it is given.
Also exported: `uvSphere`, `checker`, `normalPixels`. View `experiment`: one style at a time with the light panel; all of them in the gallery view `materials`.

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
