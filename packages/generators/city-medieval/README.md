# @polywar/city-medieval

Medieval houses from the Modular Village kit: seeded, every setting visible.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-generators-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/city-medieval.svg?logo=npm)](https://www.npmjs.com/package/@polywar/city-medieval)

---

## installation

```bash
npm install @polywar/city-medieval
```

## usage

```js
import { building, DEFAULTS, encode, medievalStyle, kitSource } from "@polywar/city-medieval";
const house = building({ ...DEFAULTS, floors: [2, 3], windmill: "on" }, 42); // { pieces: {piece, matrix}[], features }
```

Same settings + seed = same house. Pieces are Modular Village kit names with a column-major matrix (may contain scale); `compose(pieces, kitSource(base))` turns them into one GLTF. `medievalStyle(source)` is the `@polywar/city` style (houses, streets, squares).

Cells are 1 m, Y up, main box at x 0..w-1, z 0..d-1, ridge along x, front door on +Z.
Pipeline (`building.ts`): `massing` (boxes) -> `walls.plan` (faces, bays, door) -> feature `plan` -> `walls` -> `roof` per box -> feature `build`. Each feature lives in `src/features/` as `{ name, key, fits, plan, build }` with its own `rng.fork`, so toggling one does not reshuffle the others.

## settings

| key | values | effect |
| --- | --- | --- |
| width, depth, floors | `[min, max]` | main box footprint (depth rounded to even) and storeys (2 m each) |
| shape | rect, L, T, random | L/T add a wing behind the main box, crossing roofs |
| roof | Straight, Convex, Concave, random | roof tile profile |
| windows | Single, Double, Rounded, random | window family |
| timber | tri | beams, posts, braces, king post |
| stone | tri | stone ground storey + stone doorway |
| chimney | tri | stone chimney on the back slope, stove pipe on small houses |
| bay | tri | dormers on the eave row (only under roofs >= 2.7-3.2 m) |
| jetty | tri | upper storeys of a gable stand out .5 m on brackets |
| tunnel | tri | arched passage through the house (floors >= 2, width >= 6) |
| windmill | tri | sails on a gable, house becomes a tower |
| waterwheel | tri | wheel + flume on a gable or the back |
| balcony | tri | upper-storey doorway with wooden balcony |
| awning | tri | cloth awning over the door or a ground window run |
| props | tri | barrels, crates, hay, broom, ladder, lamp, sign, cart |
| ground | tri | stone paving round the house, path, tunnel floor |

tri = `off` / `on` / `random` (chance in `CHANCE`, default .5). A feature that does not fit is reported `false` in `features`.

## code

`encode(settings, seed)` -> `m2.<seed>.<width depth floors min/max>.<shape roof windows>.<tris base 3>` (base 36). `decode` reads it back.

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
