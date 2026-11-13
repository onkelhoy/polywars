# Blender -b -P tools/blender/flat.py -- <file.glb> ...  : rewrite each glb with flat (per face) shading
import bpy, sys
files = sys.argv[sys.argv.index("--") + 1:]
for f in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f)
    for o in bpy.data.objects:
        if o.type != "MESH": continue
        for p in o.data.polygons: p.use_smooth = False
        if hasattr(o.data, "set_sharp_from_angle"): o.data.set_sharp_from_angle(angle=0)
        for m in list(o.modifiers):
            if m.type == "NODES" and "Smooth" in m.name: o.modifiers.remove(m)
    bpy.ops.export_scene.gltf(filepath=f, export_format="GLB", export_normals=True, export_apply=True)
    print("flat", f)
