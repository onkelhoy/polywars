"""Every Modular Village piece in ONE .blend, to model own buildings from the kit.
blender -b -P tools/blender/kit-library.py -- [out.blend]   (default assets/models/buildings/modular-village/modular-village-kit.blend)
Collections per kind (Roof, Stucco, Stone, Wood, Prop, ...), one row per collection, 1 m grid, pieces keep their kit origin
(walls face +X in glTF = +X in Blender, Y up -> Z up). Baked pieces (quad + maps) go in "Baked". Every object is an asset
(Asset Browser, tag = kind). Pieces share nothing: edit freely, or link/append from this file.
"""
import bpy, sys, os
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KIT = os.path.join(ROOT, "assets/models/buildings/modular-village")
BAKED = os.path.join(KIT, "baked")
out = os.path.abspath(args[0]) if args else os.path.join(KIT, "modular-village-kit.blend")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

def kind(name):
    parts = name.split("_")
    if parts[0] in ("Wall", "Roof", "Stucco", "Stone") and len(parts) > 2 and parts[1] in ("Prop", "Accent"): return f"{parts[0]}_{parts[1]}"
    if name.startswith("Stone_to_Stucco"): return "Stone_to_Stucco"
    return parts[0]

def load(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in new:
        if o.type != "MESH": bpy.data.objects.remove(o)
    if not meshes: return None
    # one object per piece, origin = kit origin
    for o in meshes:
        o.matrix_world = o.matrix_world.copy()
        o.parent = None
    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for o in meshes: o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
    o = meshes[0]
    o.name = o.data.name = name
    for c in list(o.users_collection): c.objects.unlink(o)
    return o

groups = {}
def group(name):
    if name not in groups:
        groups[name] = bpy.data.collections.new(name)
        scene.collection.children.link(groups[name])
    return groups[name]

pieces = sorted(f[:-4] for f in os.listdir(KIT) if f.endswith(".glb"))
items = [(p, os.path.join(KIT, p + ".glb"), kind(p)) for p in pieces]
if os.path.isdir(BAKED):
    items += [(p + "_Baked", os.path.join(BAKED, p, "model.glb"), "Baked") for p in sorted(os.listdir(BAKED)) if os.path.exists(os.path.join(BAKED, p, "model.glb"))]

rows, cursor = {}, {}
for name, path, k in items:
    o = load(path, name)
    if not o: print("EMPTY", name); continue
    col = group(k)
    col.objects.link(o)
    if k not in rows: rows[k] = len(rows)
    # lay out: one row per kind along Blender X, rows along -Y, spacing by piece size
    size = max(o.dimensions.x, o.dimensions.y, 1)
    x = cursor.get(k, 0)
    o.location = (x, -rows[k] * 9, 0)
    cursor[k] = x + size + 1.5
    o.asset_mark()
    o.asset_data.tags.new(k)
    o.asset_generate_preview()

# labels: one text per row
for k, r in rows.items():
    t = bpy.data.objects.new(f"label {k}", bpy.data.curves.new(k, "FONT"))
    t.data.body = k
    t.data.size = 1.2
    t.location = (-8, -r * 9, 0)
    group(k).objects.link(t)

bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print("WROTE", out, len(items), "pieces,", len(groups), "collections:", ", ".join(groups))
