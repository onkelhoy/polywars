# @polywar/terrain-material

Rendering only for terrain: ground shader, biome palette, rock on slopes, snow caps, faceted low poly light, tint under water, underwater fog, debug views. Water surfaces are `@polywar/water`. Geometry is the caller's (`@polywar/terrain`).

- `new TerrainMaterial(layer, look)`, `set(look)`, `useGround(view, light, underwater?)`
- `TERRAIN_LOOK`, `TERRAIN_LOOKS`, `BIOMES` (palette order = `data.x` index)
- `TerrainSample`: a made up patch with every biome (views, gallery)

Ground attributes: 0 position, 1 normal, 2 data (biome, slope, moisture, temperature), 3 flow, 4 water surface height.
