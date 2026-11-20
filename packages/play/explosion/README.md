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

### Force (push)


```ts
import { World } from "@papit/rigidbody";
import { ShockFront } from "@polywar/explosion";
import { BlastForce, bodyTargets, worldCover } from "@polywar/explosion";

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


### Sound


```ts
import { AudioMixer } from "@papit/audio";
import { ExplosionAudio } from "@polywar/explosion";

const audio = new ExplosionAudio({ mixer: new AudioMixer(), cast: (from, to) => world.cast(from, to), deaf: () => player.deaf });
await audio.load();                                   // assets/audio/effects/explosions/ (npm run sfx -- --only=explosions)
explosion.onexplode = b => audio.play(b.position, b.power);
audio.setListener(eye, forward);                      // every frame
audio.ring(player.deaf);                              // ears after a close one
```

- Files `<size>-<scene>`: `small` (< 100 kg) / `big`; `near-open`, `near-walls`, `near-indoor` (rays round the blast, like weapon-audio), `far` (no crack, rolling thunder), `distant` (deep thud). Near under max(150, 60∛W) m, far under max(1500, 400∛W) m.
- Late by distance / 343 m/s: flash first, then the gust (force), then the boom. Bigger is louder and lower; `deaf` muffles.


View `experiment`: power presets, ear distance (to 40 km), slow motion, look sliders, crates / jeep / dummies / wall pushed, sound.

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
