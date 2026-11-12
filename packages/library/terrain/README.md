# @polywar/terrain

Low poly map generator + editor. Same seed and settings, same map.

Pipeline (each stage only reruns when its options change):
1. **shape**: warped fbm base, hills, ridged mountain ranges (masked), plateaus (flat or terraced), edge fade into ocean or far fields (round, square, coast).
2. **erosion**: droplet hydraulic erosion (Beyer / Lague): precomputed brush, typed arrays. Also records water flow.
3. **water**: ocean (below sea, connected to the border), lakes by priority flood (basins deeper than `lakes.depth`, filled to `lakes.level`).
4. **cities**: flat dry spots, spaced, ground flattened under them.
5. **climate**: temperature (noise, gradient, colder up high) and moisture (noise, near water, streams).
6. **biomes**: ocean, lake, beach, grassland, savanna, desert, forest, hills, plateau, mountain, snow.

```js
const terrain = new Terrain(layer, { ...MAPS.coast, seed: 42 });
await terrain.ready;
terrain.draw(camera, light, time);
terrain.heightAt(x, z); terrain.biomeAt(x, z); terrain.waterAt(x, z); terrain.cities;
terrain.toJSON(); terrain.code; terrain.load(jsonOrCode);
```

Headless: `generate(options)` gives `TerrainData` (all grids) without WebGL.
Rendering is `@polywar/terrain-material`, noise is `@polywar/noise`.

View: `views/experiment` (editor: presets, seed, every setting, debug views, share code, json / png / data export, grass demo).
