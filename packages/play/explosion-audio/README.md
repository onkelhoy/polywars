# @polywar/explosion-audio

Explosion sounds in 3D: near / indoor / walls / far / distant, late by distance.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/explosion-audio.svg?logo=npm)](https://www.npmjs.com/package/@polywar/explosion-audio)

---

## installation

```bash
npm install @polywar/explosion-audio
```

## Usage

```ts
import { AudioMixer } from "@papit/audio";
import { ExplosionAudio } from "@polywar/explosion-audio";

const audio = new ExplosionAudio({ mixer: new AudioMixer(), cast: (from, to) => world.cast(from, to), deaf: () => player.deaf });
await audio.load();                                   // assets/audio/effects/explosions/ (npm run sfx -- --only=explosions)
explosion.onexplode = b => audio.play(b.position, b.power);
audio.setListener(eye, forward);                      // every frame
audio.ring(player.deaf);                              // ears after a close one
```

- Files `<size>-<scene>`: `small` (< 100 kg) / `big`; `near-open`, `near-walls`, `near-indoor` (rays round the blast, like weapon-audio), `far` (no crack, rolling thunder), `distant` (deep thud). Near under max(150, 60∛W) m, far under max(1500, 400∛W) m.
- Late by distance / 343 m/s: flash first, then the gust (`@polywar/blast-force`), then the boom. Bigger is louder and lower; `deaf` muffles.

View `experiment`: power and ear distance out to 40 km.

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
