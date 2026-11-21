"""Exports every mesh object of a .blend as its own .glb (object name), placed at the origin, into a folder.

  blender -b <file.blend> -P tools/blender/split.py -- <out folder>

Same preparation as export.py (textures baked to vertex colours, principled materials).
"""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import pw
import export as ex

out = [x for x in pw.args() if not x.startswith("--")][0]
ex.realize_instances()
ex.principled_materials()
# textured materials keep their image + uvs (the game draws the texture), the rest get vertex colours
for m in bpy.data.materials:
    if m.node_tree and any(n.type == "TEX_IMAGE" and n.image for n in m.node_tree.nodes):
        m["texture"] = 1
ex.textures_to_vertex_colours(per_corner=True)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent is None]
for o in meshes:
    for other in bpy.context.scene.objects:
        other.select_set(other == o)
    keep = o.location.copy()
    o.location = (0, 0, 0)
    bpy.context.view_layer.update()
    path = os.path.join(out, o.name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, use_selection=True,
                              export_animations=False, export_vertex_color="ACTIVE", export_image_format="NONE")
    o.location = keep
    print("exported", o.name)
