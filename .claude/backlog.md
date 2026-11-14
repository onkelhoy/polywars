# Backlog

## Playable character
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

## World
- Save / load a generated world (skip generation): bake to a file / model, later pass over the network.
