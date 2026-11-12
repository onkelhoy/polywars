"""Writes lower detail copies of a .glb next to it: <name>.lod1.glb, <name>.lod2.glb, ...

  blender -b -P tools/blender/lod.py -- <file.glb> <level> [<level> ...]

A level is one of
  <ratio>        per mesh: weld, collapse decimate to `ratio` of the triangles, flat shade (never below MIN_TRIS)
  hull:<verts>   one convex hull of the whole model cut down to about `verts` points, faces coloured by the nearest original face
  card:triangle  one flat triangle (+ small trunk quad) in x y, facing +z (glTF): drawn turned to the camera (scatter `cards`)
  card:quad      one flat quad, same
"""
import bpy, bmesh, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import pw


MIN_TRIS = 8


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


def joined():
    """All meshes as one object in world space (materials kept, per face)."""
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.parent = None
    obj.data.transform(obj.matrix_world)
    obj.matrix_world.identity()
    for o in [o for o in bpy.context.scene.objects if o is not obj]:
        bpy.data.objects.remove(o)
    return obj


def material_area(me):
    area = {}
    for p in me.polygons:
        area[p.material_index] = area.get(p.material_index, 0) + p.area
    return area


def hull(obj, verts):
    me = obj.data
    src = bmesh.new()
    src.from_mesh(me)
    tree = BVHTree.FromBMesh(src)
    mats = [f.material_index for f in src.faces]
    bm = bmesh.new()
    for v in src.verts:
        bm.verts.new(v.co)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    mod = obj.modifiers.new("hull", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = min(1, (2 * verts - 4) / max(len(me.polygons), 1))  # closed hull: tris = 2v - 4
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in me.polygons:
        _, _, i, _ = tree.find_nearest(p.center)
        p.material_index = mats[i] if i is not None else 0
        p.use_smooth = False
    src.free()


def card(obj, shape):
    me = obj.data
    lo, hi = Vector([min(v.co[i] for v in me.vertices) for i in range(3)]), Vector([max(v.co[i] for v in me.vertices) for i in range(3)])
    w = max(hi.x - lo.x, hi.y - lo.y) / 2  # blender is z up; the card lies in x z, facing -y (= glTF +z)
    area = material_area(me)
    top = max(area, key=area.get)
    # trunk: the material most used in the lowest fifth (if it is not the top one)
    low = {}
    for p in me.polygons:
        if p.center.z < lo.z + (hi.z - lo.z) * .2:
            low[p.material_index] = low.get(p.material_index, 0) + p.area
    trunk = max(low, key=low.get) if low else top
    bm = bmesh.new()
    if shape == "triangle":
        base = lo.z + (hi.z - lo.z) * .15 if trunk != top else lo.z
        f = bm.faces.new([bm.verts.new((-w, 0, base)), bm.verts.new((w, 0, base)), bm.verts.new((0, 0, hi.z))])
        f.material_index = top
        if trunk != top:
            t = w * .12
            g = bm.faces.new([bm.verts.new((-t, 0, lo.z)), bm.verts.new((t, 0, lo.z)), bm.verts.new((t, 0, base)), bm.verts.new((-t, 0, base))])
            g.material_index = trunk
    else:
        f = bm.faces.new([bm.verts.new((-w, 0, lo.z)), bm.verts.new((w, 0, lo.z)), bm.verts.new((w, 0, hi.z)), bm.verts.new((-w, 0, hi.z))])
        f.material_index = top
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False


def lod(src, level, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    if level.startswith("hull:"):
        hull(joined(), int(level[5:]))
    elif level.startswith("card:"):
        card(joined(), level[5:])
    else:
        for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
            reduce(obj, float(level))
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", export_yup=True, export_apply=True,
        export_animations=False, export_lights=False, export_cameras=False,
        export_vertex_color="ACTIVE", export_image_format="NONE",
    )
    print("exported", os.path.relpath(out, pw.ROOT))


if __name__ == "__main__":
    a = pw.args()
    src, levels = a[0], a[1:]
    for i, l in enumerate(levels):
        lod(src, l, os.path.splitext(src)[0] + f".lod{i + 1}.glb")
