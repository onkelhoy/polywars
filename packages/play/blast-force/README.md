# @polywar/blast-force

A blast pressure front: pushes, wakes and spins rigidbodies by distance, mass and cover.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/blast-force.svg?logo=npm)](https://www.npmjs.com/package/@polywar/blast-force)

---

## installation

```bash
npm install @polywar/blast-force
```

## Usage

```ts
import { World } from "@papit/rigidbody";
import { ShockFront } from "@polywar/explosion";
import { BlastForce, bodyTargets, worldCover } from "@polywar/blast-force";

const force = new BlastForce({
    targets: () => [...bodyTargets(world), player.target],   // anything with position, mass, size, push()
    cover: worldCover(world),                                // rays: walls let .15 through, props .45
    front: p => new ShockFront(p),
    onhit: (target, hit) => damage(target, hit.pressure),
});
explosion.onexplode = b => force.blast(b.position, b.power);
// every frame
force.update(dt); world.update(dt);
grass.wind = force.wind(at);                                 // gust out, then a pull back
```

- A target is hit when the front reaches it: impulse ≈ 200 W^⅔ / R Pa·s on π size², times cover, times `strength` (default 2). Away from a point under the blast (lifts), plus a tumble. Mass does the rest.
- Rigidbody bodies are woken, pushed and left to settle / sleep again; static ones (houses) never move.

View `experiment`: crates, a jeep, dummies in the open and behind the jeep, a wall.

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
