# Plan

## Where we are
Round 3 (owner review 2026-11-13 evening, 14 screenshots on Desktop): "it looks buggy, fix it all". Owner away, runs on its own: "next task" through all, commit per task on `feature/infrastructure`, no merge.
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

## Tasks (round 3)
Seen in screenshots: bridge snaking along a river, bridge ends in grass / in the lake, rail trestle into a lake, roads overlapping (two strips on top of each other), road pieces not joined (gaps, steps, different widths), dips, hairpins next to bridges, stairs everywhere (flat ground, floating, buried), railings both sides on slopes, fences in the air, two lake levels side by side, tunnels invisible.
- [x] 1. Audit tool `tools/audit-ways.mjs` (node, esbuild bundle of src): generates the default world (terrain + hydrology + roads, no GL) and prints defects: bridges along water / not straight / ends wet, ways in water, junction end height + gap mismatch, overlapping parallel ways, min radius breaks, steps count / on flat, lake neighbours with different levels. Every fix below checked with it (+ scenario view).
- [x] 2. Route on the final water: roads built in the `fix` hook (after lakes + rivers exist, carve then), not before erosion. Kills bridges along rivers and rail / bridges ending in lakes. `bridgeWater` only for short leftovers; long or bent wet stretches never become bridges.
- [x] 3. One curve per through road: roads continuing through a junction (same class, ~straight) are shaped as one line, junction moved onto it; all ends at a junction pinned to one height. Min radius enforced after shaping (curvature smoothing, kept off water), span ends line up with the bridge / tunnel direction (no hairpins).
- [x] 4. Joined meshes: ways draws chains (continuing roads) as one sweep; junction pads built from the exact end vertices of the trimmed arms (shared vertices, no overlap); bridge decks start exactly at the road end (same width / height); road surfaces never under the ground, never floating (skirt down to ground).
- [x] 5. No ways on ways: paths / lanes that run along a bigger road for a stretch ride it (reuse) or keep a clear gap; no overlapping strips.
- [x] 6. Paths on slopes: no staircases by default; only short very steep hot spots get wooden beams (log steps set into the ground, each on the ground) or stepping stones; railing one side only, on the drop side, only over a real drop. No steps near roads / on flat.
- [x] 7. Fences: trail fences only on the drop side, never both, never two runs on top of each other, posts on the ground.
- [ ] 8. Lakes: one level per lake (no two water planes side by side), river + lake surfaces meet.
- [ ] 9. Tunnels that work: scenario view first (hole visible, portal frames it, lining under ground), then world.

## Notes
- Owner trains while this runs: run "next task" through all, one line status each, commit per task on the branch. Don't merge to main; owner reviews.
- Headless check with playwright when a view needs a look (screenshot), no tests.
