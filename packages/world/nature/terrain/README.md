# @polywar/terrain

Low poly map generator + editor. Same seed and settings, same map.

Pipeline (each stage only reruns when its options change):
1. **shape**: warped fbm base, hills, ridged mountain ranges (masked), plateaus (flat or terraced), edge fade into ocean or far fields (round, square, coast).
2. **cities**: flat dry spots on the raw map (above sea), spaced, ground flattened under them (pads kept from erosion).
3. **features** (hook): outside steps on the raw map, e.g. roads carving their beds; may return a `hard` mask.
4. **erosion**: droplet hydraulic erosion (Beyer / Lague): precomputed brush, typed arrays, skips `hard` nodes. Also records water flow.
5. **water**: ocean (below sea, connected to the border), lakes by priority flood (basins deeper than `lakes.depth`, filled to `lakes.level`). Then rivers, then the **fix** hook (e.g. bridges where rivers cross roads).
6. **climate**: temperature (noise, gradient, colder up high) and moisture (noise, near water, streams).
7. **biomes**: ocean, lake, beach, grassland, savanna, desert, forest, hills, plateau, mountain, snow.

```js
const terrain = new Terrain(layer, { ...MAPS.coast, seed: 42 });
await terrain.ready;
terrain.draw(camera, light, time);
terrain.heightAt(x, z); terrain.biomeAt(x, z); terrain.waterAt(x, z); terrain.cities;
terrain.toJSON(); terrain.code; terrain.load(jsonOrCode);
```

Headless: `generate(options, onProgress?, hooks?)` gives `TerrainData` (all grids) without WebGL. `shapeOnly(options)` = raw shape + town spots only (~1 s, for road tools).
Hooks (`TerrainHooks { key, features(raw), fix(data) }`): `new Terrain(layer, options, hooks)`; the terrain knows nothing about what they do.
Rendering is `@polywar/terrain-material`, noise is `@polywar/noise`.

View: `views/experiment` (editor: presets, seed, every setting, debug views, share code, json / png / data export, grass demo).
