# Plan

## Where we are
`feature/roads`: phase 1 done (2026-11-12), owner review. Open: lakes form after roads (pre-erosion routing can't see them: roads cross big lakes as long bridges; fix = priority-flood basins on the raw map and avoid them), rail zigzags (straight bridge/tunnel hops), world ready ~12.5 s (roads ~6 s), bridges drawn as flat strips.

## Design (read before any task)

Three new packages, all pure CPU, made with `npm run create`:
- `@polywar/pathfinding` (`utils/pathfinding`): generic, game-free (papit has none; candidate to move into papit). Typed-array binary heap; `astar(graph)` over any state space via callbacks (`neighbours(state, push)`, `heuristic`, `goal`); grid helper `gridSearch({ n, headings: 8 | 16, cost(from, to, heading, prevHeading) => number | Infinity, extra?(state, push) })` for (node, heading) states, so callers add special moves (bridges, tunnels). Also `alternatives(search, k, penalty, overlap)` (penalty method). Roads only supply costs.

In `packages/library/`:
- `@polywar/sites` (`library/sites`): *where* things are. Takes a raw `Ground` (`n, cell, size, height, seaLevel`; slope / sea derived inside) + the terrain's `cities`. Adds villages, farms, landmarks. No knowledge of roads.
- `@polywar/roads` (`library/roads`): *how* sites connect. Takes a `Ground` + `Site[]`. No knowledge of terrain package (it only reads grids). The view may use `@polywar/terrain` `generate()` as a devDependency.

sites and roads don't depend on each other in `src/` (roads depends on pathfinding); `@polywar/world` wires them later.

### Terrain order (owner, 2026-11-12)
Sites + roads work on the **raw shape** (before erosion), carve the ground, then erosion and the rest finish the terrain so roads look grown into it.
New terrain order: `shape → cities → features (hook) → erosion → water → rivers → fix (hook) → climate → biomes`.
- `cities` moves before erosion (works on raw height + sea level; lakes unknown yet → flat + above sea only, `water` score from sea distance).
- Terrain stays decoupled: `TerrainOptions` gets no roads options; `Generator` takes optional hooks (`new Generator({ features, fix })`), world passes them:
  - `features(raw: { n, cell, size, height, seaLevel, cities }) => Features | Promise<Features>` where `Features = { carve(height): void; hard: Float32Array /* n², 0..1: erosion strength × (1 - hard) on road beds / town pads */; key: string /* cache key */ }`.
  - `fix(data: TerrainData) => void`: after rivers/lakes exist; roads turn river crossings into bridges and road parts under a lake into bridge / causeway (or reroute that link), and may adjust height again (bridge abutments).
- erosion reads `hard` (droplets don't erode/deposit there; still flow over) so beds and town pads survive.
- Cache: `features` key joins the `erosion` stage key, so changing roads reruns erosion onward (shape cached).
- Forest cost: biomes don't exist before erosion → no forest cost in routing for now (highways cut through anyway). Later option: cheap moisture noise guess.
- Risk to watch: erosion can still dig gullies across a bed's sides; `hard` fades over the shoulder.

### Types (roads `src/types.ts`)
```ts
type SiteKind = "city" | "village" | "farm" | "peak" | "beach" | "lake" | "pass" | "viewpoint";
type Site = { id: number; kind: SiteKind; x: number; z: number; y: number; radius: number; weight: number };
type RoadClass = "highway" | "road" | "lane" | "path" | "rail";
type Span = { kind: "ground" | "bridge" | "tunnel"; from: number; to: number };   // indices into points
type Road = { id: number; class: RoadClass; from: number; to: number;             // node ids
              points: [number, number, number][];                                // x y z, every `step` m, z = graded bed height
              width: number; spans: Span[]; surface: string };
type Junction = { id: number; x: number; z: number; site?: number; roads: { road: number; angle: number; class: RoadClass }[] };
type Network = { roads: Road[]; junctions: Junction[] };
```
City builders later call `network.at(siteId)` → the junction with every incoming road + angle. That is the main contract: keep it.

### Road classes (config, `src/presets.ts`, era table)
Per class: `width`, `shoulder` (m of verge), `maxGrade` (highway .06, road .10, lane .15, path .35, rail .02), `turn` (turn cost: highway high, path low), `minRadius`, `bridge` (cost / m, max span), `tunnel` (cost / m, max length, min cover), `reuse` (discount for running on an existing road of same/higher class), `forest` (extra cost; highway ~0 = cut straight through), `surface`.
`ERAS = { ww2: {...} }`: 1940s = few wide highways (no motorways), many gravel roads + dirt lanes, rail between big cities, cobble inside towns. `era` option picks one; classes overridable.

### Pipeline (`generateRoads(ground, sites, options)`)
1. **cost grid**: coarse routing grid (`route.cell` ≈ 8 m → 384² on 3072 m). Per node: height, water (0 land / 1 sea / 2 lake / 3 river), biome forest flag. Downsample from the ground grid.
2. **topology** (`topology.ts`): which pairs to connect, per class, in order highway → rail → road → lane → path:
   - highway: cities, Gabriel / relative neighbourhood graph + `extra` share of next-shortest edges (loops = more than one way A→B).
   - rail: top `rail.count` cities by weight, minimum spanning tree + 1–2 extra edges.
   - road: each village to its 2 nearest of (city, village, highway junction); extra loops.
   - lane: each farm to nearest road/lane point.
   - path: landmarks (peak, beach, lake, viewpoint) to nearest road; villages to each other when close.
3. **routing** (`route.ts`): A* on (node, heading) states, 16 headings (knight moves so grades can be gentle). Move cost = length × (1 + grade penalty) + turn cost × heading change + forest + reuse discount. Grade over `maxGrade` → not allowed on ground; switchbacks fall out of this on mountains. Water / too steep crossings: bridge move (straight line over water or a valley, up to max span, cost per m) and tunnel move (straight line under ground with enough cover, up to max length). Bridges/tunnels expensive so they stay rare. Search itself is `@polywar/pathfinding` `gridSearch`; roads only give the cost + `extra` (bridge / tunnel) moves.
   - existing roads are written into a `used` grid (class per node) so later routes merge onto them → shared trunks, real junctions where they leave.
4. **alternatives** (`alternatives(a, b, k)`, uses pathfinding `alternatives`): penalty method: route, raise cost along the route ×`penalty`, route again; keep a route when it shares < `overlap` with the ones kept. Used by topology for `extra` loops and by the view.
5. **shape** (`shape.ts`): grid path → simplify (Douglas–Peucker, keep span ends) → smooth with Chaikin / Catmull-Rom limited by `minRadius` → resample every `step` m. Vertical: bed height = ground smoothed along the road, clamped to `maxGrade`; bridges/tunnels = straight line between their ends. Output points + spans.
6. **junctions** (`junctions.ts`): where a route joins / leaves another, split roads, make a junction, store incoming angles. Each site gets one junction at its centre (roads end there).
7. **queries** (`network.ts` class `Roads`): `at(siteId)`, `nearest(x, z)` → `{ road, distance, t, class, width }`, `mask(m)` → Float32Array m² (1 on road, falls to 0 across the shoulder; per class layer optional), `toJSON`/`load`.

### Sites (`@polywar/sites`)
`generateSites(ground, cities, options)` → `Site[]` (cities kept as `kind: "city"`, weight = score):
- villages: flat dry spots, smaller radius, `spacing` from cities and each other, `count`.
- farms: on grassland/savanna near cities and villages (ring `farm.near`), flat, `perTown`.
- landmarks: peak (local height max, prominence), beach (biome beach, along coast, spaced), lake (lake shore), pass (saddle between two high areas: low point on a ridge), viewpoint (high slope edge next to flat).
Seeded, same input = same output.

### Views
Fast experimenting: views run **raw shape only** (no erosion, no water/climate stages): terrain exports `shapeOnly(options)` → `{ n, cell, size, height, seaLevel }` + cities (sea = below sea level). Full pipeline only behind an "eroded" toggle (task 10b).
Drawing = plain 2D canvas lines, no meshes. Full world scale (3072 m default, map size from terrain options): canvas fits the whole map, pan + wheel zoom (view transform, redraw), line width in screen px per class (not metres) so roads stay visible zoomed out; scale bar in metres; cursor shows x z height.
- `sites/views/`: hillshade + sea, sites as icons by kind, seed + counts sliders.
- `roads/views/`: same map, roads as lines by class (colour + px width), bridges / tunnels dashed / marked, junctions as dots; toggles per class; click A then B → `alternatives(a, b, 4)` in different colours; sliders for class costs; route + total time shown.

## Tasks (phase 1)
- [x] 0. terrain: `shapeOnly(options)` (shape + cities, no erosion) for views; move `cities` before erosion; `Generator` hooks `features` + `fix`; erosion honours `hard`; `generate(options, hooks?)`; experiment view still works without hooks.
- [x] 1. Branch `feature/roads`. Create `library/sites` + `library/roads` via `npm run create`. Add `Site`/road types.
- [x] 2. 2D map view base (hillshade + sea, pan / zoom, scale bar, cursor readout) in each view folder (copy, no shared package yet).
- [x] 3. sites: villages + farms. View.
- [x] 4. sites: landmarks (peak, beach, lake, pass, viewpoint). View icons.
- [x] 5. pathfinding (`utils/pathfinding`): typed heap, `astar`, `gridSearch` (headings, `extra` moves), `alternatives`. View: grid with random walls / cost noise, click A→B, shows route + k alternatives + time.
- [x] 5b. roads: cost grid + grade limit on `gridSearch` (ground moves only). View: click A→B draws one route.
- [x] 6. roads: bridge + tunnel moves, spans. View marks them.
- [x] 7. roads: `used` grid + reuse discount; `alternatives` via pathfinding. View shows k routes.
- [x] 8. roads: shape (simplify, smooth by min radius, resample, graded bed height).
- [x] 9. roads: classes + `ERAS.ww2` presets; topology per class; `generateRoads` full network. View draws all.
- [x] 10. roads: junctions + `at(site)`, `nearest`, `mask`. View: hover shows nearest road; click site lists incoming roads.
- [x] 10b. roads: `features` (carve: bed flattened across width, cut/fill blended over shoulder, none under bridges / tunnels; `hard` mask) + `fix` (river / lake crossings). Roads view uses the hooks: before / after erosion toggle.
- [x] 10c. world: pass sites + roads hooks to the terrain; world code gets roads options.
- [x] 11. READMEs for both + facts.md section "Roads". Owner review.

## Phase 2 (after review, not confirmed)
- terrain mesh: RTIN `mesh.edges` along road edges so they stay sharp (like biome borders).
- ecosystem: `Ground.roads?` mask: no props within width + margin, grass fades over the shoulder; paths: no grass, props allowed beside.
- road surface drawing (ribbon on the carved ground, own package e.g. `road-mesh`).

## Phase 3 (backlog)
- Walking paths inside towns / fields, splitting round trees.
- Edge props: fences on steep sides, poles, lamps, stairs on steep paths, signposts (logical placement points only, from `Roads`).
- Rail drawing (sleepers, embankments), stations at cities.
- City / village builder reads `at(site)` incoming roads.
