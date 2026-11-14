# Backlog

## Playable character
- Third person camera (body + gun in the hand socket, attachments visible).
- Loadout screen: pick character, attachments, guns; then play.
- Ragdoll death (copy arrow-warfare `ragdoll`, verlet on the knight's bones).
- Damage: hurt arm (`steady` in `Gun.spread`), limbs off later.
- Gun sounds (no audio assets yet), shell ejection (`eject` bone + ammo `case.glb`).
- Gun pose per gun: hip / aim numbers are per kind (`player/src/holds.ts` `KIND`), tune per gun if needed.
- Knight helmet offsets in `character.json` are eyeballed; arms in first person are boxes (no knight arm mesh yet).
- Player on the real world: `ground` = terrain + road decks, colliders from props, bullets cast against them.

## World
- Save / load a generated world (skip generation): bake to a file / model, later pass over the network.
