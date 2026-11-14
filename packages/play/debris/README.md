# @polywar/debris

Spent shells and other small bits as @papit/rigidbody bodies: settle to static, capped, fade out.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/debris.svg?logo=npm)](https://www.npmjs.com/package/@polywar/debris)

---

## installation

```bash
npm install @polywar/debris
```

## Usage

```ts
import { World } from "@papit/rigidbody";
import { Debris, cylinderAlongZ } from "@polywar/debris";

const world = new World();                               // the shared physics world (props, guns tossed later)
const debris = new Debris({ world, ground: (x, z) => height(x, z), onland: (piece, speed, at) => clink(at) });
const { shape, local } = cylinderAlongZ(.063, .0063);   // a case model along -z -> a capsule
debris.spawn("case", { shape, local, mass: .012, position, velocity, angularVelocity });

// every frame
world.update(dt);
debris.update(dt);
for (const p of debris.pieces) model.draw(renderer, debris.matrix(p, m));
```

- Physics is `@papit/rigidbody` only, in the host's `world` (the host steps it). Other static bodies in it (crates, walls) are hit too.
- Ground: no heightfield shape in rigidbody, so static hull tiles (`tile`, 1 m) are made from `ground(x, z)` round moving pieces only and dropped when nothing moves over them.
- Lands once (`onland` with the speed it came in at), then rolls with damping (`roll`); asleep, or slow 1.5 s after landing (4 s at most), it leaves the world and stays as a drawn transform.
- Past `cap` (80) or after `life` (40 s), the oldest shrink away over `fade` (1.5 s).

View `shells`: cases from a port over bumpy ground, a crate and a plate.

## License

Licensed under the @Papit License 1.0 - Copyright (c) 2024 Henry Pap (@onkelhoy)

**Key points:**

- ✅ Free to use in commercial projects
- ✅ Free to modify and distribute
- ✅ Attribution required
- ❌ Cannot resell the component itself as a standalone product

See the [LICENSE](https://github.com/onkelhoy/papit/blob/main/LICENSE) file for full details.
