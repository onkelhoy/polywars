# @polywar/water

Water rendering: waves, shore foam, gloss, ripples, underwater, caustics

![Logo](https://raw.githubusercontent.com/henry/polywar/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-materials-orange)
[![Tests](https://github.com/henry/polywar/actions/workflows/pull-request.yml/badge.svg)](https://github.com/henry/polywar/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@polywar/water.svg?logo=npm)](https://www.npmjs.com/package/@polywar/water)

---

## installation

```bash
npm install @polywar/water
```

## What it is

Low poly water for WebGL2, no textures, one draw per water body:

- `WaterMaterial`: flat surface in a shallow → deep colour, toon dashes that turn white in the sun's reflection, tiny specks,
  a wavy shore rim and thin foam lines (fade out when smaller than a pixel / past `foam.far`), dashes running with rivers,
  Snell's window from below. Looks: `WATER_LOOKS` (sea, calm, tropical, lake, muddy, swamp).
- `WaterScreen`: opt in screen pass, only costs while active. Under water: blur, wobble, tint, tiny bubbles in the corners.
  On surfacing: drops run off the screen for `rinse` seconds.
- GLSL for other shaders: `UNDER_GLSL` (+ `bindUnder`) fogs anything under water from the shallow to the deep colour,
  `CAUSTICS_GLSL` light lines on the bed, `NOISE_GLSL` hash / value noise.
- `WaterSample`: a 600 m coast at real scale (beach, lake, river, rocks) to look at it (`views/experiment`, with a cow and a house).

## Geometry you give it

Flat meshes, few vertices. Attributes, metres:

| location | name | value |
| --- | --- | --- |
| 0 | position | the surface (y = water level) |
| 1 | info | x: water depth there, y: distance to the shore (< 0 over land, so the shore line is where it crosses 0) |
| 2 | flow | x y: still water world x z / rivers across and along; z: flow speed m/s along y (0 = still); w: open water 0..1 (how many shore lines) |

```js
const water = new WaterMaterial(layer, WATER_LOOKS.lake);
const screen = new WaterScreen(layer);
// each frame, after the opaque scene
gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
if (water.use(camera, light, time, { fresh: true, under: eyeBelow, surface: level })) drawMyMesh();
gl.depthMask(true);
screen.draw(eyeBelow, time, water.look.under.shallow);
```

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
