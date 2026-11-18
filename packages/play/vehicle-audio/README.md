# @polywar/vehicle-audio

Engine sound for a vehicle: a live synth following rpm / throttle, shift dips, tyre skid; 3D on a @papit/audio mixer.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/vehicle-audio.svg?logo=npm)](https://www.npmjs.com/package/@polywar/vehicle-audio)

---

## installation

```bash
npm install @polywar/vehicle-audio
```

## usage

```js
import { AudioMixer } from "@papit/audio";
import { EngineSound } from "@polywar/vehicle-audio";

const engine = new EngineSound({ mixer });             // starts idling
engine.update({ rpm: car.rpm, load: car.power, slip: car.slip, position: [x, y, z] }); // every frame
engine.stop();                                         // fade out, frees the nodes
```

- Live WebAudio synth, no samples: firing tone (saw + half rate square, pulsed at the firing rate), exhaust rasp (noise round the firing harmonics), skid hiss. 3D through a panner on the mixer's bus.
- A shift is heard by itself: rpm falls and `load` is cut, then eased back (`@polywar/vehicle` does both).
- Settings: `cylinders` (4), `volume`, `muffle` (low pass at idle / redline).
- View: `views/engine` (rpm / load / slip sliders, a 3 gear rev).

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
