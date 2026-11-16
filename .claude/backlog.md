# Backlog

## Playable character
- [ ] Elbow lag: elbows (IK pole in `player/src/arms.ts`) trail the hands a little when looking round (from the viewmodel turn springs).
- [ ] Gun reloads as real clips: hands on the magazine / clip, gun turned, sometimes put down. Simple reload first. Kar98k uses `cycle` (open, held, close) for now.
- [ ] More rigged guns like the Kar98k: `bolt` bone, `cycle` / `shoot` / `reload` actions, faces on `wood` / `metal`, `tools/blender/packs/gun-clips.py`.
- [ ] Recoil `control` from a tired / wounded meter; hip fire finesse (two hand grip steadier).
- [ ] Muzzle flash shape (star / cone, not squares).
- Third person camera (body + gun in the hand socket, attachments visible).
- Loadout screen: pick character, attachments, guns; then play.
- Ragdoll death (copy arrow-warfare `ragdoll`, verlet on the knight's bones).
- Damage: hurt arm (`steady` in `Gun.spread`), limbs off later.
- Phase D, body: breath / stamina (run -> sway, hold breath, black-out + look away + blink, out of breath), stances (crouch / sit / prone, capsule height), knight arms in first person (IK to `grip` / `fore` of weapon.json).
- Phase E, animation: base rig clip set (idle, walk, run, stances, transitions), per gun reload / bolt clips as IK targets over time in weapon.json, swap / pick up (toss the held gun as a `@papit/rigidbody` body, same `World` as debris, it settles and stays).
- New rifles are static meshes (no rig): bolts / levers don't move yet (phase E rigs them like `ww2_weapons.py`).
- Scopes: some float ~2 cm over the receiver (P14), `mount` in weapon.json per gun; `lens` (glass radius) is a guess (.018).
- Aperture rear sights (P14, Ross, MAS-36): `notch` is the housing top - 4 mm, set the hole by hand like the M1 if off.
- Pistols / pistol-grip guns (StG, Thompson) still hold by their bones (KIND numbers).
- Gun pose per gun: hip / aim numbers are per kind (`player/src/holds.ts` `KIND`), tune per gun if needed.
- Knight helmet offsets in `character.json` are eyeballed; arms in first person are boxes (no knight arm mesh yet).
- Player on the real world: `ground` = terrain + road decks, colliders from props, bullets cast against them.

- Gun sounds are synthesised (sfx-gen): good enough to play with, real recordings can replace files (list them in `sounds.json`). 20 MB of WAVs (32 kHz mono): OGG / fewer variants if the Pages size matters.
- Other players' guns: same `Feel.cue` with their gun place (far shots already come late and dull by distance).
- Papit reports: `rigidbody` has no heightfield / triangle mesh shape (debris makes hull tiles under moving pieces); its sweep and prune broad phase could be its own package (a general spatial index, papit has none).

- In-game zeroing: keys step the rear sight / scope turret (`Carried.zero`), like a real rifle; the range's `T` panel sets the default per gun.
- Downloads to import later (in ~/Downloads, Nov 14): low-poly soldier, willys jeep, ww2 headwear, street lights, medieval houses, wooden bench, simple / picnic table, goose, gun targets, gorebox range props, shooting range target, Zeiss Terra scope, `assets-low-poly.zip` (242 MB, unchecked).

- Case models for shot shells (12 gauge) and the 20 mm Lahti case: both use the .30-06 case now. Ithaca 37 ejects downward (it throws right now).
- `tools/blender/packs/store.mjs` still defaults to the old flat store layout (the store is now sorted into `Weapons/`, `Vehicles/`, ...).

- Hand editor (key H, next to T): side silhouette of the gun (2D from the model's triangles), drag R / L hand circles onto it, arms as lines shoulder -> elbow -> hand with draggable elbow + shoulder; live on the first person arms; kept in the browser, exported to weapon.json `hands` via `npm run aim`. Replaces hiding the arms.
- Elbow / shoulder per pose (hip / aimed).
- Action steps after a shot: bolt / pump / lever guns get a "cycle" step after "shot" (bolt-open / bolt-close cues); per gun reload animations fixed by the owner.
- Reloads in detail: rounds into the magazine, magazine swap, stripper clips.
- Fatigue lowers recoil `control`.

## Shooting range (`@polywar/shooting-range`)
Imported from the owner's .blend (`tools/blender/packs/shooting-range.py`), view `range`. Ideas from the owner:
- [ ] button to move the targets nearer / further (moving targets on the rails)
- [ ] binoculars ("kikare") on the roof to look down the range
- [ ] lamps
- [ ] gun per case picked on purpose (now: the first 15 of the loadout, in order)
- [ ] distance-marker numbers and the target face are textures: game-mesh draws one colour per face, so they are lost (model them, or textured draw). `Target(Square)` image points to a missing file in ~/Downloads
- [ ] booths are one mesh each: 973 face boxes; simpler collision if split into boxes in Blender

## World
- Save / load a generated world (skip generation): bake to a file / model, later pass over the network.
