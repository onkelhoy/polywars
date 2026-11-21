"""WW2 motorbike (owner's model.blend) -> drivable bike asset.

  blender -b --disable-autoexec assets/models/vehicles/ww2-motorcycle/model.blend -P tools/blender/packs/motorbike.py

The .blend is the owner's source and is never saved. In memory: parts unparented (world kept), nose turned from +x
to +y, wheels and fork get their pivot (wheel centre; fork on the front wheel centre), the material keeps its image
(custom property `texture`: exported as a real texture, the star shows). Writes model.glb + vehicle.json.
vehicle.json is in glTF space (y up, nose -z, right +x), metres.
"""
import bpy, json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mathutils import Matrix, Vector
import pw

OUT = os.path.join(pw.ASSETS, "models/vehicles/ww2-motorcycle")
NAMES = {"Main": "Body", "Front": "Fork", "FrontWheel": "Wheel.F", "RearWheel": "Wheel.R"}
RAKE = math.radians(28)  # steering head tilt back from vertical (measured off the side view)


def box(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])


def main():
    objs = {NAMES[o.name]: o for o in bpy.data.objects if o.name in NAMES}
    turn = Matrix.Rotation(math.pi / 2, 4, "Z")  # nose +x -> +y
    for o in objs.values():
        w = o.matrix_world.copy()
        o.parent = None
        o.data.transform(turn @ w)
        o.matrix_world = Matrix.Identity(4)
    for o in [o for o in bpy.data.objects if o.name not in [x.name for x in objs.values()]]:
        bpy.data.objects.remove(o)
    for name, o in objs.items():
        o.name = o.data.name = name

    centres = {}
    for n in ("Wheel.F", "Wheel.R"):
        lo, hi = box(objs[n])
        c = (lo + hi) / 2
        centres[n] = (c, (hi.z - lo.z) / 2, hi.x - lo.x)
        objs[n].data.transform(Matrix.Translation(-c))
        objs[n].location = c
    fc = centres["Wheel.F"][0]
    fork = objs["Fork"]
    # grips: the bar ends (outermost 4 cm each side), before the pivot moves the mesh
    fv = [v.co.copy() for v in fork.data.vertices]
    w = max(abs(v.x) for v in fv)
    grips = []
    for side in (-1, 1):
        s = [v for v in fv if v.x * side > w - .04]
        grips.append(sum(s, Vector()) / len(s))
    fork.data.transform(Matrix.Translation(-fc))
    fork.location = fc
    axis = Vector((0, -math.sin(RAKE), math.cos(RAKE)))  # up and back


    for m in bpy.data.materials:
        m["texture"] = 1
        for n in m.node_tree.nodes if m.node_tree else []:
            if n.type == "TEX_IMAGE":
                n.interpolation = "Closest"
    for o in objs.values():
        for p in o.data.polygons:
            p.use_smooth = False

    root = bpy.data.objects.new("Motorbike", None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs.values():
        o.parent = root

    gl = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
    lo, hi = box(objs["Body"])
    rc = centres["Wheel.R"][0]
    seat = Vector((0, rc.y + (fc.y - rc.y) * .36, hi.z - .12))
    data = {
        "model": "model.glb",
        "frame": "glTF: y up, nose -z, right +x, metres",
        "kind": "bike",
        "size": [abs(x) for x in gl(hi - lo)],
        "mass": 230,
        "topSpeed": 26,
        "wheels": [{"node": n, "position": gl(c), "radius": round(r, 4), "width": round(wd, 4),
                    "steer": n == "Wheel.F", "drive": n == "Wheel.R"} for n, (c, r, wd) in sorted(centres.items())],
        "body": {"min": [-.22, round(rc.z - .1, 4), round(-fc.y - .15, 4)], "max": [.22, round(hi.z, 4), round(-rc.y + .25, 4)]},
        "fork": {"node": "Fork", "position": gl(fc), "axis": gl(axis)},
        "grips": [gl(g) for g in grips],
        "seat": gl(seat),
        "eye": gl(seat + Vector((0, .05, .72))),
        "exit": gl(seat + Vector((-.9, 0, -seat.z))),
        "exhaust": gl(Vector((.18, rc.y - .25, rc.z - .05))),
    }
    with open(os.path.join(OUT, "vehicle.json"), "w") as f:
        json.dump(data, f, indent=1)
    print("wrote vehicle.json")

    import export
    export.export(os.path.join(OUT, "model.glb"))


main()
