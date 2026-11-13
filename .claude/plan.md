# Plan

## Where we are
Round 3 (owner review 2026-11-13 evening, 14 screenshots on Desktop): "it looks buggy, fix it all". Owner away, runs on its own: "next task" through all, commit per task on `feature/infrastructure`, no merge.
Round 4 running (owner away, plan + execute, commit per task). Round 3 tasks 1–9 done. Open: tight highway switchbacks, long mountain viaducts, rail station tangles, fragmented rivers, river→lake outlet steps.
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

## Tasks (round 4)
Owner review 2026-11-13 18:36 (11 screenshots on Desktop): "massively improved", but:
- [x] 1. Real tunnels: tunnel = after erosion (fix hook). Terrain over the whole tube raised to cover it (nothing pokes in), front cut to road level, hole only right behind each face; terrain drops every triangle touching a hole node (no spikes). New `tunnel()` tube mesh in `@polywar/bridges`: floor (road), walls, vault, kerbs / side rails, lamps; portal without plug / lining + apron in front. Ways builds the tube for every tunnel span.
- [x] 2. Props on roads: trail furniture (lamps, signposts, benches) never on any way (check all ways, not only its own).
- [x] 3. Junction raised spots: pads at the exact arm surface, no lifted patches over roads (s 2, 6, 8).
- [ ] 4. Roads joining bridges: no junction on a bridge with railings / truss; joining ways meet on ground or the railing / truss opens there (s 4).
- [ ] 5. Curved bridges: truss + deck sides follow the curve, no empty spots (s 5).
- [ ] 6. Water wedge above a lake (s 3): river mesh piece sticking out over the lake surface.

## Notes
- Owner trains while this runs: run "next task" through all, one line status each, commit per task on the branch. Don't merge to main; owner reviews.
- Headless check with playwright when a view needs a look (screenshot), no tests.
