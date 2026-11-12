"""Builds a two legged animal `model.blend` (chicken like): armature with leg IK, a blocky skin and base clips.

Blender space: Z up, faces -Y, its left is +X (.L bones). Height ~0.5 m, origin between the feet.

Bones:
  root > body > neck > head > beak
         body > tail, wing.L/R, thigh.L/R > shin > foot > toe
  root > foot.ik, knee.pole   (controls, not deforming)
IK: shin -> foot.ik (pole knee.pole), chain 2, on. foot copies the world rotation of foot.ik.
Clips (in place, loop): idle, walk, peck.
"""
import bpy, bmesh, math, os
from mathutils import Matrix, Vector
import pw, human_rig

FPS = human_rig.FPS

SPINE = {
    "root": ((0, 0, 0), (0, .1, 0), None, False),
    "body": ((0, .06, .3), (0, -.1, .34), "root", True),
    "neck": ((0, -.1, .34), (0, -.13, .45), "body", True),
    "head": ((0, -.13, .45), (0, -.19, .48), "neck", True),
    "beak": ((0, -.19, .47), (0, -.24, .46), "head", True),
    "tail": ((0, .06, .32), (0, .15, .42), "body", True),
}
SIDE = {
    "wing": ((.07, -.06, .36), (.08, .1, .33), "body", True),
    "thigh": ((.05, .01, .28), (.05, -.04, .18), "body", True),
    "shin": ((.05, -.04, .18), (.05, .01, .05), "thigh", True),
    "foot": ((.05, .01, .05), (.05, -.01, .01), "shin", True),
    "toe": ((.05, -.01, .01), (.05, -.08, .01), "foot", True),
    # controls
    "foot.ik": ((.05, .01, .05), (.05, -.01, .01), "root", False),
    "knee.pole": ((.05, -.4, .18), (.05, -.44, .18), "root", False),
}


def bones():
    """name -> (head, tail, parent, deform), both sides."""
    out = dict(SPINE)
    for n, (h, t, p, d) in SIDE.items():
        for side, s in (("L", 1), ("R", -1)):
            par = p if p in SPINE else f"{p}.{side}"
            out[f"{n}.{side}"] = ((h[0] * s, h[1], h[2]), (t[0] * s, t[1], t[2]), par, d)
    return out


def build(folder):
    pw.empty_file()
    scene = bpy.context.scene
    scene.render.fps = FPS
    arm = _armature()
    _constraints(arm)
    _skin(arm)
    _clips(arm)
    scene.frame_start, scene.frame_end = 0, FPS
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "model.blend")
    bpy.ops.wm.save_as_mainfile(filepath=path)
    print("saved", os.path.relpath(path, pw.ROOT))


def _armature():
    data = bpy.data.armatures.new("rig")
    data.display_type = "OCTAHEDRAL"
    arm = bpy.data.objects.new("rig", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.show_in_front = True
    bpy.ops.object.mode_set(mode="EDIT")
    spec = bones()
    for name, (h, t, p, d) in spec.items():
        b = data.edit_bones.new(name)
        b.head, b.tail, b.roll = h, t, 0
        b.use_deform = d
    for name, (h, t, p, d) in spec.items():
        if p:
            b = data.edit_bones[name]
            b.parent = data.edit_bones[p]
            b.use_connect = (b.parent.tail - b.head).length < 1e-5
    for side in "LR":
        for limb in ("thigh", "shin"):
            b = data.edit_bones[f"{limb}.{side}"]
            b.align_roll(data.edit_bones[f"knee.pole.{side}"].head - b.head)
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for b in data.bones:
        if not b.use_deform:
            b.color.palette = "THEME09" if b.name.startswith("foot.ik") else "THEME03"
    return arm


def _constraints(arm):
    for side in "LR":
        ik = arm.pose.bones[f"shin.{side}"].constraints.new("IK")
        ik.name = "IK"
        ik.target, ik.subtarget = arm, f"foot.ik.{side}"
        ik.pole_target, ik.pole_subtarget = arm, f"knee.pole.{side}"
        ik.chain_count = 2
        ik.pole_angle = human_rig._pole_angle(arm, f"shin.{side}", f"foot.ik.{side}", ik)
        cr = arm.pose.bones[f"foot.{side}"].constraints.new("COPY_ROTATION")
        cr.name = "Copy Rotation"
        cr.target, cr.subtarget = arm, f"foot.ik.{side}"


def _skin(arm):
    def material(name, colour):
        m = bpy.data.materials.new(name)
        m.diffuse_color = colour
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = colour
        m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .8
        return m

    me = bpy.data.meshes.new("bird")
    obj = bpy.data.objects.new("bird", me)
    bpy.context.scene.collection.objects.link(obj)
    for m in (material("feathers", (.92, .9, .84, 1)), material("beak", (.95, .6, .1, 1)), material("comb", (.8, .1, .08, 1))):
        me.materials.append(m)
    names = [b.name for b in arm.data.bones if b.use_deform]
    for n in names:
        obj.vertex_groups.new(name=n)
    bm = bmesh.new()
    dl = bm.verts.layers.deform.verify()

    def part(bone, r0, r1, sx=1, sz=1, ext=(0, 0), segs=6, mat=0):
        b = arm.data.bones[bone]
        length = b.length + ext[0] + ext[1]
        m = b.matrix_local @ Matrix.Translation((0, length / 2 - ext[0], 0)) @ Matrix.Diagonal((sx, 1, sz, 1)) @ Matrix.Rotation(-math.pi / 2, 4, "X")
        geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r0, radius2=r1, depth=length, matrix=m)
        g = names.index(bone)
        for v in geom["verts"]:
            v[dl][g] = 1.0
        for f in {f for v in geom["verts"] for f in v.link_faces}:
            f.material_index = mat

    part("body", .1, .09, 1, 1.05, (.05, .04), segs=8)
    part("neck", .045, .04, ext=(.02, 0))
    part("head", .045, .04, 1, 1.1, (.02, .01))
    part("beak", .018, .002, 1, .7, segs=4, mat=1)
    part("tail", .06, .02, .5, 1.2, (.02, 0), segs=5)
    for s in "LR":
        part(f"wing.{s}", .035, .015, .4, 1.6, (.02, 0), segs=5)
        part(f"thigh.{s}", .04, .03, ext=(-.01, 0))
        part(f"shin.{s}", .012, .01, segs=4, mat=1)
        part(f"foot.{s}", .012, .012, segs=4, mat=1)
        part(f"toe.{s}", .012, .006, 2.5, .5, segs=4, mat=1)
    # comb on the head
    b = arm.data.bones["head"]
    geom = bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(b.head_local + Vector((0, -.02, .05))) @ Matrix.Diagonal((.012, .06, .035, 1)))
    g = names.index("head")
    for v in geom["verts"]:
        v[dl][g] = 1.0
    for f in {f for v in geom["verts"] for f in v.link_faces}:
        f.material_index = 2

    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    obj.parent = arm
    mod = obj.modifiers.new("rig", "ARMATURE")
    mod.object = arm
    return obj


class Clip(human_rig.Clip):
    """human_rig.Clip without the arm IK keys."""

    def __init__(self, arm, name, length):
        self.arm, self.name, self.length = arm, name, length
        arm.animation_data_create()
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)

    def done(self):
        ad = self.arm.animation_data
        action = ad.action
        action.name = self.name
        action.use_fake_user = True
        track = ad.nla_tracks.new()
        track.name = self.name
        track.strips.new(self.name, 0, action)
        track.mute = True
        ad.action = None
        for pb in self.arm.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
        return action


def _phases(n=8):
    return [i / n for i in range(n + 1)]


def _clips(arm):
    # idle: breathing, looking around
    c = Clip(arm, "idle", 3)
    for p in _phases(6):
        t, b = p * 3, math.sin(2 * math.pi * p)
        c.move("body", t, (0, 0, .004 * math.sin(4 * math.pi * p)))
        c.rot("neck", t, [("z", 25 * b)])
        c.rot("head", t, [("x", 8 * math.sin(6 * math.pi * p))])
        c.rot("tail", t, [("x", 4 * b)])
        for s in "LR":
            c.move(f"foot.ik.{s}", t, (0, 0, 0))
    c.done()

    # walk: short quick steps, head bobs (holds still while the body passes)
    length, stride, lift = .8, .12, .05
    c = Clip(arm, "walk", length)
    for p in _phases(8):
        t = p * length
        for side, off in (("L", 0), ("R", .5)):
            f = (p + off) % 1
            if f < .5:
                y, z = -stride / 2 + stride * (f / .5), 0
            else:
                g = (f - .5) / .5
                y, z = stride / 2 - stride * (3 * g * g - 2 * g * g * g), lift * math.sin(math.pi * g)
            c.move(f"foot.ik.{side}", t, (0, y, z))
        w = math.cos(2 * math.pi * p)
        c.move("body", t, (.006 * w, 0, -.012 + .006 * math.cos(4 * math.pi * p)))
        c.rot("body", t, [("y", 4 * w)])
        c.move("neck", t, (0, .02 * math.sin(4 * math.pi * p), 0))
        c.rot("tail", t, [("z", 6 * w)])
        c.sides("wing", t, [("y", 3 * math.sin(4 * math.pi * p))])
    c.done()

    # peck: head down to the ground and back
    c = Clip(arm, "peck", 1)
    for t, down in ((0, 0), (.25, 1), (.35, 1), (.45, .6), (.55, 1), (.7, 0), (1, 0)):
        c.rot("body", t, [("x", -25 * down)])
        c.rot("neck", t, [("x", -50 * down)])
        c.rot("head", t, [("x", -20 * down)])
        c.rot("tail", t, [("x", 15 * down)])
        for s in "LR":
            c.move(f"foot.ik.{s}", t, (0, 0, 0))
    c.done()
