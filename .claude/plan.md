# Plan: playable character (branch `feature/playable-character`)

## Where we are
Next: task 1.

## Tasks (folder `packages/play/`, reuse existing code first)
1. `@polywar/mover`: capsule controller on `height(x,z)` + colliders: walk, run, jump, slope limit (slide), steps, roads as ground. `walk()` uses it.
2. `@polywar/weapons`: gun specs (arrow-warfare `guns.ts`), per gun muzzle velocity / drop, fire rate, mag, reload -> glb clips, ADS blend, spread (hip, moving, bloom), recoil.
3. `@polywar/ballistics`: stepped bullets (gravity, drag), raycast, hit callback (point, normal, surface).
4. `@polywar/impacts`: tracers, hit particles (distance culled), decal hit marks.
5. `@polywar/viewmodel`: first person gun, spring sway, bob, recoil kick, ADS offset.
6. Sniper scope: lens render-to-texture, tube vignette, wheel zoom.
7. Knight `character.json` (sockets, attachments: helmets, pads). No Death clip (ragdoll later).
8. View `play/views/range`: slopes, road, targets 25-400 m, gun picker, knight first person.

## Later (backlog)
Third person camera, loadout screen, ragdoll death, damage / limbs, save / load generated world.
