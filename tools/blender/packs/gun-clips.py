"""
Gun clips: adds a `shoot` action (the bolt handle jolts and settles) to a rigged gun blend, puts every action
kept (fake user) and exports model.glb next to it (skin + all actions). Copies the blend to original.blend first;
no NLA tracks (they made Blender play every clip at once).
Materials: Diffuse BSDF becomes Principled (same colour); faces on `wood` / `metal` get those colours when still default grey (set the colour in Blender to override).
Empties: `exit.bullet` (or `exit.barrel`) / `exit.shell` -> weapon.json points muzzle / eject + muzzleDir / ejectDir (their +z).
Bones: `bolt` (rotates round its own Y = the bolt axis). Actions named NOT-USED* are left out. Other actions (`cycle`, `reload`, ...) are kept as made.

  Blender -b assets/models/weapons/guns/<gun>/model.blend --python tools/blender/packs/gun-clips.py [-- --no-shoot]
"""
import bpy, math, os, shutil, sys
from mathutils import Quaternion

# the owner's file as it was, before anything here touches it
shutil.copy2(bpy.data.filepath, os.path.join(os.path.dirname(bpy.data.filepath), "original.blend"))

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
ad = arm.animation_data or arm.animation_data_create()
active = ad.action

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
    ad.action = active

# Diffuse BSDF (glTF can't export it) -> Principled with the same colour
for mat in bpy.data.materials:
    nt = mat.node_tree if mat.use_nodes else None
    if not nt: continue
    for d in [n for n in nt.nodes if n.type == "BSDF_DIFFUSE"]:
        col = tuple(d.inputs["Color"].default_value)
        p = nt.nodes.new("ShaderNodeBsdfPrincipled"); p.location = d.location
        p.inputs["Base Color"].default_value = col; p.inputs["Metallic"].default_value = 0; p.inputs["Roughness"].default_value = .8
        for l in list(d.outputs["BSDF"].links): nt.links.new(p.outputs["BSDF"], l.to_socket)
        nt.nodes.remove(d); mat.diffuse_color = col

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

# the tracks older runs of this script added (one per action, named like it): gone, the actions stay
for t in list(ad.nla_tracks):
    if len(t.strips) == 1 and t.strips[0].action and t.strips[0].action.name == t.name: ad.nla_tracks.remove(t)
for a in bpy.data.actions:
    if not a.name.startswith("NOT-USED"): a.use_fake_user = True
bpy.ops.wm.save_mainfile()

# meshes parented to a bone (rounds, clips kept as own objects): skinned to that bone for the glb only (not saved)
pos = arm.data.pose_position
arm.data.pose_position = "REST"
bpy.context.view_layer.update()
for o in [o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm and o.parent_type == "BONE"]:
    bone, mw = o.parent_bone, o.matrix_world.copy()
    o.parent_type = "OBJECT"; o.parent_bone = ""
    o.matrix_world = mw
    g = o.vertex_groups.new(name=bone)
    g.add(range(len(o.data.vertices)), 1.0, "REPLACE")
    o.modifiers.new("Armature", "ARMATURE").object = arm
    print("gun-clips: skinned", o.name, "to", bone)
arm.data.pose_position = pos
bpy.context.view_layer.update()

# the glb keys every bone in every clip (unkeyed = rest pose): bones a clip leaves alone take `base.ammo`'s pose instead
# (glb only, not saved). Toggle clips from weapon.json `animation.toggles` stay as they are (layered, own bones only).
import json
def bags(a): return [cb for l in a.layers for st in l.strips for cb in st.channelbags]
base = bpy.data.actions.get("base.ammo")
wj = os.path.join(os.path.dirname(bpy.data.filepath), "weapon.json")
toggles = set()
if os.path.exists(wj):
    for t in (json.load(open(wj)).get("animation", {}).get("toggles", {}) or {}).values():
        toggles |= {t.get(k) for k in ("clip", "on", "off")} - {None}
if base:
    src = [fc for cb in bags(base) for fc in cb.fcurves]
    for act in bpy.data.actions:
        if act == base or act.name.startswith(("base.", "NOT-USED")) or act.name in toggles or not bags(act): continue
        cb = bags(act)[0]
        have = {(fc.data_path, fc.array_index) for c in bags(act) for fc in c.fcurves}
        for fc in src:
            if (fc.data_path, fc.array_index) in have: continue
            n = cb.fcurves.new(fc.data_path, index=fc.array_index, group_name=fc.group.name if fc.group else "")
            n.keyframe_points.insert(act.frame_range[0], fc.evaluate(0))
        print("gun-clips: base.ammo under", act.name)

out = os.path.join(os.path.dirname(bpy.data.filepath), "model.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_apply=True,
    export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
    export_skins=True, export_def_bones=False, export_lights=False, export_cameras=False, export_image_format="NONE")
# the owner's empties -> weapon.json points (glTF space: x, z, -y): exit.bullet / exit.barrel = muzzle, exit.shell = eject; +z = direction
import json
wj = os.path.join(os.path.dirname(bpy.data.filepath), "weapon.json")
if os.path.exists(wj):
    gl = lambda v: [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]
    unit = lambda v: [round(x / (v.length or 1), 4) for x in (v[0], v[2], -v[1])]
    data = json.load(open(wj)); pts = data.setdefault("points", {})
    for names, key in ((("exit.bullet", "exit.barrel"), "muzzle"), (("exit.shell",), "eject")):
        o = next((bpy.data.objects[n] for n in names if n in bpy.data.objects), None)
        if not o: continue
        m = o.matrix_world
        pts[key] = gl(m.translation); pts[key + "Dir"] = unit(m.to_3x3().col[2])
    json.dump(data, open(wj, "w"), indent=4)
    print("gun-clips: points", {k: pts[k] for k in pts if k.startswith(("muzzle", "eject"))})

print("gun-clips:", out, [a.name for a in bpy.data.actions if not a.name.startswith('NOT-USED')])
