# Plan: optimise + bigger world

## Where we are
`feature/ecosystem` merged into `main` (2026-11-12). Tasks confirmed 2026-11-12. Branch: `feature/optimise`.

## Tasks
- o1. [x] No rock gloss: rock props matte (world `GLOSS`), steep rock ground gloss 0 (terrain-material `look.gloss.rock`). Wet ground by water keeps its slight gloss.
- o2. [ ] Prop LODs (asset side): `export.py` writes `Name.lod1.glb` / `Name.lod2.glb` per nature model (Blender decimate, ~40% / ~12% tris, flat shading kept); `manifest.json` lists them.
- o3. [ ] Prop LODs (scatter): per chunk pick LOD 0/1/2 by distance (per kind thresholds, quality scaled); far trees use lod2 instead of shrinking away, so tree distance can go further. Log tris / calls per frame in the world view stats.
- o4. [ ] Bigger feel: aerial haze (distance fog tinted to the sky, on terrain, water, props, grass) so far land reads far; default map 2048 → 3072 m with finer ground on every quality (resolution up a step, terrain LOD keeps it cheap); camera `far` raised to fit. Check walk + editor views by eye.
- o5. [ ] Fluffier grass: world grass tufts bigger again (sizeScale 2 → ~2.6, density kept)
