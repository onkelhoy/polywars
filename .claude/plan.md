# Plan: optimise + bigger world

## Where we are
`feature/ecosystem` merged into `main` (2026-11-12). All done (o, p, r1, j1-j3); waiting for the owner (phone check, then "prepare PR"). Branch: `feature/optimise`.

## Tasks
- o1. [x] No rock gloss: rock props matte (world `GLOSS`), steep rock ground gloss 0 (terrain-material `look.gloss.rock`). Wet ground by water keeps its slight gloss.
- o2. [x] Prop LODs (asset side): `export.py` writes `Name.lod1.glb` / `Name.lod2.glb` per nature model (Blender decimate, ~40% / ~12% / ~5% tris, flat shading kept); `manifest.json` lists them. Config: folder `lod.json`.
- o3. [x] Prop LODs (scatter): per chunk pick LOD 0/1/2 by distance (per kind thresholds, quality scaled); far trees use lod2 instead of shrinking away, so tree distance can go further. Log tris / calls per frame in the world view stats.
- o4. [x] Bigger feel: aerial haze (distance fog tinted to the sky, on terrain, water, props, grass) so far land reads far; default map 2048 → 3072 m with finer ground on every quality (resolution up a step, terrain LOD keeps it cheap); camera `far` raised to fit. Check walk + editor views by eye.
- o5. [x] Fluffier grass: world grass tufts bigger again (sizeScale 2 → ~2.6, density kept)

## Phone performance (confirmed 2026-11-12: "do everything you can, must run on a phone")
- p1. [x] Stats per system (terrain / water / props / grass: calls, tris, ms) in the world view, to see what costs.
- p2. [x] Render scale: cap the pixel ratio (phones render at 3x now?), lower on low quality.
- p3. [x] Props: pack visible instances per model + lod into one stream buffer each frame → one call per model / lod / part.
- p4. [x] Terrain shader: fbm baked once into a 2048² R8 texture (mirrored), 8 fetches instead of ~160 hashes per ground pixel.
- p5. [x] Phones start at low quality (touch / small screen), low = cheaper everywhere.

## Viewport + touch (confirmed 2026-11-12)
- r1. [x] Rename `3d-demo` → `viewport` (`@polywar/viewport`, `<pw-viewport>`), all users, docs, facts.
- j1. [x] viewport-camera: controllers take a touch input (`{ x, y }` stick + look drag + buttons; `@papit/joystick` fits, no dependency). walk: stick moves, drag looks, jump / run. fly: same + up / down. pan: one finger turns, two pan + pinch zoom.
- j2. [x] viewport: on touch screens a `@papit/joystick` overlay per mode (walk / fly), wired to j1.
- j3. [x] World view on phones: panel folds behind a button, play reachable.
