"""Builds the generated character models in assets/models/characters/<name>/model.blend.
`base` is the owner's hand-made rig now (not built here: lib/human_rig.py would overwrite it).

  blender -b -P tools/blender/packs/characters.py [-- --force]

Existing files are kept (hand edits) unless --force.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
import pw, bird_rig

FORCE = "--force" in pw.args()
for name, rig in (("bird", bird_rig),):
    folder = os.path.join(pw.ASSETS, "models", "characters", name)
    if FORCE or not os.path.exists(os.path.join(folder, "model.blend")):
        rig.build(folder)
    else:
        print("kept", os.path.relpath(folder, pw.ROOT))
