"""Kit pieces -> an editable .blend (and/or .glb). Meshes are shared per piece (make single user to edit one).
blender -b -P tools/blender/assemble.py -- pieces.json out.blend [out.glb] [name=house]
pieces.json: [{ "piece": name, "matrix": 16 numbers (glTF, column-major), "file"?: path to glb }]
"""
import bpy, json, sys, os
from mathutils import Matrix

args = sys.argv[sys.argv.index("--") + 1:]
opt = dict(a.split("=", 1) for a in args if "=" in a)
files = [a for a in args if "=" not in a]
src, outs = files[0], files[1:]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KIT = os.path.join(ROOT, "assets/models/modular-village")

bpy.ops.wm.read_factory_settings(use_empty=True)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # glTF Y up -> Blender Z up
Ci = C.inverted()
loaded = {}
def load(path):
    if path not in loaded:
        before = set(bpy.data.objects)
        try: bpy.ops.import_scene.gltf(filepath=path)
        except Exception as e: print("MISSING", path, e); loaded[path] = []; return []
        new = [o for o in bpy.data.objects if o not in before]
        loaded[path] = [(o.data, o.matrix_world.copy()) for o in new if o.type == "MESH"]
        for o in new: bpy.data.objects.remove(o)
    return loaded[path]

name = opt.get("name", "house")
root = bpy.data.collections.new(name)
bpy.context.scene.collection.children.link(root)
groups = {}
count = 0
for p in json.load(open(src)):
    path = p.get("file") or os.path.join(KIT, p["piece"] + ".glb")
    if not os.path.isabs(path): path = os.path.join(ROOT, path)
    m = p["matrix"]
    M = C @ Matrix([m[0:16:4], m[1:16:4], m[2:16:4], m[3:16:4]]) @ Ci
    # one sub collection per kind (Roof, Stucco, Stone, ...)
    kind = p["piece"].split("_")[0]
    if kind not in groups:
        groups[kind] = bpy.data.collections.new(f"{name}.{kind}")
        root.children.link(groups[kind])
    for data, local in load(path):
        data.name = p["piece"]
        o = bpy.data.objects.new(p["piece"], data)
        o.matrix_world = M @ local
        groups[kind].objects.link(o)
        count += 1

for out in outs:
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if out.endswith(".glb"): bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True)
    else: bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print("WROTE", out, count, "objects")
