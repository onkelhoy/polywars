# @polywar/mover

An upright capsule on any ground: walk, run, jump, slide down too steep ground (and no walking up it), step up low ledges, stand on box tops, pushed out of boxes and cylinders. No camera, no keys: the host gives the wanted velocity. Fixed 1/120 s sub steps.

```ts
import { Mover } from "@polywar/mover";

const mover = new Mover({
    ground: (x, z) => Math.max(terrain.groundAt(x, z), roads.deckAt(x, z)),  // highest wins
    colliders: (x, z) => grid.near(x, z),                                       // { kind: "box" | "cylinder", ... }
    slope: 40, step: .45, radius: .3, height: 1.8, jump: 5, gravity: 18,
}, [x, 0, z]);

mover.update(dt, { x: vx, z: vz, jump });
mover.feet; mover.velocity; mover.grounded; mover.sliding; mover.normal; mover.landed; mover.speed;
mover.place(x, z); mover.push(x, y, z);
```

`@polywar/viewport-camera`'s `walk()` runs on it. View `experiment`: hills, a cone too steep to climb, a 35° ramp, a road, crates to step on, posts.
