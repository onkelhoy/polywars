# @polywar/grass

GPU grass for WebGL2: instanced tufts that sway in a two-noise wind, with pixel-art or smooth looks, colour patches, toon light, cloud shadows and characters that push the grass aside. Quality presets (`low | medium | high`) keep it running on phones.

The look (shaders, noise, sprites, uniforms) is `@polywar/grass-material`; this package plants, chunks and culls the tufts and maps quality / style presets onto the material (`grass.material`).

Inspired by [Dylearn's 3D pixel art grass](https://github.com/DylearnDev/Dylearn-3D-Pixel-Art-Grass-Demo) (MIT code; sprites here are generated, not copied).

## Usage

```js
import { Grass } from "@polywar/grass";

const grass = new Grass(engine.layers.main, { quality: "medium", style: "pixel" });  // a @papit/game-engine Layer3D
grass.plant({
    area: { x: -50, z: -50, width: 100, depth: 100 },
    mask: (x, z) => isGrass(x, z) ? 1 : 0,  // chance a tuft grows, 0..1
    height: (x, z) => terrainY(x, z),       // ground y
    seed: 1,
});

// each frame (time in seconds)
grass.push([[player.x, player.y, player.z, 0.8]]);   // x y z radius
grass.drawGround(camera, light, time);              // optional floor with the same patches
grass.draw(camera, light, time);
```

### Big maps: grow + window

```js
grass.plant({
    area: { x: -1024, z: -1024, width: 2048, depth: 2048 },
    height: (x, z) => terrain.heightAt(x, z),
    grow: (x, z) => eco.grassAt(x, z),   // { density, height, dry, flowers } per spot (@polywar/ecosystem)
    window: 70,                           // only chunks this close to follow(x, z)
});
// each frame
grass.follow(camera.x, camera.z);         // plants / drops chunks when the set changes (seeded per chunk, so the same every time)
```

`grow` sets each tuft's height (times `size`), dryness (fades to `dry`) and flowers (more accent 1, `flowers`). No floor in window mode (the terrain is the floor).

- `camera`: anything with `viewMatrix`, `projectionMatrix`, `worldPosition` (`@papit/game-engine` `Camera` fits).
- `light`: same shape as the polywar `Renderer.light` (sun, sky/ground ambient, fog), colours linear.

## Settings

`grass.set(partial)` changes settings and rebuilds only what the change needs. `grass.quality = "low"` switches preset at runtime.

| Option | What |
| --- | --- |
| `quality` | preset of the costly parts, see `QUALITY` |
| `settings` | overrides on the quality preset: `density` (tufts/m²), `maxTufts`, `distance`, `lod`, `sizeScale`, `source`, `planes`, `clouds`, `pushers`, `softBands`, `noiseSize` |
| `style` | `pixel` (nearest sprites, stepped clock, toon bands) or `smooth`, see `STYLE` |
| `look` | overrides on the style: `pixelated`, `stepped`, `framerate`, `bands`, `pixels` |
| `shape` | main tuft: `leaves` (all directions, reads from above), `blades`, `mixed` (`bladeShare`, default) |
| `size`, `sizeJitter` | tuft width/height in metres, random spread |
| `color`, `patches`, `variation` | base colour (sRGB hex), noise patches `{ color, scale, threshold, softness }`, per-tuft shade |
| `accents` | up to 2 rare tufts `{ chance, color, height, scale }` (flower, tall blades) |
| `dry`, `flowers` | colour dry tufts fade to; extra accent 1 chance at full flowers (both from planting `grow`) |
| `wind` | `direction`, `speed`, `scale`, `threshold`, `diverge`, `angle`, `perspective` |
| `sway`, `push` | own sway `{ speed, angle }`, push `{ angle, exponent }` |
| `clouds`, `lighting` | cloud shadows, toon `wrap` / `steepness` |
| `mesh` | geometry for `source: "mesh"` (a `@papit/game-mesh` primitive) |
| `sprites` | image/url overrides: 0 leaves, 1 accent 1, 2 accent 2, 3 blades |
| `debug` | `wind` or `push` colours |

### Quality

| | low | medium | high |
| --- | --- | --- | --- |
| density /m² | 18 | 47 | 83 |
| max tufts | 20k | 60k | 160k |
| distance m | 23 | 42 | 65 |
| size scale | 1.9 | 1.55 | 1.4 |
| clouds | off | on | on |
| pushers | 8 | 16 | 64 |
| noise | 64² | 128² | 256² |

A game keeps one global quality setting and passes it on: `grass.quality = settings.graphics`.

### Save / load

```js
const json = grass.toJSON();      // plain data (no mesh, no image sprites)
new Grass(layer, json);
grass.load(json);                 // replace all, missing fields fall back to defaults

const code = grass.code;          // share code: only what differs from the defaults, e.g. "g2" or "g2.eyJ..." (older versions still load)
grass.load(code);                 // load takes settings, json text or a code
```

The view keeps the code in the url (`#g2...`), so a link opens the same grass.

## How it works

- Randomness (planting, noise, sprites) comes from `@papit/random`, seeded, so the same seed gives the same grass.

- One instanced draw per chunk. Tufts are shuffled inside a chunk, so far chunks draw a prefix (`lod`); chunks outside the view or `distance` are skipped.
- Wind: one tileable noise sampled twice, scrolling apart at slightly different scale and speed, multiplied: no visible repeat. Tufts lean around the axis across the wind.
- Stepped clock: time rounds to `framerate`, each tuft with its own phase so they don't jump together.
- Noise texture channels: r wind, g/b patches, a clouds (generated, tileable).

## View

`npm start`, then `views/experiment`: every option as a control, camera modes, walkers that push, settings JSON download/copy/open/apply.
