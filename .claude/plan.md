# Plan: playable character (branch `feature/playable-character`)

## Where we are
All 8 tasks done, waiting for owner feedback in the browser (`packages/play/player` view `range`). Next: owner's tuning notes, then pick from backlog (third person, loadout, ragdoll, world save).

## Done (folder `packages/play/`)
1. `@polywar/mover`: capsule controller (slopes slide, steps, colliders). `walk()` in viewport-camera runs on it.
2. `@polywar/weapons`: specs for all 7 guns + `m1-garand-scoped`, calibers, `Gun` state.
3. `@polywar/ballistics`: `Bullets`, casts, drop / zero.
4. `@polywar/impacts`: tracers, bits / dust per surface (culled > 150 m), marks, muzzle flash.
5. `@polywar/viewmodel`: held gun with springs; 6. `Scope` (own picture, scope shadow, reticle, zoom).
7. Knight `character.json` + `Attachments` in `@polywar/characters` (helmets, pads; first person hides head + arms).
8. `@polywar/player` + view `range`.
