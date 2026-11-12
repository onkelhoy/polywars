# @polywar/characters

Every character of the game. Per character `assets/models/characters/<name>/`: `model.glb`, `model.rig.json` (export.py) and a hand written `character.json`.

- `Character.load(url)`: reads `character.json` (+ rig.json). `model` url, `skin` for `Model.load`, `socket()`, `part()`, `skins`, `missing()` (base rig bones the model lacks).
- `RIGS` / `HUMANOID`: base rig specs (bones, parts, sockets). Humanoid = `tools/blender/lib/human_rig.py`.

View `views/`: pick a character, preview with bones, IK and clips.
