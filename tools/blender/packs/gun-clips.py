"""
Gun clips: adds a `shoot` action (the bolt handle jolts and settles) to a rigged gun blend, puts every action
on its own NLA track and exports model.glb next to it (skin + all actions).
Materials: faces on `wood` / `metal` get those colours when still default grey (set the colour in Blender to override).
Bones: `bolt` (rotates round its own Y = the bolt axis). Other actions (`cycle`, `reload`, ...) are kept as made.

  Blender -b assets/models/weapons/guns/<gun>/model.blend --python tools/blender/packs/gun-clips.py [-- --no-shoot]
"""
import bpy, math, os, sys
from mathutils import Quaternion

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
ad = arm.animation_data or arm.animation_data_create()

if "--no-shoot" not in args and "bolt" in arm.pose.bones:
    old = bpy.data.actions.get("shoot")
    if old: bpy.data.actions.remove(old)
    act = bpy.data.actions.new("shoot")
    ad.action = act
    pb = arm.pose.bones["bolt"]; pb.rotation_mode = "QUATERNION"
    for f, deg in [(0, 0), (1, -4), (3, 1.2), (5, -.5), (8, 0)]:
        pb.rotation_quaternion = Quaternion((0, 1, 0), math.radians(deg))
        pb.keyframe_insert("rotation_quaternion", frame=f)
    pb.rotation_quaternion = Quaternion()

COLOURS = {"wood": (.115, .067, .041, 1), "metal": (.07, .07, .07, 1)}
for name, colour in COLOURS.items():
    mat = bpy.data.materials.get(name)
    if not mat: continue
    mat.use_nodes = True
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf and all(abs(x - .8) < .02 for x in bsdf.inputs["Base Color"].default_value[:3]):
        bsdf.inputs["Base Color"].default_value = colour
        bsdf.inputs["Metallic"].default_value = 0
        mat.diffuse_color = colour

for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
for a in bpy.data.actions:
    a.use_fake_user = True
    tr = ad.nla_tracks.new(); tr.name = a.name
    tr.strips.new(a.name, int(a.frame_range[0]), a)
ad.action = None
bpy.ops.wm.save_mainfile()

out = os.path.join(os.path.dirname(bpy.data.filepath), "model.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_apply=True,
    export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
    export_skins=True, export_def_bones=False, export_lights=False, export_cameras=False, export_image_format="NONE")
print("gun-clips:", out, [a.name for a in bpy.data.actions])
