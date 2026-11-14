# @polywar/characters

Every character of the game. Per character `assets/models/characters/<name>/`: `model.glb`, `model.rig.json` (export.py) and a hand written `character.json`.

- `Character.load(url)`: reads `character.json` (+ rig.json). `model` url, `skin` for `Model.load`, `socket()`, `part()`, `skins`, `missing()` (base rig bones the model lacks).
- `RIGS`: base rig specs (bones, parts, sockets). `HUMANOID` = `tools/blender/lib/human_rig.py`, `QUADRUPED` = the farm pack rig, `BIPED` = `bird_rig.py`. Animals: `<Name>.character.json` next to the glb.

- `character.json` extras: `scale` (model units -> metres), `attachments` (`{ model, bone, at, turn, scale, slot }`: worn on a bone, one per slot), `firstPerson` (`eye` bone + `offset`, `hide` bones).
- `Attachments(gl, character)`: `wear(name)`, `remove`, `toggle`, `slots`, `worn`, `draw(renderer, model, matrix)` (same matrix as the character). `boneOf(model, name)`: a bone's matrix in the glTF node frame (also for `Skeleton` skins).

View `views/`: pick a character, preview with bones, IK and clips, toggle attachments (knight: helmets, shoulder pads).
