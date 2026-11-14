# @polywar/weapon-audio

Weapon sounds in 3D: guesses the scene by rays, random variant and pitch, plays through @papit/audio.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/weapon-audio.svg?logo=npm)](https://www.npmjs.com/package/@polywar/weapon-audio)

---

## installation

```bash
npm install @polywar/weapon-audio
```

## Usage

```ts
import { AudioMixer } from "@papit/audio";
import { WeaponAudio } from "@polywar/weapon-audio";

const audio = new WeaponAudio({ mixer: new AudioMixer(), cast: (from, to) => world.cast(from, to) });
await audio.load("kar98k");                  // assets/audio/effects/weapons/kar98k/sounds.json + files
gun.oncue = (cue, g) => cue === "shot" ? audio.shot(g.spec.model, muzzle) : audio.part(g.spec.model, cue, muzzle);
audio.brass("stone", where, .5);            // a case lands (the shared `brass` set), small cases ring higher
audio.setListener(camera.position, forward); // every frame
```

- Sets come from `@polywar/sfx-gen` (`npm run sfx`), any `sounds.json` works: name -> variant files.
- A random variant (never the same twice in a row), random pitch (`pitch`, default ±4 %), late by distance / `sound` (343 m/s).
- `scene(at)`: 8 rays round to 30 m and one up to 20 m through the host's `cast`. A roof under 8 m with 6 of 8 walls under 12 m is `indoor`, 2 walls under 25 m `walls`, else `open`. Cached for half a second within a metre. Shots play `shot-<scene>`.
- Reach (ref distance, rolloff, max): shots 6 / 1 / 3000 m, parts 1 / 1.6 / 60 m, brass .6 / 2 / 30 m.

View `scenes`: a gun in the open, a street and a room; the ear off by a slider.

## License

Licensed under the @Papit License 1.0 - Copyright (c) 2024 Henry Pap (@onkelhoy)

**Key points:**

- ✅ Free to use in commercial projects
- ✅ Free to modify and distribute
- ✅ Attribution required
- ❌ Cannot resell the component itself as a standalone product

See the [LICENSE](https://github.com/onkelhoy/papit/blob/main/LICENSE) file for full details.
