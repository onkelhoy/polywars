"""Store soldiers (.fbx) -> assets/models/characters/<slug>/model.blend with our bone names, on the base rig
(the owner's characters/base/model.blend, see lib/base_rig.py).

  blender -b -P tools/blender/packs/soldiers.py

Source copies live in <slug>/source/. Meshes joined into one, transforms applied, stood up (head +Z),
scaled to HEIGHT, feet on the ground. Bones not in the map are dropped, their weights go to the nearest mapped
ancestor. Source animations are dropped (we use our own clips).
"""
import bpy, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from mathutils import Matrix, Vector
import pw, base_rig

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


def to_base(old, body):
    """Re-poses the soldier into the base rest pose (bone directions), bakes it, then swaps in the base armature
    (base_rig: controls, constraints, clips) fitted to the soldier's joints. Deform bones the soldier lacks keep
    their base offset to the parent; controls move with the nearest fitted joint (each end on its own)."""
    spec = base_rig.bones()
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
    # 3. base armature, fitted: deform bones parents first, then the controls
    arm = base_rig.armature()
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    axes = {b.name: b.z_axis.copy() for b in eb}  # the owner's rolls (pole angles are set for them)
    moved = {}
    order = []
    def walk(b):
        order.append(b.name)
        for c in b.children:
            walk(c)
    for b in eb:
        if not b.parent:
            walk(b)
    for name in order:
        h, t, par, deform = spec[name]
        if not deform and name != "root":
            continue
        b = eb[name]
        if name in have:
            b.head, b.tail = have[name]
        else:
            # the parent's end nearest this head (fingers sit at the hand's tail)
            ph, pt = (Vector(x) for x in spec[par][:2]) if par in spec else (Vector(), Vector())
            ends = moved.get(par, (Vector(), Vector()))
            d = ends[0] if (ph - Vector(h)).length < (pt - Vector(h)).length else ends[1]
            b.head, b.tail = Vector(h) + d, Vector(t) + d
        moved[name] = (Vector(b.head) - Vector(h), Vector(b.tail) - Vector(t))
    # joints that meet in the base meet here too (hand / foot / head sit on their limb's tail without a parent link)
    for name in order:
        h, _, _, deform = spec[name]
        if not deform:
            continue
        at = next((o for o in order if o != name and spec[o][3] and (Vector(spec[o][1]) - Vector(h)).length < 1e-4), None)
        if at:
            b, d = eb[name], Vector(eb[at].tail) - Vector(eb[name].head)
            if d.length > 1e-6:
                b.head, b.tail = b.head + d, b.tail + d
                moved[name] = (Vector(b.head) - Vector(h), Vector(b.tail) - Vector(spec[name][1]))
    moved = {k: v for k, v in moved.items() if spec[k][3]}
    joints = [(Vector(spec[n][e]), n, e) for n in moved for e in (0, 1)]
    def shift(p):
        _, n, e = min(joints, key=lambda j: (j[0] - p).length)
        return moved[n][e]
    for name in order:
        h, t, par, deform = spec[name]
        if deform or name == "root":
            continue
        b = eb[name]
        b.head, b.tail = Vector(h) + shift(Vector(h)), Vector(t) + shift(Vector(t))
    # keep connected chains connected (shoulder tail -> upper_arm head, control -> its .ik tip, ...)
    for b in eb:
        kids = [c for c in b.children if c.use_connect]
        if kids:
            b.tail = kids[0].head
    for b in eb:
        b.align_roll(axes[b.name])
    # poles into the fitted chain's bend plane (same distance, same side as in the base), so the rest stays put
    iks = [(pb.name, c.chain_count, c.pole_subtarget) for pb in arm.pose.bones for c in pb.constraints if c.type == "IK" and c.pole_subtarget]
    for tip, count, pole in iks:
        chain = [eb[tip]]
        while len(chain) < count and chain[-1].parent:
            chain.append(chain[-1].parent)
        root, end = Vector(chain[-1].head), Vector(chain[0].tail)
        line = (end - root).normalized()
        mid = sum((Vector(b.head) for b in chain[:-1]), Vector()) / max(1, len(chain) - 1)
        bend = (mid - root) - line * line.dot(mid - root)
        p = eb[pole]
        off = Vector(p.head) - mid
        if bend.length < 1e-3 or (off - line * line.dot(off)).length < 1e-6:
            continue
        side = 1 if (off - line * line.dot(off)).dot(bend) > 0 else -1
        to = mid + line * line.dot(off) + bend.normalized() * side * (off - line * line.dot(off)).length
        d = to - Vector(p.head)
        p.head, p.tail = p.head + d, p.tail + d
    bpy.ops.object.mode_set(mode="OBJECT")
    base_rig.refit(arm)
    body.parent = arm
    body.modifiers.new("rig", "ARMATURE").object = arm
    bpy.context.scene.render.fps = base_rig.FPS
    return arm


if __name__ == "__main__":
    for slug, (src, names) in SOLDIERS.items():
        build(slug, src, names)
