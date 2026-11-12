# Plan: grass (`@polywar/grass`, `packages/generators/nature/grass`)
Confirmed 2026-11-12. Reference: DylearnDev/Dylearn-3D-Pixel-Art-Grass-Demo (MIT code, art not copied).

## Design
- Own WebGL2 program, any `gl`. Takes a `View` + light shaped like `Renderer.light`. No runtime deps.
- `quality: low | medium | high` presets (density, max tufts, distance, LOD, source, clouds, push count, soft bands, noise size), every field overridable. Game maps its global setting onto it.
- `style: pixel | smooth` (nearest + stepped time + hard bands vs linear + smooth).
- Source: `sprite` (billboard), `cross` (crossed planes), `mesh` (instanced Mesh, e.g. Grass.glb).
- Placement: area + density + mask/height callbacks, chunked, shuffled per chunk so far chunks draw a prefix (LOD).

## Tasks
1. [x] Package, quality presets, placement + chunks, instanced sprite draw.
2. [x] Two-noise wind, sway, stepped time, fake perspective.
3. [x] Colour patches, accents, procedural pixel sprites (+ PNG override).
4. [x] Toon light (soft bands), cloud shadows, matching ground.
5. [ ] `cross` + `mesh` sources.
6. [x] Push (characters).
7. [x] View `experiment`: free camera, controls for every property, tuft count + fps.
8. [x] Leaves sprite (all directions, centred), `mixed` shape + `bladeShare`, soft patches, per-tuft shade/warmth.
9. [x] Settings JSON: `toJSON()` / `load()`, view download/copy/open/apply.
10. [ ] Check by hand: `cross` + `mesh` sources, `smooth` style, quality switch, sprite PNG override.
11. [ ] Optional `noise` texture (url/image) + shared noise cache.
12. [x] README.
13. [x] Share code: `grass.code` / `load(code)`, live in the view + url.
14. [x] Randomness via `@papit/random` (planting, noise, sprites).
