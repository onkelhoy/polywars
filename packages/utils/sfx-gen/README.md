# @polywar/sfx-gen

Generated weapon sounds: shots per scene, reload parts, brass per surface, written as WAVs with a sounds.json.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-utils-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/sfx-gen.svg?logo=npm)](https://www.npmjs.com/package/@polywar/sfx-gen)

---

## installation

```bash
npm install @polywar/sfx-gen
```

## Usage

```bash
npm run sfx                       # every gun model + brass into assets/audio/effects/weapons/
npm run sfx -- --force            # redo sets that already have a sounds.json (hand edits are lost)
npm run sfx -- --only=kar98k,brass
```

Per gun (`weapon.json` `sounds`, default the model folder): `shot-open`, `shot-walls`, `shot-indoor` (2 variants) and the parts `dry`, `bolt-open`, `bolt-close`, `mag-out`, `mag-in`, `round-in`, `clip-in`, `slide`. `brass/`: `dirt`, `stone`, `wood`, `metal` (3 variants). `sounds.json` lists the files per name: replace or add files and list them, a set with a `sounds.json` is kept.

The synth is pure (no DOM, no node), so it runs in the browser too:

```ts
import { gunSet, voice, wav, RATE } from "@polywar/sfx-gen";
const set = gunSet("kar98k", voice("rifle", "bolt", "7.92x57", 760));
const file = wav(set["shot-open"][0], RATE);
```

How a gun sounds comes from `voice(kind, action, caliber, speed)`: muzzle `energy` 0..1 (louder, lower, longer), `supersonic` (a crack), self loaders get the action's clack in the shot. View: `sounds` plays the files.

## License

Licensed under the @Papit License 1.0 - Copyright (c) 2024 Henry Pap (@onkelhoy)

**Key points:**

- ✅ Free to use in commercial projects
- ✅ Free to modify and distribute
- ✅ Attribution required
- ❌ Cannot resell the component itself as a standalone product

See the [LICENSE](https://github.com/onkelhoy/papit/blob/main/LICENSE) file for full details.
