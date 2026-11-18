# Plan

## Where we are
`main` has everything: weapons assets, aim, gun feel, SSAO, shooting range, weapon editor, soldiers with body arms, recoil (one push, `control`), rigged Kar98k (`cycle` / `shoot` clips, wood / metal), muzzle flash on the bore. Open: `feature/arms-grip` tasks 4-5 (brace hand, aim at wall, backlog bits), gun obstruction in-game check.

## Tasks (confirmed, shooting range rework, `feature/range`)
Owner's `~/Developer/3d/shooting-range/model.blend` -> script -> `model.v2.blend` (owner fixes by hand after). Low poly, flat colours, natural, WW2 military. Long range stays.
1. Blender: the range in a ditch (dug out flat floor, earth banks + trenches along the sides), a dirt road down the middle to the far end, berm behind the last targets. Keep all distances (10..800 m).
2. Blender: targets split per board (no solid empty space under / between them); one carrier per lane for the near range (10/25/50/75/100) + 2 desk buttons per lane.
3. Blender: distance markers for every distance in the owner's style (red board, white stencil digits stacked), modelled; wood textures dropped (flat colours).
4. Blender: sandbags, rocks, crates, a few low poly props copied from the store; sandbag nests with a fixed spotting scope (tripod) for long range; binoculars on a desk to pick up.
5. Runtime: movable lane targets (F on a desk button -> next stop), marks ride with the target.
6. Runtime: binoculars (pick up, hold, zoom; shaky: breathing + raw mouse, no slow down) and fixed scopes (steady, high zoom).
7. Runtime: put a scope on any gun, adjust its position (like the aim tuning panel) and save.

## Tasks (confirmed, `feature/arms-grip`, branched off `feature/gun-obstruction`)
Done so far: body arms on the rig's IK + grip, 3 store soldiers, rig resync (owner's `characters/base/model.blend` is the authoring rig, `export.py --bake` -> FK clips + no controls, runtime IK from `HUMANOID.controls` via `Skeleton.addIK`, soldiers fitted from the blend by `lib/base_rig.py`, mannequin playable).
4. Brace hand: not aiming + close to a wall / fence (side + forward casts, hip–chest height), free hand (gun lowered / tucked / one-handed) blends off the gun onto it: IK to hit point + normal. Wall: `hand.flat`, fingers spread. Fence / rail (`bar` tag or from the hit): grip round it. Spring in / out, hysteresis, drops on overreach.
4b. Aim at a wall: aiming with barrel blocked pushes the body back softly (up to ~.4 m); no room behind = tuck. Walking forward into it while aiming is blocked. Over a fence the casts pass.
5. Backlog: papit math cleanup (play), drop box arms, mag / bullet grab, pockets, first shot flyer.

## Tasks (confirmed, done on `feature/gun-obstruction`, needs in-game check)
Gun obstruction: barrel reacts to geometry (deflect on a pole, tuck at a wall). Branch `feature/gun-obstruction`.
1. `obstruction` in `packages/play/viewmodel` (pure, no game logic): input = grip pivot + bore (world), barrel length, `Cast`. 3 casts (centre + left/right of barrel). Out: deflect yaw/pitch (smallest turn round the grip that clears the hit, side from the hit normal), pull back (m), tuck 0..1 + sign.
2. Rules: deflect up to ~30°; past it, blend to tuck (hysteresis 30°/20°); all 3 hit = wall, so pull back then tuck. Tuck up if obstacle low / pitch up, down otherwise.
3. ViewModel: springs for deflect / back / tuck, applied round the grip after the pose (like recoil). Tucked blocks ADS (aimed forced to 0).
4. Player: run obstruction each frame with `setting.cast`; firing unchanged (muzzle + bore already follow the gun).
5. Test: shooting range walls / stands (solid boxes) via its cast; no new view.
