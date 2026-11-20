"""Owner's camp-props.blend -> one .glb per prop in assets/models/props/camp/ (sync: run again after editing).

  blender -b --disable-autoexec ~/Developer/3d/shooting-range/camp-props.blend -P tools/blender/packs/camp-props-export.py

Exports top level mesh objects whose name starts with one of PREFIXES, each alone at the origin (its own origin =
the asset's origin), `fence.metal_closed_L` -> `fence-metal-closed-l.glb`. Materials with an image texture keep it
(custom property `texture`), so cut-outs like the fence mesh survive. The .blend is never saved.
"""
import bpy, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
import pw

OUT = os.path.join(pw.ROOT, "assets/models/props/camp")
PREFIXES = ("fence.",)

os.makedirs(OUT, exist_ok=True)
for m in bpy.data.materials:
    if m.use_nodes and any(n.type == "TEX_IMAGE" and n.image for n in m.node_tree.nodes):
        m["texture"] = 1
for o in [o for o in bpy.data.objects if o.type == "MESH" and not o.parent and o.name.startswith(PREFIXES)]:
    bpy.ops.object.select_all(action="DESELECT")
    o.hide_set(False)
    o.select_set(True)
    at = o.location.copy()
    o.location = (0, 0, 0)
    name = re.sub(r"[^a-z0-9]+", "-", o.name.lower()).strip("-")
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True,
                              use_selection=True, export_animations=False, export_lights=False,
                              export_cameras=False, export_image_format="AUTO")
    o.location = at
    print("exported", os.path.relpath(path, pw.ROOT))
