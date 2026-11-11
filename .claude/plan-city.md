# Plan: city generators (separate session, resume here)
Packages: `packages/generators/city` (@polywar/city, irregular-grid layout, style registry), `packages/generators/city-medieval` (@polywar/city-medieval, Modular Village kit, 1m grid, walls on -X face, Y up).
Output = `{piece, matrix}[]`. Settings tri-state off/on/random + ranges, build code = settings+seed. View: 5x5 variants via fork(seed,i), click -> pw-3d-asset-preview `pieces`. Asset base path configurable (default `assets/models/modular-village/`), missing -> placeholder box.
Tasks: 1 create pkgs 2 catalog 3 settings+code 4 building 5 extras 6 preview pieces 7 medieval view 8 city 9 swap to other session's gallery
Done: 1-8. Not verified in browser. 9 waits for the other session gallery (view uses temporary tile buttons + one preview showing all NxN). Asset folder default `/assets/models/modular-village` (input in views), unconfirmed. Not committed (shared tree).

## Handoff (owner unhappy: output looks modern/broken)
Root cause: pieces placed blind from names + OBJ bounds, never rendered/verified. Do NOT continue guessing.
Kit facts (verified): glb = OBJ dims, Y up, 1 m cells. Wall pieces sit on the cell's -X edge, sills/props stick out +X (outside = +X). Wide pieces span local z -0.5..1.5 (2 cells). Roof_*_Side: high at -X (1.2 straight, 0.7 convex/concave), low at +X. Corner_Outer peak at local (-X,+Z). Stucco_Block = full 1 m cube (blank wall). Half-timber look = Stucco_Prop_Support_* (Beam horizontal at wall plane, Pillar at local corner -X,+Z, Angled_* = diagonal brace) layered on stucco.
Next approach: owner builds 1-2 reference houses in Blender from the kit; a script reads the piece names + transforms and derives adjacency/stacking rules (which piece above/next to which). Generator then uses those rules (or wave-function-collapse from papit). Render each step and compare with the screenshots.
View now uses @polywar/gallery `items` (gltf per variant); gallery opens the preview.
