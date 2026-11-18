"""The owner's humanoid rig: assets/models/characters/base/model.blend (armature `rig`: deform bones, controls,
constraints, clips). The soldier packs fit it onto their meshes; the file itself is only read, never saved.

- `bones()`: name -> (head, tail, parent, deform) at rest, like `human_rig.bones()`.
- `armature()`: appends a full copy (controls, constraints, NLA clips come along).
- `armature(deform_only=True)`: deform bones + `root` only, each back on the bone it starts at
  (hand -> forearm, foot -> shin, head -> neck), for fitting a mesh.
- `refit(arm)`: after moving bones, re-reads what depends on the rest (Child Of inverse, Limit Distance).
"""
import bpy, os
import pw

BLEND = os.path.join(pw.ASSETS, "models", "characters", "base", "model.blend")
NAME = "rig"
FPS = 30  # the blend's scene rate (clips are keyed at it)


def bones():
    with bpy.data.libraries.load(BLEND, link=False) as (src, dst):
        dst.armatures = [NAME] if NAME in src.armatures else src.armatures[:1]
    data = dst.armatures[0]
    out = {b.name: (tuple(b.head_local), tuple(b.tail_local), b.parent.name if b.parent else None, b.use_deform) for b in data.bones}
    bpy.data.armatures.remove(data)
    return out


def armature(deform_only=False):
    had = set(bpy.data.actions)
    with bpy.data.libraries.load(BLEND, link=False) as (src, dst):
        dst.objects = [NAME]
    arm = dst.objects[0]
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    if deform_only:
        arm.animation_data_clear()
        for a in [a for a in bpy.data.actions if a not in had]:  # the clips come with the full rig only
            bpy.data.actions.remove(a)
        for pb in arm.pose.bones:
            for c in list(pb.constraints):
                pb.constraints.remove(c)
        bpy.ops.object.mode_set(mode="EDIT")
        eb = arm.data.edit_bones
        for b in eb:
            if b.use_deform and b.parent and not b.parent.use_deform:
                home = next((o for o in eb if o.use_deform and o is not b and (o.tail - b.head).length < 1e-4), None)
                if home:
                    b.parent, b.use_connect = home, True
        for b in [b for b in eb if not b.use_deform and b.name != "root"]:
            eb.remove(b)
        bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def refit(arm):
    """Child Of inverses and Limit Distance radii as set in the blend, for the moved rest"""
    rest = lambda n: arm.matrix_world @ arm.data.bones[n].matrix_local
    for pb in arm.pose.bones:
        for c in pb.constraints:
            if c.type == "CHILD_OF" and c.subtarget:
                c.inverse_matrix = rest(c.subtarget).inverted()
            elif c.type == "LIMIT_DISTANCE" and c.subtarget:
                t = arm.data.bones[c.subtarget]
                at = t.head_local.lerp(t.tail_local, c.head_tail)
                c.distance = (pb.bone.head_local - at).length

