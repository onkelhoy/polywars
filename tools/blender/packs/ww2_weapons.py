"""Splits the "WW2 low poly weapons pack" source .blend into editable per-part files and rigged guns.

  blender -b -P tools/blender/packs/ww2_weapons.py -- <pack.blend> [--force]

Writes assets/models/{guns,ammo,knives,grenades}/<slug>/... . An existing model.blend is kept
(it holds hand-edited animations) unless --force. Part numbers are loose pieces of the source
gun mesh, largest first (see pw.loose_parts). Positions are cm in the source frame relative to
the gun's bounding box centre: x = muzzle, y = left, z = up.
"""
import bpy, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from mathutils import Matrix, Vector
import pw, gun_rig

AMMO = {
    "30-06-springfield": ("30-60 Springfield ", "30-60 Springfield Bullet", "30-60 Springfield Case"),
    "45-acp": ("45 ACP", "45 ACP Bullet", "45 ACP Case"),
    "9x19-parabellum": ("9x19mm Parabellum ", "9x19mm Parabellum Bullet", "9x19mm Parabellum Case"),
    "762x25-tokarev": ("762x25mm Tokarev ", "762x25mm Tokarev Bullet", "762x25mm Tokarev Case"),
    "792x33-kurz": ("792x33mm Kurz ", "792x33mm Kurz Bullet", "792x33mm Kurz Case"),
}

GUNS = [
    dict(slug="m1-garand", src="M1 Garand", mag_src="M1 Garand Clip", ammo="30-06-springfield",
         action=dict(parts=[9, 1], travel=8, locks=True), trigger=[24], barrel=[18],
         mag_at=(-11, 0.8, 4.0), reload="en-bloc", fire=.25, kick=(.03, 7)),
    dict(slug="m1911", src="M1911", mag_src="M1911 Maganize", ammo="45-acp",
         action=dict(parts=[1, 9, 12, 21], travel=2.5, locks=True), trigger=[19], hammer=[2], barrel=[8],
         mag_parts=[4], reload="mag", fire=.15, kick=(.015, 9)),
    dict(slug="mauser-c96", src="Mauser C96", mag_src="Mauser Clip", ammo="9x19-parabellum",
         action=dict(parts=[5, 4, 10, 13, 14], travel=2.5, locks=True), trigger=[8], hammer=[2], barrel=[1],
         mag_at=(2.8, 0, 5.8), mag_rot=90, clip_seat=(-5.8, 0, 3.6), reload="stripper", fire=.15, kick=(.015, 9)),
    dict(slug="ppsh-41", src="PPSH 41", mag_src="PPSH 41 Magazine", ammo="762x25-tokarev",
         action=dict(parts=[17], travel=8, locks=False), trigger=[13], barrel=[1],
         mag_parts=[0], mag_out=(0, .12, -.3), mag_out_rot=(-35, 0, 0), reload="mag", fire=.06, kick=(.01, 2.5)),
    dict(slug="stg-44", src="STG 44", mag_src="STG 44 Maganize", ammo="792x33-kurz",
         action=dict(parts=[20], travel=8, locks=False), trigger=[21], barrel=[6],
         mag_parts=[4], reload="mag", fire=.11, kick=(.015, 3)),
    dict(slug="thompson-m1", src="Thompson M1", mag_src="Thompson M1 Maganize", ammo="45-acp",
         action=dict(parts=[13, 9], travel=7, locks=False), trigger=[12], barrel=[8],
         mag_parts=[10, 19], reload="mag", fire=.086, kick=(.012, 3)),
    dict(slug="tt-pistol", src="TT Pistol", mag_src="TT Pistol Maganize", ammo="762x25-tokarev",
         action=dict(parts=[1, 7, 12, 13], travel=2.5, locks=True), trigger=[8], hammer=[2], barrel=[4],
         mag_parts=[3], reload="mag", fire=.15, kick=(.015, 9)),
]

SINGLE = [("knives", "ka-bar", "KA BAR"), ("knives", "nr-40", "NR 40"), ("knives", "german-knife", "German Knife"),
          ("grenades", "mk2", "MK2 Grenade"), ("grenades", "f1", "F1 Grenade"), ("grenades", "stick-grenade", "German Stick Grenade")]

R = Matrix.Rotation(math.radians(90), 4, "Z")  # source muzzle +X -> +Y


def cm(v):
    """source-frame cm (relative to gun centre) -> model metres"""
    return R.to_3x3() @ (Vector(v) / 100)


def scale_only(obj):
    return Matrix.Diagonal(obj.matrix_world.to_scale()).to_4x4()


def single(src, folder, slug, upright):
    pw.empty_file()
    o = pw.append_object(src, slug_src(slug))
    m = scale_only(o) if upright else R @ scale_only(o)
    pw.bake(o, m)
    lo, hi = pw.bbox(v.co for v in o.data.vertices)
    pw.bake(o, Matrix.Translation(-(lo + hi) / 2))
    pw.save_part(o, slug, os.path.join(folder, "model.blend"))


_names = {}
def slug_src(slug):
    return _names[slug]


def ammo(src, cal, names):
    for part, name in zip(("round", "bullet", "case"), names):
        pw.empty_file()
        o = pw.append_object(src, name)
        pw.bake(o, Matrix.Rotation(math.radians(-90), 4, "X") @ scale_only(o))  # tip +Z -> +Y
        lo, hi = pw.bbox(v.co for v in o.data.vertices)
        pw.bake(o, Matrix.Translation(-Vector(((lo.x + hi.x) / 2, lo.y, (lo.z + hi.z) / 2))))  # base at origin
        pw.save_part(o, f"{cal}-{part}", os.path.join(pw.ASSETS, "models", "ammo", cal, f"{part}.blend"))


def gun(src, g, force):
    folder = os.path.join(pw.ASSETS, "models", "guns", g["slug"])
    pw.empty_file()
    o = pw.append_object(src, g["src"])
    lo, hi = pw.world_bbox(o)
    centre = (lo + hi) / 2
    parts = pw.loose_parts(o.data)
    M = o.matrix_world.copy()

    def group_box(ids):
        idx = [i for p in ids for i in parts[p]]
        a, b = pw.bbox(R @ (M @ o.data.vertices[i].co - centre) for i in idx)
        return a, b, idx

    spec = dict(slug=g["slug"], ammo=g["ammo"], reload=g["reload"], fire=g["fire"], kick=g["kick"])
    for k in ("mag_out", "mag_out_rot"):
        if k in g: spec[k] = g[k]

    a, b, act_idx = group_box(g["action"]["parts"])
    spec["action"] = dict(pivot=(a + b) / 2, travel=g["action"]["travel"] / 100, locks=g["action"]["locks"])
    spec["eject"] = Vector(((a.x + b.x) / 2 + .012, (a.y + b.y) / 2, b.z))
    a, b, trig_idx = group_box(g["trigger"])
    spec["trigger"] = Vector(((a.x + b.x) / 2, (a.y + b.y) / 2, b.z))
    spec["grip"] = spec["trigger"] + Vector((0, -.03, -.03))
    groups = {"action": act_idx, "trigger": trig_idx}
    if "hammer" in g:
        a, b, groups["hammer"] = group_box(g["hammer"])
        spec["hammer"] = Vector(((a.x + b.x) / 2, (a.y + b.y) / 2, a.z))
    a, b, _ = group_box(g["barrel"])
    spec["muzzle"] = Vector(((a.x + b.x) / 2, b.y, (a.z + b.z) / 2))

    mag_delete = []
    if "mag_parts" in g:
        a, b, mag_delete = group_box(g["mag_parts"])
        spec["mag"] = (a + b) / 2
    else:
        spec["mag"] = cm(g["mag_at"])
    if "mag_rot" in g:
        spec["mag_rot"] = Matrix.Rotation(math.radians(g["mag_rot"]), 4, "X")
    if "clip_seat" in g:
        spec["clip_seat"] = tuple(cm(g["clip_seat"]))

    # gun.blend: gun frame, moving parts as vertex groups, built-in mag removed
    pw.bake(o, R @ Matrix.Translation(-centre) @ M)
    for name, idx in groups.items():
        vg = o.vertex_groups.new(name=name)
        vg.add(idx, 1.0, "REPLACE")
    if mag_delete:
        pw.delete_vertices(o, mag_delete)
    pw.save_part(o, g["slug"] + "-gun", os.path.join(folder, "gun.blend"))

    # mag.blend: centred on itself, gun orientation
    pw.empty_file()
    m = pw.append_object(src, g["mag_src"])
    pw.bake(m, R @ scale_only(m))
    lo, hi = pw.bbox(v.co for v in m.data.vertices)
    pw.bake(m, Matrix.Translation(-(lo + hi) / 2))
    spec["round"] = spec["mag"] + Vector((0, -.012, (hi.z - lo.z) / 2 - .008))
    pw.save_part(m, g["slug"] + "-mag", os.path.join(folder, "mag.blend"))

    if force or not os.path.exists(os.path.join(folder, "model.blend")):
        gun_rig.build(spec, folder)
    else:
        print("kept", g["slug"], "model.blend (use --force to rebuild)")


def main():
    a = pw.args()
    src, force = a[0], "--force" in a
    for cal, names in AMMO.items():
        ammo(src, cal, names)
    for g in GUNS:
        gun(src, g, force)
    for kind, slug, name in SINGLE:
        _names[slug] = name
        single(src, os.path.join(pw.ASSETS, "models", kind, slug), slug, kind == "grenades")


main()
