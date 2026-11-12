"""Builds a humanoid character `model.blend`: armature with IK controls, a mannequin skin and base clips.

Blender space: Z up, the character faces -Y, its left is +X (.L bones). glTF: +Y up, faces +Z.
Rest pose is a T-pose (easy to map downloaded rigs onto). Height ~1.8 m, origin between the feet.

Bones (Blender style names, .L/.R so mirror tools work):
  root > hips > spine > spine.1 > chest > neck > head
                                  chest > shoulder > upper_arm > forearm > hand > thumb.1/2, index.1/2, fingers.1/2, prop
         hips > thigh > shin > foot > toe
  root > foot.ik, knee.pole, hand.ik, elbow.pole   (controls, not deforming)
IK: shin -> foot.ik (pole knee.pole), forearm -> hand.ik (pole elbow.pole), chain 2.
foot / hand copy the world rotation of foot.ik / hand.ik. Arm IK is 0 at rest (FK arms), on in fps clips.
Mannequin: rigid parts, one vertex group per bone (whole limbs can come off later).
Clips (in place, loop): idle, walk, run, fps-idle.
"""
import bpy, bmesh, math, os
from mathutils import Matrix, Vector, Quaternion
import pw

FPS = 30

# name: (head, tail, parent, deform); .L only, .R is mirrored on X
SPINE = {
    "root": ((0, 0, 0), (0, .25, 0), None, False),
    "hips": ((0, 0, .98), (0, 0, 1.08), "root", True),
    "spine": ((0, 0, 1.08), (0, 0, 1.2), "hips", True),
    "spine.1": ((0, 0, 1.2), (0, 0, 1.32), "spine", True),
    "chest": ((0, 0, 1.32), (0, 0, 1.5), "spine.1", True),
    "neck": ((0, 0, 1.5), (0, -.01, 1.6), "chest", True),
    "head": ((0, -.01, 1.6), (0, -.01, 1.82), "neck", True),
}
SIDE = {
    "shoulder": ((.03, 0, 1.45), (.17, .01, 1.46), "chest", True),
    "upper_arm": ((.18, .01, 1.45), (.46, .03, 1.45), "shoulder", True),
    "forearm": ((.46, .03, 1.45), (.72, .01, 1.45), "upper_arm", True),
    "hand": ((.72, .01, 1.45), (.8, .01, 1.45), "forearm", True),
    "thumb.1": ((.74, -.025, 1.44), (.775, -.055, 1.43), "hand", True),
    "thumb.2": ((.775, -.055, 1.43), (.8, -.075, 1.425), "thumb.1", True),
    "index.1": ((.8, -.022, 1.45), (.84, -.022, 1.45), "hand", True),
    "index.2": ((.84, -.022, 1.45), (.875, -.022, 1.45), "index.1", True),
    "fingers.1": ((.8, .012, 1.45), (.84, .012, 1.45), "hand", True),
    "fingers.2": ((.84, .012, 1.45), (.87, .012, 1.45), "fingers.1", True),
    "prop": ((.77, -.005, 1.43), (.77, -.105, 1.43), "hand", False),
    "thigh": ((.1, 0, .95), (.1, -.02, .52), "hips", True),
    "shin": ((.1, -.02, .52), (.1, .0, .09), "thigh", True),
    "foot": ((.1, 0, .09), (.1, -.12, .03), "shin", True),
    "toe": ((.1, -.12, .03), (.1, -.19, .03), "foot", True),
    # controls
    "foot.ik": ((.1, 0, .09), (.1, -.12, .03), "root", False),
    "knee.pole": ((.1, -.6, .52), (.1, -.65, .52), "root", False),
    "hand.ik": ((.72, .01, 1.45), (.8, .01, 1.45), "root", False),
    "elbow.pole": ((.46, .5, 1.45), (.46, .55, 1.45), "root", False),
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
    scene.frame_start, scene.frame_end = 0, FPS * 2
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
    # limb bones: Z axis towards the pole, so IK keeps their twist (clean pole angles, knees bend on their hinge)
    for side in "LR":
        for limb, pole in (("thigh", "knee.pole"), ("shin", "knee.pole"), ("upper_arm", "elbow.pole"), ("forearm", "elbow.pole")):
            b = data.edit_bones[f"{limb}.{side}"]
            b.align_roll(data.edit_bones[f"{pole}.{side}"].head - b.head)
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    # colour sets like a Blender rig: controls stand out
    for b in data.bones:
        if not b.use_deform:
            b.color.palette = "THEME09" if b.name.startswith(("foot.ik", "hand.ik")) else "THEME03"
    return arm


def _constraints(arm):
    for side in "LR":
        for limb, tip, end, target, pole, weight in (("leg", f"shin.{side}", f"foot.{side}", f"foot.ik.{side}", f"knee.pole.{side}", 1),
                                                      ("arm", f"forearm.{side}", f"hand.{side}", f"hand.ik.{side}", f"elbow.pole.{side}", 0)):
            ik = arm.pose.bones[tip].constraints.new("IK")
            ik.name = "IK"
            ik.target, ik.subtarget = arm, target
            ik.pole_target, ik.pole_subtarget = arm, pole
            ik.chain_count = 2
            ik.influence = weight
            ik.pole_angle = _pole_angle(arm, tip, target, ik)
            cr = arm.pose.bones[end].constraints.new("COPY_ROTATION")
            cr.name = "Copy Rotation"
            cr.target, cr.subtarget = arm, target
            cr.influence = weight


def _pole_angle(arm, tip, target, ik):
    """Blender's pole angle depends on the bone rolls: pick the one that bends the joint towards the pole.
    The rest limbs are almost straight, so the test bends them (target halfway to the chain root)."""
    keep = ik.influence
    ik.influence = 1
    pb, rest = arm.pose.bones[target], arm.data.bones[target]
    root = arm.data.bones[tip].parent.head_local
    pb.location = rest.matrix_local.to_3x3().inverted() @ ((root - rest.head_local) * .45)
    pole = arm.data.bones[ik.pole_subtarget].head_local
    bpy.context.view_layer.update()
    goal = pb.head.copy()
    normal = (goal - root).cross(pole - root).normalized()

    def score(deg):
        ik.pole_angle = math.radians(deg)
        bpy.context.view_layer.update()
        joint = arm.pose.bones[tip].head
        # on the plane (root, target, pole), on the pole's side
        axis = (goal - root).normalized()
        side = lambda v: v - axis * axis.dot(v)
        return abs((joint - root).dot(normal)) + (0 if side(joint - root).dot(side(pole - root)) > 0 else 1)

    coarse = min(range(-180, 180, 15), key=score)
    best = min((d / 4 for d in range(coarse * 4 - 60, coarse * 4 + 61)), key=score)
    best = math.radians(best)
    pb.location = (0, 0, 0)
    ik.influence = keep
    return best


# ---------- mannequin ----------

def _skin(arm):
    body = bpy.data.materials.new("body")
    body.diffuse_color = (.72, .66, .58, 1)
    joint = bpy.data.materials.new("joint")
    joint.diffuse_color = (.32, .3, .28, 1)
    for m in (body, joint):
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = m.diffuse_color
        m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .8

    me = bpy.data.meshes.new("mannequin")
    obj = bpy.data.objects.new("mannequin", me)
    bpy.context.scene.collection.objects.link(obj)
    me.materials.append(body)
    me.materials.append(joint)
    names = [b.name for b in arm.data.bones if b.use_deform]
    for n in names:
        obj.vertex_groups.new(name=n)
    bm = bmesh.new()
    dl = bm.verts.layers.deform.verify()

    def part(bone, r0, r1, sx=1, sz=1, ext=(0, 0), segs=6, mat=0):
        b = arm.data.bones[bone]
        length = b.length + ext[0] + ext[1]
        # cone runs along its Z, centred: turn Z onto the bone's Y, move to the middle
        m = b.matrix_local @ Matrix.Translation((0, length / 2 - ext[0], 0)) @ Matrix.Diagonal((sx, 1, sz, 1)) @ Matrix.Rotation(-math.pi / 2, 4, "X")
        geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r0, radius2=r1, depth=length, matrix=m)
        _assign(geom["verts"], bone, mat)

    def ball(bone, r, at="head", mat=1):
        b = arm.data.bones[bone]
        geom = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r, matrix=Matrix.Translation(getattr(b, at + "_local")))
        _assign(geom["verts"], bone, mat)

    def _assign(verts, bone, mat):
        g = names.index(bone)
        for v in verts:
            v[dl][g] = 1.0
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = mat

    part("hips", .13, .14, 1.25, .8, (.04, 0))
    part("spine", .12, .125, 1.2, .75)
    part("spine.1", .125, .15, 1.2, .75)
    part("chest", .15, .11, 1.3, .7)
    part("neck", .045, .045, ext=(.02, 0))
    part("head", .085, .07, 1, 1.1, (.0, .0), segs=8)
    for s in "LR":
        part(f"shoulder.{s}", .05, .05)
        ball(f"upper_arm.{s}", .055)
        part(f"upper_arm.{s}", .05, .04, ext=(-.03, -.02))
        ball(f"forearm.{s}", .043)
        part(f"forearm.{s}", .04, .032, ext=(-.02, -.01))
        ball(f"hand.{s}", .033)
        part(f"hand.{s}", .035, .032, 1.25, .45, (-.01, 0), segs=4)
        for f in ("thumb.1", "thumb.2", "index.1", "index.2"):
            part(f"{f}.{s}", .012, .01, segs=4)
        part(f"fingers.1.{s}", .012, .011, 2.3, 1, segs=4)
        part(f"fingers.2.{s}", .011, .01, 2.3, 1, segs=4)
        ball(f"thigh.{s}", .07)
        part(f"thigh.{s}", .075, .055, ext=(-.04, -.03))
        ball(f"shin.{s}", .055)
        part(f"shin.{s}", .052, .038, ext=(-.03, -.02))
        ball(f"foot.{s}", .04)
        part(f"foot.{s}", .045, .035, 1.25, .7, (.04, 0))
        part(f"toe.{s}", .034, .03, 1.25, .6)

    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    obj.parent = arm
    mod = obj.modifiers.new("rig", "ARMATURE")
    mod.object = arm
    return obj


# ---------- clips ----------

def _mirror(turns):
    """.L turns for the .R side: X stays, Y and Z flip."""
    return [(a, d if a == "x" else -d) for a, d in turns]


class Clip:
    """Keys poses in armature space, relative to rest: `rot(bone, t, [("x", deg), ...])` turns about armature
    axes in that order, `move(bone, t, (x, y, z))` moves in metres. Every bone is keyed, unkeyed means rest."""

    def __init__(self, arm, name, length, arm_ik=0):
        self.arm, self.name, self.length = arm, name, length
        arm.animation_data_create()
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
        for t in (0, length):
            for s in "LR":
                for b, c in ((f"forearm.{s}", "IK"), (f"hand.{s}", "Copy Rotation")):
                    con = arm.pose.bones[b].constraints[c]
                    con.influence = arm_ik
                    con.keyframe_insert("influence", frame=t * FPS)

    def rot(self, bone, t, turns):
        pb = self.arm.pose.bones[bone]
        rest = self.arm.data.bones[bone].matrix_local.to_quaternion()
        q = Quaternion()
        for axis, deg in turns:
            q = Quaternion(Vector({"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[axis]), math.radians(deg)) @ q
        pb.rotation_quaternion = rest.inverted() @ q @ rest
        pb.keyframe_insert("rotation_quaternion", frame=t * FPS, group=bone)

    def move(self, bone, t, v):
        pb = self.arm.pose.bones[bone]
        pb.location = self.arm.data.bones[bone].matrix_local.to_3x3().inverted() @ Vector(v)
        pb.keyframe_insert("location", frame=t * FPS, group=bone)

    def sides(self, bone, t, turns_l, turns_r=None):
        self.rot(f"{bone}.L", t, turns_l)
        self.rot(f"{bone}.R", t, _mirror(turns_l) if turns_r is None else _mirror(turns_r))

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
            for con in pb.constraints:
                con.influence = 0 if pb.name.startswith(("forearm", "hand")) else 1
        return action


ARM_DOWN = 72  # T-pose arms down to the sides


def _phases(n=8):
    return [i / n for i in range(n + 1)]


def _gait(arm, name, length, stride, lift, drop, bob, lean, swing, bend, yaw):
    """In-place walk/run. Phase 0: left foot lands in front. Feet move on foot.ik, hips drop so legs reach."""
    c = Clip(arm, name, length)
    s = stride / 2
    for p in _phases():
        t = p * length
        for side, off in (("L", 0), ("R", .5)):
            f = (p + off) % 1
            if f < .5:
                y, z, pitch = -s + 2 * s * (f / .5), 0, -10 * (1 - f / .25) if f < .25 else 6 * ((f - .25) / .25)
            else:
                g = (f - .5) / .5
                y, z, pitch = s - 2 * s * (3 * g * g - 2 * g * g * g), lift * math.sin(math.pi * g), 6 * (1 - g) - 10 * g
            c.move(f"foot.ik.{side}", t, (0, y, z))
            c.rot(f"foot.ik.{side}", t, [("x", pitch)])
        w = math.cos(2 * math.pi * p)        # 1 left foot front, -1 right foot front
        down = drop - bob * (1 - math.cos(4 * math.pi * p)) / 2  # lowest on contact, higher on passing
        c.move("hips", t, (0, 0, -down))
        c.rot("hips", t, [("x", lean * .3), ("z", -yaw * w)])
        c.rot("spine", t, [("x", lean * .4)])
        c.rot("chest", t, [("x", lean * .3), ("z", yaw * w * 1.6)])
        c.rot("neck", t, [("x", -lean * .6)])
        # arms swing against the legs
        c.rot("upper_arm.L", t, [("y", ARM_DOWN), ("x", swing * w)])
        c.rot("upper_arm.R", t, _mirror([("y", ARM_DOWN), ("x", -swing * w)]))
        c.sides("forearm", t, [("z", -bend - 4 * max(0, -w))], [("z", -bend - 4 * max(0, w))])
    c.done()


def _clips(arm):
    # idle: breathing, weight shift
    c = Clip(arm, "idle", 3)
    for p in _phases(4):
        t, b = p * 3, math.sin(2 * math.pi * p)
        c.move("hips", t, (.008 * b, 0, -.01 + .004 * b))
        c.rot("hips", t, [("y", -1.2 * b)])
        c.rot("spine", t, [("y", 1.2 * b)])
        c.rot("chest", t, [("x", 1.5 * math.sin(4 * math.pi * p))])
        c.rot("head", t, [("z", 3 * b)])
        c.sides("upper_arm", t, [("y", ARM_DOWN - 1 + .8 * b)])
        c.sides("forearm", t, [("z", -10)])
        c.sides("fingers.1", t, [("y", 15)])
        for s in "LR":
            c.move(f"foot.ik.{s}", t, (0, 0, 0))
    c.done()

    _gait(arm, "walk", 1.1, stride=.62, lift=.1, drop=.06, bob=.025, lean=4, swing=22, bend=12, yaw=5)
    _gait(arm, "run", .7, stride=1.0, lift=.26, drop=.17, bob=.04, lean=14, swing=40, bend=80, yaw=8)

    # fps-idle: both hands on IK, holding something at chest height, slow sway
    c = Clip(arm, "fps-idle", 3, arm_ik=1)
    for p in _phases(4):
        t, b = p * 3, math.sin(2 * math.pi * p)
        sway = (.004 * b, 0, .006 * math.sin(4 * math.pi * p))
        rest = {s: arm.data.bones[f"hand.ik.{s}"].head_local for s in "LR"}
        for s, target, turn in (("R", (-.16, -.32, 1.3), 90), ("L", (.04, -.46, 1.34), -90)):
            c.move(f"hand.ik.{s}", t, Vector(target) - rest[s] + Vector(sway))
            c.rot(f"hand.ik.{s}", t, [("z", turn), ("y", 20 if s == "R" else -20)])
            pole = arm.data.bones[f"elbow.pole.{s}"].head_local
            c.move(f"elbow.pole.{s}", t, Vector((.45 * (1 if s == "L" else -1), .1, .8)) - pole)
            c.move(f"foot.ik.{s}", t, (0, 0, 0))
        c.move("hips", t, (0, 0, -.01))
        c.rot("chest", t, [("x", 1 * math.sin(4 * math.pi * p))])
        c.sides("fingers.1", t, [("y", 40)])
    c.done()
