# @polywar/terrain-material

Rendering only for terrain: shaders, biome palette, rock on slopes, snow caps, faceted low poly light, water (sea + lakes), debug views. Geometry is the caller's (`@polywar/terrain`).

- `new TerrainMaterial(layer, look)`, `set(look)`, `useGround(view, light)`, `useWater(view, light, time, lake?)`
- `TERRAIN_LOOK`, `TERRAIN_LOOKS`, `BIOMES` (palette order = `data.x` index)
- `TerrainSample`: a made up patch with every biome (views, gallery)

Ground attributes: 0 position, 1 normal, 2 data (biome, slope, moisture, temperature), 3 flow. Water: 0 position, 1 depth.
