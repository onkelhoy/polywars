# Plan: world look + play

## Where we are
Branch `feature/ecosystem`: nature done (`@polywar/nature`, `ecosystem`, `scatter`, `world`; see `facts.md`). Now: the look pass below (confirmed 2026-11-12). Next task: f1.

## Tasks
- f1. [x] Bigger, fuller grass: owner's grass code is the world default (`g2.eyJzZXR0aW5ncy5zb2Z0QmFuZHMiOjAuMjUsInNldHRpbmdzLnNpemVTY2FsZSI6MS43NSwic2V0dGluZ3MuZGVuc2l0eSI6MzIsImxvb2suYmFuZHMiOjMsImJsYWRlU2hhcmUiOjAuMjUsInZhcmlhdGlvbiI6MC4xNiwicGF0Y2hlcy4wLnNjYWxlIjowLjAyM30` = density 32, sizeScale 1.75, softBands .25, bands 3, bladeShare .25, variation .16, patches.0.scale .023); density still varies by the cover maps.
- f2. [x] Bigger trees + pine woods: trees ~1.5x, forest cores get taller / denser pine stands (up to ~2x height) thinning to the edges; rocks / bushes a bit bigger. Everything should feel larger.
- f3. [ ] Props less plastic: soft toon bands on props + an EXTREMELY subtle grit (few % world space noise, steady with the camera).
- f4. [ ] Painted ground (terrain material): biome borders as ragged stroke shaped edges (no straight triangle lines, no fade blend), light / dark brush stroke patches inside each biome (hard edged). Biomes stay where they are.
- f5. [ ] Gloss: steep rock ground + rock props slightly glossy, wet ground near water a little, the rest matte.
- f6. [ ] Play mode in the world view: first person on foot (WASD, mouse look, shift run, space jump), eye height on the ground, pushes grass; Esc back to the editor.
