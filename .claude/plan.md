# Plan

## Where we are
Rivers rework merged 2026-11-13 (`@polywar/hydrology`, hooks like roads). Roads parked in `plan-road.md`. LOD rework on branch `lod` waits for owner check.

## Tasks
- [x] 1. `@polywar/hydrology` package (hooks: features before erosion, fix after), terrain rivers removed
- [x] 2. Highland lakes at any height (basins, rim, outlet notch toward drops)
- [x] 3. Network: streams → rivers by order, lakes chained, out to sea
- [x] 4. Meanders (S shapes on flat ground)
- [x] 5. Carving follows ground: monotone bed, canyons only on deep cuts, waterfalls on drops
- [x] 6. Deltas: big rivers split into 2–4 branches near the sea
- [x] 7. Blue debug lines in world (ribbons off)
- [x] 8. Ocean / lake mesh: merged quads (quadtree), fewer verts
