"""WW2 tank (owner's model.blend) -> drivable tank asset.

  blender -b --disable-autoexec assets/models/vehicles/ww2-tank/model.blend -P tools/blender/packs/tank.py

The .blend is the owner's source and is never saved. In memory: nose turned from +x to +y, scaled x3.1 (~6.2 m hull),
track bottom on z = 0, wheels / turret / barrel get their pivot. The texture is baked to vertex colours (the colours
we have, no image). Writes model.glb + vehicle.json (glTF space: y up, nose -z, right +x, metres).
"""
import bpy, json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mathutils import Matrix, Vector
import pw

OUT = os.path.join(pw.ASSETS, "models/vehicles/ww2-tank")
SCALE = 3.1


def box(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])


def pivot(o, at):
    o.data.transform(Matrix.Translation(-at))
    o.location = at


def main():
    objs = list(bpy.data.objects)
    treads = next(o for o in objs if o.name == "TankTreads")
    floor = box(treads)[0].z
    fix = Matrix.Scale(SCALE, 4) @ Matrix.Translation((0, 0, -floor)) @ Matrix.Rotation(math.pi / 2, 4, "Z")
    for o in objs:
        w = o.matrix_world.copy()
        o.parent = None
        o.data.transform(fix @ w)
        o.matrix_world = Matrix.Identity(4)
        for p in o.data.polygons:
            p.use_smooth = False

    names = {"TankBody": "Hull", "TankTreads": "Tracks", "TankTurretHead": "Turret", "TankBarrel": "Barrel"}
    wheels = []
    for o in objs:
        if o.name in names:
            o.name = o.data.name = names[o.name]
        elif o.name.startswith("TankWheelHolder"):
            o.name = o.data.name = "Holder." + o.name.split(".")[-1]
        elif o.name.startswith("TankWheels"):
            wheels.append(o)
    # wheels front to back (nose +y)
    wheels.sort(key=lambda o: -(box(o)[0].y + box(o)[1].y))
    by = {o.name: o for o in objs}
    turret, barrel, hull = by["Turret"], by["Barrel"], by["Hull"]

    spec_wheels = []
    road = [o for o in wheels if box(o)[0].z < .3]
    for i, o in enumerate(wheels):
        lo, hi = box(o)
        c = (lo + hi) / 2
        o.name = o.data.name = f"Wheel.{i}"
        pivot(o, c)
        r = (hi.z - lo.z) / 2
        # road wheels stand on the track (radius down to the track bottom); sprocket / idler only touch on bumps
        spec_wheels.append({"node": o.name, "position": None, "c": c, "radius": round(c.z if o in road else r, 4),
                            "spin": round(r, 4), "width": round(hi.x - lo.x, 4), "drive": True})

    tlo, thi = box(turret)
    ring = Vector(((tlo.x + thi.x) / 2, (tlo.y + thi.y) / 2, tlo.z))
    pivot(turret, ring)
    blo, bhi = box(barrel)
    # trunnion: where the barrel leaves the turret front, on its axis
    trunnion = Vector((0, thi.y - .05, (blo.z + bhi.z) / 2))
    pivot(barrel, trunnion)
    muzzle = Vector((0, bhi.y, trunnion.z))

    gl = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
    # each wheel mesh is an axle (both sides): a contact per side, the same node drawn for both
    sides = []
    for w in spec_wheels:
        c = w.pop("c")
        g = gl(c)
        for side in (-1, 1):
            x = side * (w["width"] / 2 - .2)
            sides.append({**w, "position": [round(x, 4), g[1], g[2]], "width": .4, "side": side, "pivot": g})
    spec_wheels = sides
    hlo, hhi = box(hull)
    data = {
        "model": "model.glb",
        "frame": "glTF: y up, nose -z, right +x, metres",
        "kind": "tank",
        "size": [abs(x) for x in gl(hhi - Vector((hlo.x, hlo.y, 0)))],
        "mass": 30000,
        "topSpeed": 11,
        "wheels": spec_wheels,
        "body": {"min": [round(hlo.x, 4), round(hlo.z + .15, 4), round(-hhi.y, 4)], "max": [round(hhi.x, 4), round(thi.z, 4), round(-hlo.y, 4)]},
        "turret": {"node": "Turret", "position": gl(ring)},
        "gun": {"node": "Barrel", "position": gl(trunnion), "muzzle": gl(muzzle), "elevation": [-8, 20]},
        "seat": gl(ring + Vector((0, 0, -.6))),
        "eye": gl(ring + Vector((.3, -.2, .55))),
        "exit": gl(Vector((hlo.x - .8, (hlo.y + hhi.y) / 2, 0))),
        "exhaust": gl(Vector((.6, hlo.y + .1, hhi.z - .1))),
    }
    with open(os.path.join(OUT, "vehicle.json"), "w") as f:
        json.dump(data, f, indent=1)
    print("wrote vehicle.json")

    root = bpy.data.objects.new("Tank", None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        o.parent = root

    import export
    export.export(os.path.join(OUT, "model.glb"))


main()
