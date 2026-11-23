"""All @TastyTony store guns in one .blend, imported meshes + materials only (posed shape baked, world origin kept), one collection each.
Only a uniform scale about the world origin so they match in size; missing textures relinked from the gun's folder.
  blender -b --factory-startup -P tools/blender/packs/all_guns.py -- <@TastyTony folder>   -> <folder>/all-guns.blend"""
import bpy, os, glob, sys
from mathutils import Vector, Matrix
root = sys.argv[sys.argv.index("--") + 1]
LEN = {"beretta-m1951": .2, "beretta-model-57": .2, "beretta_model_57": .2, "borchardt": .35, "c96": .3, "nagant": .23, "nambu": .23,
       "luger": .22, "webley": .28, "welrod": .31, "double_deuce": .3, "mp-28": .81, "mp40": .83, "sten": .76, "sterling": .69,
       "thompson": .81, "madsen": 1.15, "lahti": 2.2, "ruger": .94, "gewehr_88": 1.25, "husqvarna": .25, "ithaca": 1.0}
bpy.ops.wm.read_homefile(use_empty=True)
scene = bpy.context.scene
def pick(d):
    for pat in ("**/*.blend", "**/*.gltf", "**/*.glb", "**/*.fbx"):
        f = sorted(glob.glob(os.path.join(d, pat), recursive=True))
        if f: return f[0]
for d in sorted(p for p in glob.glob(os.path.join(root, "*")) if os.path.isdir(p)):
    name = os.path.basename(d).replace("low-poly-", "").replace("low-poly_", "")
    f = pick(d)
    had, hadimg = set(bpy.data.objects), set(bpy.data.images)
    if f.endswith(".blend"):
        with bpy.data.libraries.load(f, link=False) as (src, dst):
            dst.objects = src.objects
        for o in dst.objects:
            if o: scene.collection.objects.link(o)
    elif f.endswith(".fbx"): bpy.ops.import_scene.fbx(filepath=f)
    else: bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in had]
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    keep = [o for o in new if o.type == "MESH" and len(o.data.polygons) and o.visible_get()
            and not o.name.lower().startswith(("icosphere", "sphere"))]
    # bake pose + world transform into the mesh, then only the meshes stay
    for o in keep:
        m = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); m.transform(o.matrix_world)
        o.modifiers.clear(); o.data = m; o.parent = None; o.matrix_world = Matrix()
        o.vertex_groups.clear(); o.animation_data_clear()
    for o in new:
        if o not in keep: bpy.data.objects.remove(o)
    new = keep
    col = bpy.data.collections.new(name); scene.collection.children.link(col)
    for o in new:
        for c in list(o.users_collection): c.objects.unlink(o)
        col.objects.link(o)
    # textures: relink by file name from anywhere in the gun's folder
    files = {os.path.basename(p).lower(): p for p in glob.glob(os.path.join(d, "**", "*.*"), recursive=True)
             if p.lower().endswith((".png", ".jpg", ".jpeg", ".tga", ".bmp", ".tif"))}
    for im in set(bpy.data.images) - hadimg:
        if im.packed_file or im.source != "FILE": continue
        if not os.path.exists(bpy.path.abspath(im.filepath)):
            hit = files.get(os.path.basename(im.filepath.replace("\\", "/")).lower())
            if hit: im.filepath = hit; im.reload(); print("RELINK", name, os.path.basename(hit))
            else: print("MISSING", name, im.filepath)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ps = []
    for o in new:
        if o.type == "MESH":
            m = o.evaluated_get(dg).to_mesh(); ps += [o.matrix_world @ v.co for v in m.vertices]; o.evaluated_get(dg).to_mesh_clear()
    s = next((v for k, v in LEN.items() if k in name), 1.15) / max(max(p[k] for p in ps) - min(p[k] for p in ps) for k in range(3))
    for o in new: o.data.transform(Matrix.Scale(s, 4))
    print("OK", name, len(new), "mats:", len({m for o in new if o.type == "MESH" for m in o.data.materials if m}))
for a in list(bpy.data.armatures): bpy.data.armatures.remove(a)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for c in [c for c in bpy.data.collections if not c.all_objects]: bpy.data.collections.remove(c)
# Solid view shows the material colour too
for m in bpy.data.materials:
    n = next((n for n in m.node_tree.nodes if n.type in ("BSDF_PRINCIPLED", "BSDF_DIFFUSE")), None) if m.node_tree else None
    if n: m.diffuse_color = tuple(n.inputs[0].default_value[:3]) + (1,)
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, "all-guns.blend"))
