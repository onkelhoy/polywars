# @polywar/explosion

Fast scary low poly explosions: flash, fireball, shock wave, swirling ground surge, suck back, mushroom, volcano debris.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/explosion.svg?logo=npm)](https://www.npmjs.com/package/@polywar/explosion)

---

## installation

```bash
npm install @polywar/explosion
```

## Usage

```ts
import { Smoke } from "@polywar/smoke";
import { Explosion } from "@polywar/explosion";

const smoke = new Smoke(layer, { puffs: 8000 });
const explosion = new Explosion(layer, { smoke, ground: (x, z) => height(x, z) });
explosion.onexplode = blast => { /* sound, force */ };
explosion.explode(at, { power: 250 });            // kg TNT
// every frame
explosion.update(dt); smoke.update(dt);
smoke.draw(camera); explosion.draw(camera);         // after opaque things
overlay.style.opacity = explosion.glare(eye);       // the flash on screen
for (const l of explosion.lights) { /* light the scene */ }
```

- Power sets size (∛W) and time (√∛W). Stages: flash (~50 ms), fireball (pops, chars to dark puffs), white spikes, shock bubble (edge lines on the rim) + dashed ground rings, dust kicked where the ring passes, ground surge (thrown out, swirling, bigger puffs on the rim, rolling), suck back (`smoke.field`: in, up, round) with a pop up the middle.
- From ~200 kg a mushroom (cap rises and rolls, a stem feeds it), from ~5 t rock in a few jets with smoke trails that thicken.
- `ShockFront(power)`: front speed / radius / overpressure (Sadovsky) by scaled distance; shared with force and sound.

View `experiment`: power presets, distance, slow motion.

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
