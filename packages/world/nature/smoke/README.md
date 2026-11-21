# @polywar/smoke

Stylized toon smoke: puffs that burst, billow, stretch into wisps and shrink out. Campfire, exhaust, ground blasts.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/smoke.svg?logo=npm)](https://www.npmjs.com/package/@polywar/smoke)

---

## installation

```bash
npm install @polywar/smoke
```

## Usage

```ts
const smoke = new Smoke(layer, { ground: (x, z) => height(x, z) });
smoke.burst("puff", at, { scale: 1 });
const fire = smoke.emitter("campfire", at);        // move / rate / stop
smoke.place(at, 40, { centre });                     // a still puff
smoke.update(dt); smoke.draw(camera);
```

- Presets `campfire`, `exhaust`, `dust`, `puff`; any `Preset` works. Explosions live in `@polywar/explosion`.
- `look` is live (sun, wind, shade, highlight, detail, thickness, reach, swirl).

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
