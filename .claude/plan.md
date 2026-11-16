# Plan

## Where we are
`main` has everything: weapons assets, aim, gun feel, SSAO, shooting range, weapon editor, soldiers with body arms, recoil (one push, `control`), rigged Kar98k (`cycle` / `shoot` clips, wood / metal), muzzle flash on the bore. No confirmed tasks; pick next from the backlog.

## Tasks (confirmed, done on `feature/gun-obstruction`, needs in-game check)
Gun obstruction: barrel reacts to geometry (deflect on a pole, tuck at a wall). Branch `feature/gun-obstruction`.
1. `obstruction` in `packages/play/viewmodel` (pure, no game logic): input = grip pivot + bore (world), barrel length, `Cast`. 3 casts (centre + left/right of barrel). Out: deflect yaw/pitch (smallest turn round the grip that clears the hit, side from the hit normal), pull back (m), tuck 0..1 + sign.
2. Rules: deflect up to ~30°; past it, blend to tuck (hysteresis 30°/20°); all 3 hit = wall, so pull back then tuck. Tuck up if obstacle low / pitch up, down otherwise.
3. ViewModel: springs for deflect / back / tuck, applied round the grip after the pose (like recoil). Tucked blocks ADS (aimed forced to 0).
4. Player: run obstruction each frame with `setting.cast`; firing unchanged (muzzle + bore already follow the gun).
5. Test: shooting range walls / stands (solid boxes) via its cast; no new view.
