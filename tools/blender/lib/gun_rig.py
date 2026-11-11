"""Builds a gun `model.blend`: links gun/mag/round parts, adds an armature, generates actions.

Bones (all point +Y, so pose axes = model axes; muzzle is +Y, up is +Z, right is +X):
  root > body > action (slide/bolt/op-rod), trigger, hammer?, mag > round, muzzle, eject
Moving parts of the gun mesh are vertex groups named like their bone, in gun.blend.
Rotations are degrees about the bone's X (pitch), Y (roll), Z (yaw).
"""
import bpy, math, os
from mathutils import Matrix, Vector, Euler
import pw

FPS = 120
BONE = 0.02


def build(spec, folder):
    """spec: see packs/ww2_weapons.py GUNS. folder: assets/models/guns/<slug>."""
    scene = pw.empty_file()
    scene.render.fps = FPS
    path = os.path.join(folder, "model.blend")
    bpy.ops.wm.save_as_mainfile(filepath=path)  # so links can be relative

    arm = _armature(spec)
    gun = pw.link_collection(os.path.join(folder, "gun.blend"), spec["slug"] + "-gun", "gun")
    pw.parent_to_bone(gun, arm, "body", Matrix.Identity(4))
    mag = pw.link_collection(os.path.join(folder, "mag.blend"), spec["slug"] + "-mag", "mag")
    pw.parent_to_bone(mag, arm, "mag", Matrix.Translation(spec["mag"]) @ spec.get("mag_rot", Matrix.Identity(4)))
    ammo = os.path.join(pw.ASSETS, "models", "ammo", spec["ammo"], "round.blend")
    rnd = pw.link_collection(ammo, spec["ammo"] + "-round", "round")
    pw.parent_to_bone(rnd, arm, "round", Matrix.Translation(spec["round"]))

    _actions(arm, spec)
    scene.frame_start, scene.frame_end = 0, int(FPS * 2)
    bpy.ops.wm.save_as_mainfile(filepath=path, relative_remap=True)
    print("saved", os.path.relpath(path, pw.ROOT))


def _armature(spec):
    data = bpy.data.armatures.new("rig")
    arm = bpy.data.objects.new("rig", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.show_in_front = True
    bpy.ops.object.mode_set(mode="EDIT")
    heads = {
        "root": (Vector(), None),
        "body": (spec["grip"], "root"),
        "action": (spec["action"]["pivot"], "body"),
        "trigger": (spec["trigger"], "body"),
        "mag": (spec["mag"], "body"),
        "round": (spec["round"], "mag"),
        "muzzle": (spec["muzzle"], "body"),
        "eject": (spec["eject"], "body"),
    }
    if "hammer" in spec:
        heads["hammer"] = (spec["hammer"], "body")
    for name, (head, parent) in heads.items():
        b = data.edit_bones.new(name)
        b.head = head
        b.tail = Vector(head) + Vector((0, BONE, 0))
        b.roll = 0
        b.use_deform = name not in ("root", "muzzle", "eject")
        if parent:
            b.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


# ---------- animation ----------

class Clip:
    """Keys bone poses at times in seconds. Unkeyed bones stay at rest."""

    def __init__(self, arm, name):
        self.arm, self.name = arm, name
        arm.animation_data_create()
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)

    def key(self, bone, t, loc=(0, 0, 0), rot=(0, 0, 0)):
        pb = self.arm.pose.bones[bone]
        pb.location = loc
        pb.rotation_quaternion = Euler([math.radians(a) for a in rot], "XYZ").to_quaternion()
        f = t * FPS
        pb.keyframe_insert("location", frame=f, group=bone)
        pb.keyframe_insert("rotation_quaternion", frame=f, group=bone)

    def path(self, bone, keys):
        """keys: [(t, loc, rot)]"""
        for k in keys:
            self.key(bone, k[0], k[1] if len(k) > 1 else (0, 0, 0), k[2] if len(k) > 2 else (0, 0, 0))

    def done(self):
        ad = self.arm.animation_data
        action = ad.action
        action.name = self.name
        action.use_fake_user = True
        track = ad.nla_tracks.new()
        track.name = self.name
        track.strips.new(self.name, int(action.frame_range[0]), action)
        track.mute = True
        ad.action = None
        return action


def _actions(arm, s):
    a = s["action"]
    back = (0, -a["travel"], 0)
    fire = s["fire"]  # seconds per shot
    kick = s.get("kick", (0.02, 5))  # metres back, degrees up

    # idle: slow breathing sway, loops
    c = Clip(arm, "idle")
    c.path("body", [(0,), (1, (0, 0, 0.002), (0.6, 0, 0.3)), (2,)])
    c.done()

    # fire: one shot, recoil + action cycle + trigger (+ hammer)
    c = Clip(arm, "fire")
    t = fire
    c.path("body", [(0,), (t * .15, (0, -kick[0], kick[0] * .2), (kick[1], 0, 0)), (t,)])
    c.path("action", [(0,), (t * .35, back), (t * .5, back), (t * .9,)])
    c.path("trigger", [(0,), (t * .1, (0, 0, 0), (-18, 0, 0)), (t * .6, (0, 0, 0), (-18, 0, 0)), (t,)])
    if "hammer" in s:
        c.path("hammer", [(0,), (t * .1, (0, 0, 0), (-50, 0, 0)), (t * .4,)])
    c.done()

    style = s["reload"]
    for empty in (False, True):
        c = Clip(arm, "reload-empty" if empty else "reload")
        if style == "mag":
            _reload_mag(c, s, back, empty)
        elif style == "en-bloc":
            _reload_enbloc(c, s, back, empty)
        elif style == "stripper":
            _reload_stripper(c, s, back, empty)
        c.done()


def _tilt(c, end):
    """Rolls the gun to show the mag well, holds, comes back."""
    c.path("body", [(0,), (.25, (0.02, 0, 0.03), (12, 25, -8)), (end - .35, (0.02, 0, 0.03), (12, 25, -8)),
                    (end - .25, (0.015, 0, 0.025), (8, 20, -6)), (end,)])


def _reload_mag(c, s, back, empty):
    out = s.get("mag_out", (0, 0.05, -0.35))
    rot = s.get("mag_out_rot", (-20, 0, 0))
    end = 2.0 if empty else 1.7
    _tilt(c, end)
    c.path("mag", [(0,), (.3,), (.45, (0, out[1] * .2, out[2] * .15)), (.7, out, rot),
                   (1.0, out, rot), (1.2, (0, out[1] * .2, out[2] * .25)), (1.35,), (1.4, (0, 0, 0.004)), (1.45,)])
    if empty:
        # action is locked back from the start, released after the new mag is in
        if s["action"].get("locks", True):
            c.path("action", [(0, back), (1.5, back), (1.58,)])
        else:  # open bolt / charging handle: pull and let go
            c.path("action", [(0,), (1.45,), (1.6, back), (1.65, back), (1.72,)])
    c.path("trigger", [(0,), (end,)])


def _reload_enbloc(c, s, back, empty):
    """M1 Garand: empty clip pings out the top, new clip pushed in from above, op rod slams forward."""
    end = 2.0
    _tilt(c, end)
    up = (0, -0.02, 0.4)
    ping = [(0,), (.05, (0, 0, .02)), (.35, up, (200, 0, 30)), (.36, (0, 0, .3)), (.8, (0, 0, .15)),
            (1.1, (0, 0, .03)), (1.25,), (1.3, (0, 0, -.004)), (1.35,)]
    if empty:
        c.path("mag", ping)
        c.path("action", [(0, back), (1.35, back), (1.42,)])
    else:  # pull op rod back to eject a partial clip first
        c.path("action", [(0,), (.15, back), (1.35, back), (1.42,)])
        c.path("mag", ping)


def _reload_stripper(c, s, back, empty):
    """Mauser C96: bolt back, stripper clip from above, rounds pushed down, clip pulled away."""
    end = 2.2
    _tilt(c, end)
    seat = s["clip_seat"]  # offset from rest to where the clip sits on top of the magazine
    above = (seat[0], seat[1], seat[2] + .15)
    act = [(0, back), (1.6, back), (1.68,)] if empty else [(0,), (.15, back), (1.6, back), (1.68,)]
    c.path("action", act)
    c.path("mag", [(0,), (.25,), (.26, above, (-90, 0, 0)), (.6, seat, (-90, 0, 0)), (.75, seat, (-90, 0, 0)),
                   (1.0, (seat[0], seat[1], seat[2] - .02), (-90, 0, 0)), (1.2, above, (-90, 0, 0)),
                   (1.21,), (end,)])
