# Known bugs

## building-builder: tall / narrow houses (owner screenshots 2026-11-12, Desktop 00.08-00.10)
For a stronger model to pick up. Check loop: `node tools/blender/render-house.mjs` (see plan-city.md), browser: building-builder view.
- Jetty on narrow tall houses: corner posts/beams from the neighbour faces (`walls.ts`, `next.shift`/`prev.shift`) float free beside the gable, a long post hangs below the jetty; gable face looks open.
- Windmill tower (`massing.ts`, `tower`) + other features: 4-5 wide, 4+ floors look like bare boxes: few/no windows on upper storeys (bays only every 2nd cell, wide bays get removed), timber is just a grid.
- L/T wing on narrow/tall main box: wing box sticks out as a plain stucco block with no roof visible from some sides (screenshot 00.09.55, 00.10.09).
- Tunnel: rarely appears with "on" (`fits`: floors >= 2, width >= 6, back cells free of the wing). `Stone_Arch_Outer` brings a stone wall block above the arch: owner wants a clean stucco wall + timber with only the arch.
- Waterwheel: flume supports stand on nothing, wheel cuts into the awning side (00.09.55).
- Preview: mirrored pieces now lit right (`mirrored` uniform in 3d-asset-preview); the game renderer (papit) needs the same rule.
- papit: `@papit/game-mesh` has no glTF/GLB writer; `writeGLB` lives in `building-builder/src/glb.ts` until it moves there.
