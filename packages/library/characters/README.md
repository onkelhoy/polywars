# @polywar/characters

Every character of the game. Per character `assets/models/characters/<name>/`: `model.glb`, `model.rig.json` (export.py) and a hand written `character.json`.

- `Character.load(url)`: reads `character.json` (+ rig.json). `model` url, `skin` for `Model.load`, `socket()`, `part()`, `skins`, `missing()` (base rig bones the model lacks).
- `RIGS`: base rig specs (bones, parts, sockets). `HUMANOID` = `tools/blender/lib/human_rig.py`, `QUADRUPED` = the farm pack rig, `BIPED` = `bird_rig.py`. Animals: `<Name>.character.json` next to the glb.

View `views/`: pick a character, preview with bones, IK and clips.
