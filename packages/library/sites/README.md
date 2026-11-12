# @polywar/sites

Where things are: `generateSites(ground, towns, options)` → `Site[]` (`{ id, kind, x, z, y, radius, weight }`).
Kinds: `city` (the terrain's towns), `village`, `farm` (round towns / villages), landmarks `peak`, `pass` (saddle), `viewpoint` (flat edge over a drop), `beach`, `lake` (shore, only when the ground has lakes).

`Ground` = `{ n, cell, size, height, seaLevel, water? }`: terrain `RawGround` (before erosion) or `TerrainData` fit. Without `water`, below sea level is sea. Seeded: same input, same sites.

View: `views/experiment` (raw terrain via `shapeOnly`, counts per kind).
