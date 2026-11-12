# Plan: medieval house + village generator (`packages/generators/city-medieval`, `packages/generators/city`)

Owner goal: houses and villages like the store screenshots (`~/Desktop/*.png`, half-timber, gables, mill, bridge), every setting in the view must have a visible effect.
State (2026-11-11): tasks 1-17 done (commits on `city-generation-village-pack`). Open notes: no `Stone_Steps` (base is never raised), roof valleys by intersection (no `Corner_Inner`), curbs stop short of crossings, houses fill one lot per block row on small blocks.

## Rules for whoever implements (token budget is tight)
- Never place a piece from its name alone. Unknown piece → put it in a contact sheet, render, look once, write the fact down under "Kit facts".
- Check loop, no browser: `node tools/blender/render-house.mjs /tmp/pw/h.jpg <seed> '<settings json>' yaw=55 pitch=15 width=800 height=620` then Read the jpg. yaw 0 = looking at the front (+Z). Always render small jpg, one image per change, batch several changes per render.
- Contact sheet: write `[{piece, matrix}]` json (pieces 3 m apart) and run `/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_pieces.py -- in.json out.jpg yaw=60 pitch=25`.
- Build: `npx @papit/build` (root). Node can import `packages/generators/city-medieval/lib/bundle.js`.
- Don't re-read files you wrote. No tests, no subagents, short messages (see CLAUDE.md).
- Output stays `{piece, matrix}[]` (column-major, may contain scale). Seed + settings = same result. Game specifics stay out of `@polywar/city`.

## Kit facts (verified by render)
- 1 m cells, Y up, cell (x,z) centred on (x,z). Outside of every piece = local +X. `matrix(x,y,z,deg,mirror)`: deg 0 faces +X, 90 → -Z, 180 → -X, 270 → +Z; mirror flips local Z.
- Walls are solid 1 m blocks: `Stucco_Block`; windows are blocks too (`Stucco_Window_<Single|Double|Rounded>_<Narrow|Wide>[_Tall]`: `_Tall` = 2 m high, `_Wide` = 2 cells, second cell toward local +Z). Doorways same scheme. `Stone_to_Stucco_Doorway_Wide_Tall_1|2` = stone below, stucco above (2x2). `Wall_Prop_Door_Simple|Ornate` goes in the doorway's cell, +0.5 along the run for wide ones.
- Storey = 2 m. Ground storey: row 0 stone base, row 1 stucco with 1 m windows. Upper storeys use `_Tall` windows.
- Cladding and timber are thin and live in the cell OUTSIDE the wall (same rotation): `Stone_Wall_1..5` (baked quad exists), `Stucco_Prop_Support_Beam_1..3` (horizontal, at local y 0, so y = storey line), `..._Pillar_1..3` (1 m post at the local -X,+Z corner), `..._Angled_Large|Low|Small` (diagonal braces, not used yet).
- Roof wedges (`Roof_<Straight|Convex|Concave>_Side[_Eave][_Edge]`) are solid, high at local -X. Straight: tiles rise 1 m per row, on a 0.2 m foot (`RISE`, `FOOT`). `_Eave` = lowest row (overhang), `_Edge` = gable overhang on local -Z (mirror for the other gable end). `Roof_Accent_Ridge` runs along local X at local z +0.5, y = peak - 0.2.
- Under upper roof rows the gable is empty: fill with y-scaled `Stucco_Block` (done).
- Baked pieces (`BAKED` in `compose.ts`, `kitSource(base, baked)`): Stone_Wall_1..5, Stone_Floor_1|2, Cobblestone_Floor_1, Cobblestone_Dirt_Transition_1..4. In the browser they draw WHITE until `plan.md` b3/b4 (maps in game-mesh/preview). Blender render shows them textured.

- Convex/Concave rows: 0.7 high, rise .5, foot .2 (verified, rows look scalloped by design). `Kit_Window_Upper_*` = dormer house front facing +X with own roof. `Stone_Arch_Outer` arch face on +X, wall block above.
- Code: `core.ts` (Ctx, Box, Face, frame), `massing.ts`, `walls.ts`, `roof.ts`, `features/*.ts` (`{name,key,fits,plan,build}`).

## Unverified (bounds from `catalog.ts` only: render before use)
- Convex/Concave `RISE` .5 is a guess (browser screenshot looks plausible). Check row seams + gable fill + ridge height.
- `Wall_Prop_Windmill_1`: 7 m wheel centred on its origin, thin, on the wall plane.
- `Stone_Arch_Outer` (2 wide, 3 high, full arch front), `Stone_Arch` (2 wide, only y 1.6..3: the vault between two fronts), `Stucco_Arch_Half(_Outer)`.
- `Kit_Window_Upper_Straight|Convex`: dormer/gable front, 2 wide, 2 m wall + own little gable roof (3.2 / 2.7 high).
- `Roof_*_Corner_Inner|Outer[_Eave]` (hips, valleys of L/T roofs), `Roof_Accent_Rake_*` (z .2...4, purpose unclear), `Roof_Accent_Ridge_End`, `Roof_Prop_Chimney_Pipe`.
- `Waterwheel_*` (wheel, `Flume_*`, `Flume_Support_*`), `Canopy_*` (awning kit, 1.2 high), `Wood_Floor_*`, `Wood_Railing_*`, `Wood_Rope_*`, `Wood_Post_*`, `Wood_Steps(_Stucco)`, `Stone_Steps(_Side_1|2)`, `Stone_Stairs_Railing`, `Stone_Pillar(_Base)`, `Stone_Curb_1..4`, `Stone_Sewer_Grate_1|2`, `Dirt_*`, `Prop_*`, `Wall_Prop_Lamp|Sign_1|Bell_1`.

## Tasks
Each task: contact sheet of its unknown pieces → implement → one render with the feature forced "on" → fix → next. One line status per task.

1. **Structure for features.** Split `building.ts`: `massing` (list of boxes `{x,z,w,d,floors,ridge:"x"|"z"}`), `walls(box)`, `roof(box)`, then one function per feature taking a shared context `{rng, put, boxes, faces, settings}`. A face = `{n, deg, run, start, length, bays[]}` kept in the context so features can find free wall cells / the door. Feature rng = `rng.fork(name)` so toggling one feature does not reshuffle the others.
2. **Settings take effect** (`types.ts`, `settings.ts`): every `Tri` key is read with `on(name)`; report each in `features` (view label prints `features.shape`: currently "undefined"). Add `windows: "Single"|"Double"|"Rounded"|"random"` and `stone: Tri` (stone base). Bump the code prefix to `m2` in `encode`/`decode` (new fields appended), keep it short. View (`views/experiment`) gets inputs for the new fields; it builds its form from `TRI_KEYS`/`SHAPES`/`ROOFS`, extend those lists.
3. **Roof profiles**: verify Convex + Concave rise, fix `RISE`/`FOOT` per profile.
4. **Braces + gable window**: `Angled_*` on blank upper cells next to corners (mirror alternately); window block in the gable when depth >= 6.
5. **Shapes L / T**: second box (wing) at 90°, ridge along its own length, lower or equal floors. Walls: skip cells inside another box. Roof: wing roof runs into the main slope (cross gable): either let the solid wedges intersect (render: accept if no holes/z-fight) or use `Corner_Inner` valleys. Start with intersection.
6. **Dormers** (`bay`): `Kit_Window_Upper_*` on the eave row of the long sides, above a window bay, width >= 5. Replaces the eave pieces of its 2 cells.
7. **Jetty** (new Tri `jetty`): upper storeys of the front face moved out 0.5 m (matrix translation), `Beam` row + `Angled_Small` brackets under it. Only if it renders clean.
8. **Tunnel**: needs floors >= 2 and width >= 6. 2 cells wide passage through the depth: `Stone_Arch_Outer` on front and back faces, `Stone_Arch` vaults between, no blocks/cladding in the passage up to 3 m, floor row above it starts at y 3 (render to see what covers y 3..4). Door moves away from the tunnel.
9. **Windmill**: floors >= 2. Wheel on a gable end (face 0 or 2), hub at `top` (wall top) centred on the gable, in the outside cell. No window under the hub. Force a taller, narrower box (tower look) when on.
10. **Waterwheel**: on a side wall, wheel in the outside cells, axle at ~1.5 m, `Flume` + supports leading away. Low priority: do after the village if the pieces are unclear.
11. **Balcony**: upper storey, front or gable: `Stucco_Doorway_Narrow_Tall` replaces a window bay, `Wood_Floor_Straight` 2-3 cells in the outside cells at the storey line, `Wood_Railing_Straight`/`_Corner` around, `Angled_Low` brackets below.
12. **Awning**: `Canopy_*` over the door or a ground window (shop front), posts `Canopy_Beam`.
13. **Chimney**: stone on the slope (done), `Pipe` variant on the wall for small houses.
14. **Props** (`props`): against free ground wall cells and in front: barrels, crates, hay, broom, ladder (leaning, needs 2 floors), `Wall_Prop_Lamp` beside the door, `Wall_Prop_Sign_1` above it, cart beside the house. Never in front of door/tunnel. 0-5 per house.
15. **Ground** (`ground`): baked `Stone_Floor` under/around the footprint, `Stone_Steps` at the door when the base is raised.
16. **Village** (`@polywar/city` + `style.ts`): lots along streets, houses face the street (rotate whole house: multiply matrices), streets = baked `Cobblestone_Floor_1` (2x2), edges `Cobblestone_Dirt_Transition_*`, `Stone_Curb_*`, a square with `Prop_Well_1` (+ `Prop_Well_Cobblestone` base), `Prop_Lamp_Street` along streets, carts. Add `tools/blender/render-city.mjs` (same as render-house, calls the city generator). Compare with the Desktop screenshots.
17. **Cleanup**: remove unused settings/exports, README of both packages (settings table, code format), `plan.md` pointer.

Out of scope: bridge, mill building from the screenshots, maps in the browser (plan.md b3/b4), papit changes.
