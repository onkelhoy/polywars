# @polywar/clouds

Low poly painted clouds and skies, drawn as smoke lobes.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/clouds.svg?logo=npm)](https://www.npmjs.com/package/@polywar/clouds)

---

## installation

```bash
npm install @polywar/clouds
```

## Usage

```ts
import { Smoke } from "@polywar/smoke";
import { Clouds } from "@polywar/clouds";

const smoke = new Smoke(layer), clouds = new Clouds(smoke);
clouds.cloud([0, 230, -1900], 380, { kind: "cumulus", density: .2, lean: .5 });
clouds.sky([0, 0, 0], { count: 14, cover: .3 });   // a scattered mix
```

- Kinds: `cumulus` (tower), `fair` (small), `bank` (wide, low), `overcast` (grey layer).
- Skeleton masses per kind, a core + few big 20 face lobes on each mass's upper surface, flat bottom line, lit leaned to the mass centre (`smoke.look.skyShade`).
- Any `PuffSink` (`place(at, radius, options)`) works; smoke draws and drifts them with its wind.

View `experiment`.

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
