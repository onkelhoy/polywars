# Plan

## Where we are
Round 2 (owner review 2026-11-13, screenshots): network fixes + scenario views. Confirmed: level crossings OK, no roundabouts for now. Branch `feature/infrastructure`.
Round 1 (tasks 0–9: sweep, rail, bridges, portals, placements, trails, boardwalks) done, see git log.

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

## Tasks (round 2)
- [ ] 1. Scenario views in `@polywar/roads` (flat ground, hand made cases, all drawn with the real builders): T, X, angled Y, road + path beside it, road / rail level crossing, rail over road (bridge), rail switch + merge, bridge over a river, tunnel through a hill. Every fix below gets checked here first.
- [ ] 2. Junctions: roads meet with curved corners (fillets by class radius), X crossings get a shared pad mesh. Network keeps the junction contract (`at(siteId)`).
- [ ] 3. Separation rules in routing: road and rail never share or run along each other (only cross near 90°: level crossing, or bridge); two bridges never cross each other (bridge spans of different ways must not intersect); rail + rail merge with a switch or stay apart; paths follow roads on the shoulder (sidewalk / beside) instead of crossing them, near towns always; no way passes over another unless a real bridge with clearance.
- [ ] 4. Water rules: no routing along water (water cells only crossable by a straight bridge move, short, near 90° to the flow); bridges are straight (max bend), min radius enforced around span ends (kills the hairpin kinks).
- [ ] 5. Rivers and lakes: a river enters a lake at one point and leaves at another (outlet); the ribbon stops at the shore, never drawn over the lake / swamp.
- [ ] 6. Paths: no surface mesh (ground only, later a ground tint); only structures: boardwalks / docks on wet ground, steps + railing on very steep passes.
- [ ] 7. Fences follow the ground: generated fence runs (posts on the ground, rails between posts) instead of flat instanced pieces; asset fence kept for flat ground.
- [ ] 8. Tunnels that work: real hole in the terrain mesh at each mouth (terrain gets a `holes` option: triangles inside a mouth box are dropped), portal frames the hole, lining + dark plug inside; portal where cover ≥ portal height, cutting up to the face. Scenario view first, then world.

## Notes
- Owner trains while this runs: run "next task" through all, one line status each, commit per task on the branch. Don't merge to main; owner reviews.
- Headless check with playwright when a view needs a look (screenshot), no tests.
