"""Our vehicle glbs as static decor meshes (rest pose, one mesh each, centred, wheels on z 0, real size), for camp.blend.

  blender -b --factory-startup -P tools/blender/packs/camp-vehicles.py

Writes ~/Developer/3d/shooting-range/camp-vehicles.blend (generated: run again when a vehicle changes);
camp-upgrade.py links the meshes ("vehicle <name>"). Drivable versions come later.
"""
import bpy, bmesh, os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../.."))
VEH = os.path.join(ROOT, "assets/models/vehicles")
OUT = os.path.expanduser("~/Developer/3d/shooting-range/camp-vehicles.blend")
# name -> (glb, longest side in metres)
LIST = {
    "tank 1": ("tanks/Tank.glb", 7.0), "tank 2": ("tanks/Tank2.glb", 7.0), "tank 3": ("tanks/Tank3.glb", 7.0),
    "tank 4": ("tanks/Tank4.glb", 7.0), "tank ww2": ("ww2-tank/model.glb", 6.5), "truck": ("ww2-truck/model.glb", 6.5),
    "motorbike": ("ww2-motorcycle/model.glb", 2.2), "artillery": ("artillery/model.glb", 5.0),
    "bomber": ("ww2-bomber/model.glb", 26.0), "fighter": ("ww2-fighter/model.glb", 11.0),
}
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
for name, (path, length) in LIST.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(VEH, path))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == "ARMATURE":
            o.data.pose_position = "REST"
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    bm, mats = bmesh.new(), []
    for o in [o for o in new if o.type == "MESH"]:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(deps), depsgraph=deps)
        me.transform(o.matrix_world)
        off = len(mats)
        mats += list(me.materials)
        for p in me.polygons:
            p.material_index += off
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    for o in new:
        bpy.data.objects.remove(o)
    lo = Vector([min(v.co[i] for v in bm.verts) for i in range(3)])
    hi = Vector([max(v.co[i] for v in bm.verts) for i in range(3)])
    k = length / max(hi.x - lo.x, hi.y - lo.y)
    c = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for v in bm.verts:
        v.co = (v.co - c) * k
    me = bpy.data.meshes.new("vehicle " + name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    me.validate()
    me.use_fake_user = True
    o = bpy.data.objects.new("vehicle " + name, me)
    bpy.context.scene.collection.objects.link(o)
    print("vehicle", name, [round(x, 1) for x in o.dimensions])
bpy.ops.wm.save_as_mainfile(filepath=OUT)
