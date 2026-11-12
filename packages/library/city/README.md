# @polywar/city

procedural city generator

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-generators-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/city.svg?logo=npm)](https://www.npmjs.com/package/@polywar/city)

---

## installation

```bash
npm install @polywar/city
```

## usage

```js
import { city, registerStyle } from "@polywar/city";
registerStyle(medievalStyle(kitSource(base)));
const { lots, streets, pieces } = city({ style: "medieval", seed: 1, radius: 2 });
```

Blocks are the quad cells of a papit irregular hex grid, streets run along the cell edges. Each block gets the biggest rectangle that fits inside its streets; it is cut into lots along its long sides (front and back row when deep enough), every lot facing its street. Empty blocks become squares.

The city knows nothing about pieces. A style (`CityStyle`) gives `build(lot, seed)` (house, front on the lot's +Z edge), optional `street(length, width, seed)` and `square(lot, seed)`, and `render(pieces)`.

| option | default | |
| --- | --- | --- |
| seed | 1 | |
| radius | 2 | hex radius in grid steps |
| block | 20 | block size in metres, about |
| street | 3 | street width |
| empty | .15 | chance a block is a square |
| lot | [5, 9] | lot width along the street |

Check without a browser: `node tools/blender/render-city.mjs out.jpg '{"seed":4,"radius":1}'`.

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
