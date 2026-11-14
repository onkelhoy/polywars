# Plan

## Where we are
Round 7 (11.31–11.44 screenshots on Desktop: rivers, lakes, ways): confirmed, running task by task on `feature/infrastructure`, commit per task. Tasks 1–8 done; next: task 9 (portals). Task 12 dropped (owner: roads stay real meshes). Water audit: `node tools/audit-ways.mjs medium` line `water:` (all 0 except 1 pond end, 3 mouth nodes .24 m).
Task 7 leftovers (audit `ways stacked` 15 → 8): slab stub by a junction (777,-238); two highways overlapping at a shallow angle, ~1 m apart (405,720); highway junction 7 m right over the rail (476,-728), should bridge; highway fork off a bridge at 16% (-168,66); seed 2 station spur runs back along its own track (-283,-666).
Round 6 done (19.43 screenshots + owner notes), waiting for owner review. Open: rail at (268,-437) 20 m under ground in an uncarved cut; rail all-bridge into a station at highway-bridge height (-104,-704); gravel roads still meshes; built props no lods.
Round 3 (owner review 2026-11-13 evening, 14 screenshots on Desktop): "it looks buggy, fix it all". Owner away, runs on its own: "next task" through all, commit per task on `feature/infrastructure`, no merge.
Round 5 (19:09 screenshots: tunnels not connected, roads climbing into / blocking portals) done, waiting for owner review. Round 4 tasks 1–6 done. Next idea from owner: more tunnel detail once tunnels work. Round 3 tasks 1–9 done. Open: tight highway switchbacks, long mountain viaducts, rail station tangles, fragmented rivers, river→lake outlet steps.
Round 2 tasks 1–7 done, task 8 (tunnels) folded into round 3 task 8. Round 1 done, see git log.

## Rules for this plan
- Very low poly, reuse assets first (list below). New packages via `npm run create`, each with a `views/` page.
- Packages pure + decoupled: they take curves / spans / config, know nothing of terrain or world. `@polywar/world` wires them.
- Everything placed (bridges, portals, fences, lamps, benches, ...) goes through the placement record (task 7).
- River flow shader looked bad: leave it, don't polish water look here.

## Assets to reuse
- Rail: `assets/models/transport/train/RailwayTrack_Straight` / `_Curve` (cut one sleeper + one rail piece out in Blender).
- Arches / tunnels: `buildings/modular-village/Stone_Arch`, `Stone_Arch_Outer`, `Stucco_Arch_*`; `buildings/castle/Tunnel`, `Bridge`, `WallEntrance`.
- Railings / posts: `modular-village/Wood_Railing_*`, `Wood_Post_Large`, `Stone_Stairs_Railing`; `buildings/farm/Fence`, `Fence2`.
- Props: `assets/models/props/village/` (copied from arrow-warfare: bench, street-lamp, double-lamp, signpost, fence, lantern, stone-lantern, log, woodpile, barrel, crate, ...). `modular-village/Prop_Lamp_Street`, `Wall_Prop_Sign_1` (notice board). Rocks in `nature/`.

## Tasks (round 7)
- [x] 1. Rivers: lake water material, still (no flow / streaks), shore rim; ribbon wider than channel, edges dive into ground; cut exactly at lakes / sea.
- [x] 2. River levels: never rising, meets lake / sea / parent at its level; springs taper from a trickle; restarted pieces get a spring or go; waterfalls straight, connected above.
- [x] 3. Ground sealed to water after all hooks: channel under surface, banks / lake shores over it (lip); RTIN keeps those nodes exact. Measure triangles.
- [x] 4. Water audit (ground over river, floating river / lake edges, unconnected rivers = 0) + shots.
- [x] 5. Rail × rail: overlapping / side by side → one track or proper gap (also on trusses); crossings = real junction.
- [x] 6. Piers never on another way.
- [x] 7. Ways at different levels: no deck through deck, no stray truss bars, no forks hanging under a road.
- [x] 8. Tunnels: no forks / crossings underground.
- [ ] 9. Portals: no ground slab in the arch; no short bridge over the forecourt dip.
- [ ] 10. No dead ends at cliffs with stub railings.
- [ ] 11. Round 6 leftovers: rail 20 m under ground (268,-437); rail all-bridge into high station (-104,-704).
- [-] 12. (dropped) Gravel roads painted too.

## Tasks (round 6)
- [x] 1. Wireframe shows roads, bridges, tunnels, portals, fences, built props.
- [x] 2. Fewer bridges: dearer in routing, only over water / ways / real gaps; auto bridges from fills back to embankment unless very tall; no tall wood (lanes / paths max ~6 m).
- [x] 3. No bridges to nowhere: bridge ends on connected ground; drop stub ways that are mostly bridge.
- [x] 4. Merge ways: overlapping / side-by-side roads become one way; joining decks one deck, truss / parapet open over the whole join.
- [x] 5. Rail × road: clean level crossing (rail flush) or a real overpass.
- [x] 6. Small ways on the ground: lanes / paths (gravel roads where flat) painted into the terrain material, no mesh.
- [x] 7. Perf: way meshes chunked + culled, 2–3 lods (far: coarse step, no railings / lamps, simple truss); built props lods; profile before / after.

## Tasks (round 4)
Owner review 2026-11-13 18:36 (11 screenshots on Desktop): "massively improved", but:
- [x] 1. Real tunnels: tunnel = after erosion (fix hook). Terrain over the whole tube raised to cover it (nothing pokes in), front cut to road level, hole only right behind each face; terrain drops every triangle touching a hole node (no spikes). New `tunnel()` tube mesh in `@polywar/bridges`: floor (road), walls, vault, kerbs / side rails, lamps; portal without plug / lining + apron in front. Ways builds the tube for every tunnel span.
- [x] 2. Props on roads: trail furniture (lamps, signposts, benches) never on any way (check all ways, not only its own).
- [x] 3. Junction raised spots: pads at the exact arm surface, no lifted patches over roads (s 2, 6, 8).
- [x] 4. Roads joining bridges: no junction on a bridge with railings / truss; joining ways meet on ground or the railing / truss opens there (s 4).
- [x] 5. Curved bridges: truss + deck sides follow the curve, no empty spots (s 5).
- [x] 6. Water wedge above a lake (s 3): river mesh piece sticking out over the lake surface.

## Notes
- Owner trains while this runs: run "next task" through all, one line status each, commit per task on the branch. Don't merge to main; owner reviews.
- Headless check with playwright when a view needs a look (screenshot), no tests.
