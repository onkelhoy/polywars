"""Store soldiers (.fbx) -> assets/models/characters/<slug>/model.blend with our bone names (see human_rig).

  blender -b -P tools/blender/packs/soldiers.py

Source copies live in <slug>/source/. Meshes joined into one, transforms applied, stood up (head +Z),
scaled to HEIGHT, feet on the ground. Bones not in the map are dropped, their weights go to the nearest mapped
ancestor. Source animations are dropped (we use our own clips).
"""
import bpy, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from mathutils import Matrix, Vector
import pw, human_rig

HEIGHT = 1.8
SIDE = lambda m: {k + s: v + s for k, v in m.items() for s in (".L", ".R")}
US = {"Spine": "hips", "Spine.003": "spine", "Spine.002": "spine.1", "Spine.001": "chest", "Bone.001": "neck", "Head": "head",
      **SIDE({"Upperarm": "upper_arm", "Lowerarm": "forearm", "Hand": "hand", "Upperleg": "thigh", "Lowerleg": "shin", "Foot": "foot",
            "Fingers": "fingers.1", "Thumb": "thumb.1"}),
      # one mitten block for all four fingers (no index of its own) + thumb, 3 segments each (side mid-name)
      **{f"{a}.{s}.{n}": f"{b}.{i}.{s}" for a, b in (("Fingers", "fingers"), ("Thumb", "thumb"))
         for n, i in (("002", 2), ("001", 3)) for s in "LR"}}
MX = "mixamorig:"
DE = {MX + k: v for k, v in {"Hips": "hips", "Spine": "spine", "Spine1": "spine.1", "Spine2": "chest", "Neck": "neck", "Head": "head"}.items()}
for side, s in (("Left", ".L"), ("Right", ".R")):
    for k, v in {"Shoulder": "shoulder", "Arm": "upper_arm", "ForeArm": "forearm", "Hand": "hand", "UpLeg": "thigh",
                 "Leg": "shin", "Foot": "foot", "ToeBase": "toe",
                 **{f"Hand{a}{i}": f"{b}.{i}" for a, b in (("Thumb", "thumb"), ("Index", "index"), ("Middle", "fingers")) for i in (1, 2, 3)}}.items():
        DE[MX + side + k] = v + s
SOLDIERS = {"ww2-soldier-us": ("WW2Soldier.fbx", US), "ww2-soldier-german": ("WW2 soldier low poly.fbx", DE)}


def build(slug, src, names):
    folder = os.path.join(pw.ASSETS, "models", "characters", slug)
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(folder, "source", src))
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    # weights of dropped bones -> nearest mapped ancestor, then rename groups
    keep = lambda b: b if b is None or b.name in names else keep(b.parent)
    for o in meshes:
        for g in list(o.vertex_groups):
            b = arm.data.bones.get(g.name)
            if b is None or b.name in names:
                continue
            k = keep(b)
            if k:
                dst = o.vertex_groups.get(k.name) or o.vertex_groups.new(name=k.name)
                for v in o.data.vertices:
                    for e in v.groups:
                        if e.group == g.index:
                            dst.add([v.index], e.weight, "ADD")
            o.vertex_groups.remove(g)
    # one mesh, all transforms applied
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes + [arm]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = "body"
    body.parent = arm
    mod = next((m for m in body.modifiers if m.type == "ARMATURE"), None) or body.modifiers.new("armature", "ARMATURE")
    mod.object = arm
    # drop + rename bones
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in list(arm.data.edit_bones):
        if eb.name not in names:
            arm.data.edit_bones.remove(eb)
    bpy.ops.object.mode_set(mode="OBJECT")
    for b in arm.data.bones:
        b.name = names[b.name]  # renames the vertex groups too
    arm.name = "rig"
    # stand up, scale, feet on ground, centred
    bones = arm.data.bones
    up = (bones["head"].head_local - bones["hips"].head_local).normalized()
    rot = up.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    arm.matrix_world = rot @ arm.matrix_world
    bpy.context.view_layer.update()
    ps = [body.matrix_world @ v.co for v in body.data.vertices]
    lo, hi = Vector([min(p[i] for p in ps) for i in range(3)]), Vector([max(p[i] for p in ps) for i in range(3)])
    s = HEIGHT / (hi.z - lo.z)
    arm.matrix_world = Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))) @ arm.matrix_world
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); body.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    arm = to_base(arm, body)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, "model.blend"))
    print("wrote", slug, len(arm.data.bones), "bones")


# controls follow a deform bone: (bone, end) -> moved like that bone's head / tail
FOLLOW = {"root": None, "foot.ik": "foot", "knee.pole": "shin", "hand.ik": "hand", "elbow.pole": "forearm", "prop": "hand",
          **{f"{f}.ik": f"{f}.3:tail" for f in human_rig.FINGERS}, **{f"{f}.pole": f"{f}.2" for f in human_rig.FINGERS}}


def to_base(old, body):
    """Re-poses the soldier into the base rest pose (bone directions), bakes it, then swaps in the base armature
    (human_rig) fitted to the soldier's joints. Base bones the soldier lacks keep their base offset to the parent."""
    spec = human_rig.bones()
    # 1. pose: turn each bone onto the base direction, parents first
    bpy.context.view_layer.objects.active = old
    bpy.ops.object.mode_set(mode="POSE")
    for name in spec:
        pb = old.pose.bones.get(name)
        if pb is None:
            continue
        h, t = Vector(spec[name][0]), Vector(spec[name][1])
        bpy.context.view_layer.update()
        cur = (pb.tail - pb.head).normalized()
        q = cur.rotation_difference((t - h).normalized())
        m = pb.matrix.copy()
        pb.matrix = Matrix.Translation(pb.head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pb.head) @ m
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    # 2. bake the pose into the mesh, read the joints
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=next(m.name for m in body.modifiers if m.type == "ARMATURE"))
    have = {pb.name: (pb.head.copy(), pb.tail.copy()) for pb in old.pose.bones}
    bpy.data.objects.remove(old)
    # 3. base armature, fitted
    arm = human_rig._armature()
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    moved = {}
    for name, (h, t, par, _) in spec.items():
        b, base = eb[name], name.rsplit(".", 1)
        key = base[0] if base[-1] in "LR" else name
        side = "." + base[-1] if base[-1] in "LR" else ""
        if name in have:
            b.head, b.tail = have[name]
        else:
            ref = FOLLOW.get(key, "@parent")
            if ref is None:
                continue
            if ref == "@parent":
                d = moved.get(par, Vector())
            else:
                bone, _, end = ref.partition(":")
                d = moved.get(bone + side, Vector()) if not end else (Vector(eb[bone + side].tail) - Vector(spec[bone + side][1]))
            b.head, b.tail = Vector(h) + d, Vector(t) + d
        moved[name] = Vector(b.head) - Vector(h)
    # keep connected chains connected (shoulder tail -> upper_arm head, ...)
    for b in eb:
        kids = [c for c in b.children if c.use_connect]
        if kids:
            b.tail = kids[0].head
    for side in "LR":
        for limb, pole in (("thigh", "knee.pole"), ("shin", "knee.pole"), ("upper_arm", "elbow.pole"), ("forearm", "elbow.pole")):
            b = eb[f"{limb}.{side}"]
            b.align_roll(eb[f"{pole}.{side}"].head - b.head)
    bpy.ops.object.mode_set(mode="OBJECT")
    human_rig._constraints(arm)
    body.parent = arm
    body.modifiers.new("rig", "ARMATURE").object = arm
    bpy.context.scene.render.fps = human_rig.FPS
    human_rig._clips(arm)  # same rig: the base clips (idle, walk, run, fps-idle)
    return arm


if __name__ == "__main__":
    for slug, (src, names) in SOLDIERS.items():
        build(slug, src, names)
