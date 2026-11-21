"""Challenger A30 cruiser tank (owner's tanks/Challenger A30 Cruiser.blend) -> drivable tank asset.

  blender -b --disable-autoexec "assets/models/vehicles/tanks/Challenger A30 Cruiser.blend" -P tools/blender/packs/challenger.py

The .blend is the owner's source and is never saved. Already real size (~7.8 m hull) with the nose on -y: turned to +y,
the `Human` scale figure dropped. No materials in the file: olive drab hull / turret, dark tracks / wheels, gun metal
barrel. Writes tanks/challenger-a30/model.glb + vehicle.json (glTF space: y up, nose -z, right +x, metres).
"""
import bpy, json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mathutils import Matrix, Vector
import pw

OUT = os.path.join(pw.ASSETS, "models/vehicles/tanks/challenger-a30")
COLOURS = {"olive": (.23, .25, .13, 1), "track": (.07, .07, .065, 1), "wheel": (.16, .17, .12, 1), "metal": (.12, .12, .11, 1)}


def box(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])


def pivot(o, at):
    o.data.transform(Matrix.Translation(-at))
    o.location = at


def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = COLOURS[name]
    bsdf.inputs["Roughness"].default_value = 1
    return m


def paint(o, name):
    o.data.materials.clear()
    o.data.materials.append(material(name))


def main():
    os.makedirs(OUT, exist_ok=True)
    human = bpy.data.objects.get("Human")
    if human:
        bpy.data.objects.remove(human)
    objs = [o for o in bpy.data.objects if o.type == "MESH"]
    floor = min(box(o)[0].z for o in objs)
    fix = Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation((0, 0, -floor))
    for o in objs:
        w = o.matrix_world.copy()
        o.parent = None
        o.data.transform(fix @ w)
        o.matrix_world = Matrix.Identity(4)
        for p in o.data.polygons:
            p.use_smooth = False
    by = {o.name: o for o in objs}
    hull, turret, barrel = by["Cube.001"], by["Cube.003"], by["Cylinder"]
    hull.name = hull.data.name = "Hull"
    turret.name = turret.data.name = "Turret"
    barrel.name = barrel.data.name = "Barrel"
    paint(hull, "olive"); paint(turret, "olive"); paint(barrel, "metal")
    for i, n in enumerate(("Cube", "Cube.004")):
        by[n].name = by[n].data.name = f"Track.{i}"
        paint(by[n], "track")
    wheels = [o for o in objs if o.name.startswith("Cylinder.")]
    for o in wheels:
        paint(o, "wheel")

    tlo, thi = box(turret)
    blo, bhi = box(barrel)
    # ring: under the turret's middle, where the barrel's line crosses it (the turret box is lopsided by the cupola)
    ring = Vector(((blo.x + bhi.x) / 2, (tlo.y + thi.y) / 2, tlo.z))
    pivot(turret, ring)
    trunnion = Vector(((blo.x + bhi.x) / 2, blo.y + .3, (blo.z + bhi.z) / 2))
    pivot(barrel, trunnion)
    muzzle = Vector((trunnion.x, bhi.y, trunnion.z))

    gl = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
    spec_wheels = []
    # each wheel is its own mesh (one side); front to back
    wheels.sort(key=lambda o: (-(box(o)[0].y + box(o)[1].y), box(o)[0].x))
    road_floor = min(box(o)[0].z for o in wheels)
    for i, o in enumerate(wheels):
        lo, hi = box(o)
        c = (lo + hi) / 2
        o.name = o.data.name = f"Wheel.{i}"
        pivot(o, c)
        r = (hi.z - lo.z) / 2
        road = lo.z < road_floor + .1
        # road wheels stand on the track (radius down to the track bottom); sprocket / idler only touch on bumps
        g = gl(c)
        spec_wheels.append({"node": o.name, "position": [g[0], g[1], g[2]], "radius": round(c.z if road else r, 4), "spin": round(r, 4),
                            "width": .4, "drive": True, "side": 1 if c.x > 0 else -1, "pivot": g})
    hlo, hhi = box(hull)
    data = {
        "model": "model.glb",
        "frame": "glTF: y up, nose -z, right +x, metres",
        "kind": "tank",
        "size": [round(hhi.x - hlo.x, 3), round(thi.z, 3), round(hhi.y - hlo.y, 3)],
        "mass": 33000,
        "topSpeed": 14,
        "wheels": spec_wheels,
        "body": {"min": [round(hlo.x, 4), round(hlo.z + .15, 4), round(-hhi.y, 4)], "max": [round(hhi.x, 4), round(thi.z, 4), round(-hlo.y, 4)]},
        "turret": {"node": "Turret", "position": gl(ring)},
        "gun": {"node": "Barrel", "position": gl(trunnion), "muzzle": gl(muzzle), "elevation": [-8, 20]},
        "seat": gl(ring + Vector((0, 0, -.6))),
        "eye": gl(ring + Vector((.3, -.2, .9))),
        "exit": gl(Vector((hlo.x - .8, (hlo.y + hhi.y) / 2, 0))),
        "exhaust": gl(Vector((.6, hlo.y + .1, hhi.z - .1))),
    }
    with open(os.path.join(OUT, "vehicle.json"), "w") as f:
        json.dump(data, f, indent=1)
    print("wrote vehicle.json", len(spec_wheels), "wheels")

    root = bpy.data.objects.new("Challenger", None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        if o.name in bpy.data.objects:
            o.parent = root

    import export
    export.export(os.path.join(OUT, "model.glb"))


main()
