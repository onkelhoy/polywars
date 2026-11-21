"""Owner's camp-props.blend -> one .glb per prop in assets/models/props/camp/ (sync: run again after editing).

  blender -b --disable-autoexec ~/Developer/3d/shooting-range/camp-props.blend -P tools/blender/packs/camp-props-export.py

Every top level mesh object (names starting with "_" are skipped: work in progress), each alone in its own space
(its mesh's origin = the asset's origin), named after the object: `fence.metal_closed_L` -> `fence-metal-closed-l.glb`.
Same export as the range (export.py: colours to vertex colours); materials with an image texture keep it (custom
property `texture`), so cut-outs like the fence mesh survive. The .blend is never saved.
Levels link these meshes; the range export points at these files (no copies).
"""
import bpy, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pw
import export as exporter

OUT = os.path.join(pw.ROOT, "assets/models/props/camp")

os.makedirs(OUT, exist_ok=True)
for m in bpy.data.materials:
    if m.use_nodes and any(n.type == "TEX_IMAGE" and n.image for n in m.node_tree.nodes):
        m["texture"] = 1
props = {re.sub(r"[^a-z0-9]+", "-", o.name.lower()).strip("-"): o.data
         for o in bpy.data.objects if o.type == "MESH" and not o.parent and not o.name.startswith("_")}
for f in os.listdir(OUT):
    if f.endswith(".glb") and f[:-4] not in props:
        os.remove(os.path.join(OUT, f))
for o in list(bpy.context.scene.objects):
    bpy.data.objects.remove(o)
for name, me in props.items():
    o = bpy.data.objects.new(name, me.copy())
    bpy.context.scene.collection.objects.link(o)
    exporter.export(os.path.join(OUT, name + ".glb"))
    bpy.data.objects.remove(o)
