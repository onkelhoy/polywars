"""Writes lower detail copies of a .glb next to it: <name>.lod1.glb, <name>.lod2.glb, ...

  blender -b -P tools/blender/lod.py -- <file.glb> <ratio1> [<ratio2> ...]

Per mesh: weld (flat shaded files are unwelded), collapse decimate to `ratio` of the triangles,
flat shade again. Never below MIN_TRIS per mesh (tiny rocks stay as they are). Materials and the node layout stay as they are.
"""
import bpy, bmesh, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import pw


MIN_TRIS = 48


def reduce(obj, ratio):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(obj.data)
    bm.free()
    if hasattr(obj.data, "has_custom_normals") and obj.data.has_custom_normals:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    mod = obj.modifiers.new("lod", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    mod.ratio = min(1, max(ratio, MIN_TRIS / max(tris, 1)))
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons:
        p.use_smooth = False


def lod(src, ratio, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        reduce(obj, ratio)
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", export_yup=True, export_apply=True,
        export_animations=False, export_lights=False, export_cameras=False,
        export_vertex_color="ACTIVE", export_image_format="NONE",
    )
    print("exported", os.path.relpath(out, pw.ROOT))


if __name__ == "__main__":
    a = pw.args()
    src, ratios = a[0], [float(r) for r in a[1:]]
    for i, r in enumerate(ratios):
        lod(src, r, os.path.splitext(src)[0] + f".lod{i + 1}.glb")
