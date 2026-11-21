"""WW2 fighter (owner's model.blend) -> flyable plane asset.

  blender -b --disable-autoexec assets/models/vehicles/ww2-fighter/model.blend -P tools/blender/packs/fighter.py

The .blend is the owner's source and is never saved. In memory: nose turned from -x to +y, scaled to an ~11 m span
(P-51 size), wheel bottoms on z = 0, wheels / propeller get their pivot. The texture is baked to vertex colours.
Writes model.glb + vehicle.json (glTF space: y up, nose -z, right +x, metres). Seat / eye / guns are eyeballed.
"""
import bpy, json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mathutils import Matrix, Vector
import pw

OUT = os.path.join(pw.ASSETS, "models/vehicles/ww2-fighter")
SPAN = 11.3


def box(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])


def pivot(o, at):
    o.data.transform(Matrix.Translation(-at))
    o.location = at


def main():
    objs = [o for o in bpy.data.objects if o.type == "MESH"]
    by = {o.name: o for o in objs}
    body = by["FighterPlaneBody"]
    lo, hi = box(body)
    scale = SPAN / (hi.y - lo.y)
    floor = min(box(o)[0].z for o in objs)
    fix = Matrix.Scale(scale, 4) @ Matrix.Rotation(-math.pi / 2, 4, "Z") @ Matrix.Translation((0, 0, -floor))
    for o in objs:
        w = o.matrix_world.copy()
        o.parent = None
        o.data.transform(fix @ w)
        o.matrix_world = Matrix.Identity(4)
        for p in o.data.polygons:
            p.use_smooth = False
    names = {"FighterPlaneBody": "Body", "FighterPlaneBackWheel": "TailWheel", "FighterPlaneFrontWheels": "Wheels", "FighterPlanePropeller": "Propeller"}
    for o in objs:
        o.name = o.data.name = names[o.name]
    body, tail, wheels, prop = by["FighterPlaneBody"], by["FighterPlaneBackWheel"], by["FighterPlaneFrontWheels"], by["FighterPlanePropeller"]

    # propeller hub: the mean of its vertices (blades even round the axis)
    vs = [v.co for v in prop.data.vertices]
    hub = sum(vs, Vector()) / len(vs)
    plo, phi = box(prop)
    hub.y = phi.y - .1
    pivot(prop, hub)

    wlo, whi = box(wheels)
    wc = (wlo + whi) / 2
    pivot(wheels, wc)
    tlo, thi = box(tail)
    tc = (tlo + thi) / 2
    pivot(tail, tc)

    blo, bhi = box(body)
    # the wing: body vertices out past a third of the half span; leading edge = their front, chord = their depth
    wing = [v.co for v in body.data.vertices if abs(v.co.x) > bhi.x * .35]
    lead = max(v.y for v in wing)
    trail = min(v.y for v in wing)
    wz = sum(v.z for v in wing) / len(wing)

    gl = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
    wheel_specs = []
    for side in (-1, 1):
        x = side * (whi.x - wlo.x) / 2 * .9
        wheel_specs.append({"node": "Wheels", "position": [round(x, 4), round(wc.z, 4), round(-wc.y, 4)], "radius": round((whi.z - wlo.z) / 2, 4),
                            "width": .25, "side": side, "pivot": gl(wc)})
    wheel_specs.append({"node": "TailWheel", "position": gl(tc), "radius": round((thi.z - tlo.z) / 2, 4), "width": .12, "steer": True, "pivot": gl(tc)})

    # cockpit: just behind the wing's leading edge, on the top of the fuselage
    cy = lead - (lead - trail) * .9
    top = max(v.co.z for v in body.data.vertices if abs(v.co.x) < .4 and abs(v.co.y - cy) < .6)
    seat = Vector((0, cy, top - .55))
    guns = [gl(Vector((s * bhi.x * f, lead + .05, wz))) for s in (-1, 1) for f in (.3, .34, .38)]
    data = {
        "model": "model.glb",
        "frame": "glTF: y up, nose -z, right +x, metres",
        "kind": "plane",
        "size": [round(bhi.x - blo.x, 3), round(bhi.z, 3), round(bhi.y - blo.y, 3)],
        "mass": 4000,
        "topSpeed": 195,
        "wheels": wheel_specs,
        # just behind the main wheels (a tail dragger sits back on its tail wheel), at the wing root
        "centre": [0, round(wz + .1, 4), round(-wc.y + .6, 4)],
        "body": {"min": [round(-.6, 4), round(wc.z + .2, 4), round(-bhi.y, 4)], "max": [round(.6, 4), round(bhi.z, 4), round(-blo.y, 4)]},
        "wing": {"span": round(bhi.x - blo.x, 3), "area": round((bhi.x - blo.x) * (lead - trail) * .75, 2), "height": round(wz, 3),
                 "tips": [gl(Vector((-bhi.x + .1, (lead + trail) / 2, wz))), gl(Vector((bhi.x - .1, (lead + trail) / 2, wz)))]},
        "propeller": {"node": "Propeller", "position": gl(hub), "axis": [0, 0, -1]},
        "guns": guns,
        "seat": gl(seat),
        "eye": gl(seat + Vector((0, 0, .6))),
        "exit": gl(Vector((blo.x * .3 - 1, cy, 0))),
        "exhaust": gl(Vector((.5, hub.y - 1, hub.z + .2))),
    }
    with open(os.path.join(OUT, "vehicle.json"), "w") as f:
        json.dump(data, f, indent=1)
    print("wrote vehicle.json", data["wing"], "span scale", scale)

    root = bpy.data.objects.new("Fighter", None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        o.parent = root

    import export
    export.export(os.path.join(OUT, "model.glb"))


main()
