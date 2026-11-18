# @polywar/vehicle

Raycast wheel vehicle on a rigidbody chassis: soft suspension, tyre grip, engine, brakes, steering.

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-play-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/vehicle.svg?logo=npm)](https://www.npmjs.com/package/@polywar/vehicle)

---

## installation

```bash
npm install @polywar/vehicle
```

## usage

```js
import { Vehicle } from "@polywar/vehicle";

const spec = await (await fetch("/assets/models/vehicles/willys-jeep/vehicle.json")).json();
const car = new Vehicle({ spec, ground: (x, z) => height(x, z), solids: [{ min, max }] }, [0, 0, 0], yaw);

// every frame
car.update(dt, { throttle, steer, handbrake });
car.wheels.forEach((w, i) => model.move(w.spec.node, car.wheel(i, Matrix4.create())));
model.move(spec.steeringWheel.node, car.steeringWheel(Matrix4.create()));
model.draw(renderer, car.matrix(Matrix4.create()));
```

- Model space is glTF: y up, nose -z, right +x. `vehicle.json` comes from `tools/blender/packs/jeep.py`.
- Chassis: a `@papit/rigidbody` hull in its own world (stepped inside `update`, fixed 1/120 s); `solids` are static boxes in it. The ground is a height function: wheels cast onto it, chassis corners get a stiff spring if they dig in.
- Wheels: ray from the mount down the body's -y, spring + damper (`frequency`, `damping`, `travel`), tyre grip with a friction circle (`grip`), locked rear on handbrake (`slide` sideways grip left).
- Throttle opposing the motion brakes; at a stop it reverses. Steering lock shrinks with speed (`steerFade`).
- Several cars: `const fleet = new Vehicles({ ground, solids })`, `fleet.add({ spec }, at, yaw)`, `fleet.update(dt, new Map([[car, input]]))`: one world, cars hit each other; `fleet.cast(from, to)` lets bullets hit them (`@polywar/ballistics` Hit shape, surface `metal`).
- Gearbox: automatic (`gears`, `pull`, `shiftTime`), `rpm`, `power` (throttle after the shift cut), `onshift`, `slip`; `boost` scales the top speed.
- `toWorld(p)` for seat / eye / exit points, `place(x, z, yaw)` to reset.
- View: `views/drive` (bumpy ground, ramp, crates, chase / seat cam, tuning sliders).

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
