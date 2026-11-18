"""Shooting range rework: owner's ~/Developer/3d/shooting-range/model.blend -> model.v2.blend (the original is never saved).

  blender -b --disable-autoexec ~/Developer/3d/shooting-range/model.blend -P tools/blender/packs/range-v2.py

Keeps the bunker, booths, gun cases, hanging targets and the far target walls (all distances). Adds:
- ground: the range in a ditch (flat floor, earth banks, a trench along the top near the bunker, hills out to the
  sides, a berm behind the last targets), `Ground`; a dirt road down the middle, `Road`
- per lane: a ground rail 10..100 m (`Rail.L<n>`), a carrier with a paper target (`Carrier.L<n>`, `Lane Target.L<n>`),
  2 desk buttons (`Button.near.L<n>`, `Button.far.L<n>`)
- distance markers 10 / 25 / 50 / 75 / 100 / 200 .. 800 both sides in the owner's style (`Marker.<d>`)
- sandbag nests with a fixed spotting scope (`Scope.fixed.<n>`), binoculars on desks (`Binoculars.<n>`)
- sandbag rows, rocks and a few trees from the Stylized Nature kit (flat colours)
Drops: the old ground and markers, `Target(Square)`, image textures on wood (flat colours).
Distances: the firing line is at blender y = FIRE, so a distance d stands at y = FIRE + d.
"""
import bpy, bmesh, math, os, random
from mathutils import Vector

HOME = os.path.expanduser("~/Developer/3d")
SRC = os.path.join(HOME, "shooting-range/model.blend")
OUT = os.path.join(HOME, "shooting-range/model.v2.blend")
NATURE = os.path.join(HOME, "store/Natrue/Stylized Nature MegaKit[Standard]/glTF")

FIRE = -1.0                       # the shooter's eye line (y) at the desks
LANES = [0.07, 4.14, 8.2, 12.27, 16.32, 20.38, 24.45]  # lane centres (x), from the booths
CX = 12.27                        # the range's middle (x)
FLOOR = 21.5                      # half width of the flat floor
END = 805.0                       # the floor ends, the berm starts
STOPS = [10, 25, 50, 75, 100]
MARKS = [10, 25, 50, 75, 100, 200, 300, 400, 500, 600, 700, 800]
rng = random.Random(7)


# ---------- helpers

def material(name, colour, rough=.9):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Roughness"].default_value = rough
    return m


MAT = {
    "grass": material("Range Grass", (.23, .30, .12)),
    "floor": material("Range Floor", (.33, .32, .19)),
    "dirt": material("Range Dirt", (.30, .22, .13)),
    "road": material("Range Road", (.38, .30, .20)),
    "sand": material("Sandbag", (.52, .45, .30)),
    "rail": material("Rail metal", (.18, .18, .19), .5),
    "wood": material("Range Wood", (.36, .24, .13)),
    "paper": material("Target paper", (.92, .9, .82)),
    "ink": material("Target ink", (.05, .05, .05)),
    "red": material("Marker red", (.75, .03, .02)),
    "white": material("Marker white", (.95, .95, .95)),
    "green": material("Button green", (.1, .5, .12)),
    "orange": material("Button orange", (.8, .35, .05)),
    "rock": material("Rock", (.40, .39, .36)),
    "bark": material("Bark", (.25, .17, .10)),
    "leaves": material("Leaves", (.20, .33, .12)),
    "steel": material("Scope steel", (.08, .09, .08), .4),
    "olive": material("Olive drab", (.24, .26, .15), .7),
}


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = link(bpy.data.objects.new(name, me))
    if mat:
        me.materials.append(mat)
    return obj


def box(name, lo, hi, mat, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector(((lo[i] + hi[i]) / 2 + v.co[i] * (hi[i] - lo[i]) for i in range(3)))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect="EDGES")
    return mesh_obj(name, bm, mat)


def cylinder(name, a, b, r, mat, segments=10):
    """a cylinder from a to b"""
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=(b - a).length)
    obj = mesh_obj(name, bm, mat)
    obj.location = (a + b) / 2
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
    return obj


def join(name, objs):
    """one object from many (keeps their materials)"""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = obj.data.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def ray_down(x, y, top=4.0, skip=()):
    """height of the first thing under (x, y) from `top`"""
    deps = bpy.context.evaluated_depsgraph_get()
    hit, at, *_ , obj, _m = bpy.context.scene.ray_cast(deps, Vector((x, y, top)), Vector((0, 0, -1)))
    while hit and obj and obj.name in skip:
        hit, at, *_, obj, _m = bpy.context.scene.ray_cast(deps, at - Vector((0, 0, .001)), Vector((0, 0, -1)))
    return at.z if hit else 0.0


# ---------- ground

def noise(x, y):
    """smooth value noise, about -1..1"""
    s = 0.0
    for f, a in ((.021, 1), (.047, .5), (.11, .25)):
        s += a * math.sin(x * f * 6.1 + math.sin(y * f * 1.7) * 2.3) * math.cos(y * f * 4.3 + math.sin(x * f * 2.9) * 1.9)
    return s / 1.75


def trench_at(y):
    return -14 <= y <= 140


def height(x, y):
    """the ground: ditch floor (0), banks, a trench on top near the bunker, hills out to the sides, the berm"""
    d = abs(x - CX)
    if d <= FLOOR:
        z = 0.0
    elif d <= FLOOR + 6:
        t = (d - FLOOR) / 6
        z = 3.6 * (t * t * (3 - 2 * t))
    elif d <= FLOOR + 8.5:
        z = 3.6
    elif d <= FLOOR + 10 and trench_at(y):
        z = 1.9
    elif d <= FLOOR + 13:
        z = 3.9
    else:
        z = 3.9 + (d - FLOOR - 13) * .22
    if d > FLOOR + 1:
        far = min(1, (d - FLOOR - 1) / 12)
        z += noise(x, y) * (.4 + 2.6 * far) * (0 if FLOOR + 8.4 < d < FLOOR + 10.1 and trench_at(y) else 1)
    # berm behind the targets, a ramp up behind the bunker
    if y > END:
        z = max(z, min(14, (y - END) * .55) + noise(x, y) * .6)
    if y < -12:
        z = max(z, min(4, (-12 - y) * .35))
    return z


def ground():
    xs = sorted(set([CX + s * v for s in (-1, 1) for v in (0, 5, 10, 15, FLOOR, FLOOR + 1.5, FLOOR + 3, FLOOR + 4.5,
                                                            FLOOR + 6, FLOOR + 8.4, FLOOR + 8.5, FLOOR + 10, FLOOR + 10.1,
                                                            FLOOR + 13, FLOOR + 18, FLOOR + 26, FLOOR + 36, FLOOR + 50, FLOOR + 70)]))
    ys = sorted(set([-40, -30, -20, -14, -13.9, -12, -8] + [y for y in range(0, 800, 8)] + [140, 140.1, END, 812, 820, 830, 845]))
    bm = bmesh.new()
    grid = [[bm.verts.new((x, y, height(x, y))) for x in xs] for y in ys]
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            d = abs((xs[i] + xs[i + 1]) / 2 - CX)
            y = (ys[j] + ys[j + 1]) / 2
            f.material_index = 1 if d < FLOOR and -12 < y < END else 2 if FLOOR + 8.4 < d < FLOOR + 10.1 and trench_at(y) else 0
    obj = mesh_obj("Ground", bm)
    for m in (MAT["grass"], MAT["floor"], MAT["dirt"]):
        obj.data.materials.append(m)
    # the road: a strip just over the floor, from behind the bunker to the berm
    bm = bmesh.new()
    w, prev = 1.8, None
    for y in [-12] + list(range(22, int(END), 10)) + [END]:
        wob = math.sin(y * .03) * .5 if y > 22 else 0
        a = bm.verts.new((CX - w + wob, y, .03))
        b = bm.verts.new((CX + w + wob, y, .03))
        if prev:
            bm.faces.new((prev[0], prev[1], b, a))
        prev = (a, b)
    mesh_obj("Road", bm, MAT["road"])
    return obj


# ---------- lanes

def paper_target(name, at):
    """a white board 60 x 60 cm, black rings (flat, a hair in front), on two legs"""
    x, y, z = at
    parts = [box(name + "~board", (x - .3, y - .01, z), (x + .3, y + .01, z + .6), MAT["paper"])]
    for k, r in enumerate((.25, .17, .09, .03)):
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, segments=24, radius=r)
        o = mesh_obj(f"{name}~ring{k}", bm, MAT["ink"] if k % 2 == 0 else MAT["paper"])
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.location = (x, y - .012 - .001 * k, z + .3)
        parts.append(o)
    return join(name, parts)


def lanes():
    for n, x in enumerate(LANES, 1):
        y0, y1 = FIRE + STOPS[0], FIRE + STOPS[-1]
        rails = [box(f"r{n}{s}", (x + s - .03, y0 - 1, 0), (x + s + .03, y1 + 1, .06), MAT["rail"]) for s in (-.35, .35)]
        rails += [box(f"t{n}{k}", (x - .45, y, -.02), (x + .45, y + .15, .03), MAT["wood"]) for k, y in enumerate(range(int(y0) - 1, int(y1) + 2, 2))]
        join(f"Rail.L{n}", rails)
        y = FIRE + STOPS[0]
        cart = [box("c", (x - .42, y - .3, .06), (x + .42, y + .3, .22), MAT["olive"], .02)]
        cart += [box(f"p{s}", (x + s - .03, y - .03, .22), (x + s + .03, y + .03, 1.0), MAT["wood"]) for s in (-.28, .28)]
        cart.append(box("sh", (x - .5, y - .45, .22), (x + .5, y - .35, .9), MAT["olive"], .01))  # steel shield over the cart
        join(f"Carrier.L{n}", cart)
        paper_target(f"Lane Target.L{n}", (x, y + .05, 1.0))


def buttons():
    """two buttons on each desk, left of the lane centre: nearer (green), further (orange)"""
    for n, x in enumerate(LANES, 1):
        top = ray_down(x - .55, .2, 2.5)
        base = box(f"Button.base.L{n}", (x - .7, .1, top), (x - .4, .3, top + .04), MAT["olive"])
        near = box(f"Button.near.L{n}", (x - .66, .17, top + .04), (x - .58, .23, top + .07), MAT["green"])
        far = box(f"Button.far.L{n}", (x - .52, .17, top + .04), (x - .44, .23, top + .07), MAT["orange"])
        for o in (base, near, far):
            o["lane"] = n


# ---------- markers

def digit(ch, size):
    cu = bpy.data.curves.new("d", "FONT")
    cu.body, cu.size, cu.extrude, cu.resolution_u = ch, size, .004, 2
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    cu.font = bpy.data.fonts.load(FONT, check_existing=True) if os.path.exists(FONT) else cu.font
    obj = link(bpy.data.objects.new("d", cu))
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
    bpy.data.objects.remove(obj)
    out = link(bpy.data.objects.new("d", me))
    me.materials.clear()
    me.materials.append(MAT["white"])
    return out


FONT = "/System/Library/Fonts/Supplemental/Impact.ttf"


def marker(d, x, flip):
    """owner's style: a red board, the digits white and stacked, on a post; faces the shooters (both sides)"""
    y, s = FIRE + d, .3
    chars = str(d)
    h = len(chars) * s + .1
    z0, gz = 1.0, height(x, y)
    parts = [box("post", (x - .05, y - .05, gz - .3), (x + .05, y + .05, gz + z0), MAT["wood"]),
             box("board", (x - .2, y - .02, gz + z0), (x + .2, y + .02, gz + z0 + h), MAT["red"])]
    for k, ch in enumerate(chars):
        for side in (-1, 1):
            o = digit(ch, s * 1.05)
            o.rotation_euler = (math.pi / 2, 0, 0 if side < 0 else math.pi)
            o.location = (x, y + side * .025, gz + z0 + h - .05 - s * (k + .5))
            parts.append(o)
    obj = join(f"Marker.{d}{'.R' if flip else ''}", parts)
    return obj


def markers():
    for d in MARKS:
        marker(d, CX - FLOOR + 1.2, False)
        marker(d, CX + FLOOR - 1.2, True)


# ---------- sandbags, nests, scopes, binoculars

def sandbag(name, at, yaw):
    o = box(name, (-.3, -.17, 0), (.3, .17, .14), MAT["sand"], .045)
    o.location, o.rotation_euler = at, (0, 0, yaw)
    return o


def bag_wall(name, a, b, rows=3, base=None):
    """sandbags staggered from a to b (xy), `rows` high, on the ground"""
    a, b = Vector(a), Vector(b)
    dirv = (b - a)
    n = max(1, int(dirv.length / .58))
    yaw = math.atan2(dirv.y, dirv.x)
    out = []
    for r in range(rows):
        for i in range(n - (r % 2)):
            t = (i + .5 + (r % 2) * .5) / n
            p = a + dirv * t
            z = (height(p.x, p.y) if base is None else base) + r * .13
            out.append(sandbag("bag", (p.x, p.y, z), yaw + rng.uniform(-.06, .06)))
    return join(name, out)


def spotting_scope(name, at, yaw):
    """a tripod and a long tube, eye at ~1.25 m"""
    x, y, z = at
    head = Vector((x, y, z + 1.1))
    parts = []
    for k in range(3):
        a = yaw + k * 2 * math.pi / 3 + .5
        parts.append(cylinder("leg", (x + math.cos(a) * .45, y + math.sin(a) * .45, z), head, .015, MAT["steel"], 6))
    fwd = Vector((math.cos(yaw + math.pi / 2), math.sin(yaw + math.pi / 2), 0))
    parts.append(cylinder("tube", head + Vector((0, 0, .12)) - fwd * .25, head + Vector((0, 0, .12)) + fwd * .35, .045, MAT["olive"], 12))
    parts.append(cylinder("lens", head + Vector((0, 0, .12)) + fwd * .33, head + Vector((0, 0, .12)) + fwd * .42, .06, MAT["steel"], 12))
    parts.append(cylinder("eye", head + Vector((0, 0, .12)) - fwd * .34, head + Vector((0, 0, .12)) - fwd * .25, .025, MAT["steel"], 8))
    parts.append(cylinder("pan", head, head + Vector((0, 0, .08)), .03, MAT["steel"], 8))
    obj = join(name, parts)
    obj["eye"] = list(head + Vector((0, 0, .12)) - fwd * .34)
    obj["zoom"] = 25
    return obj


def binoculars(name, at, yaw):
    x, y, z = at
    parts = []
    for s in (-1, 1):
        parts.append(cylinder("b", (x + s * .04, y - .07, z + .035), (x + s * .04, y + .07, z + .035), .032, MAT["olive"], 10))
        parts.append(cylinder("e", (x + s * .04, y - .1, z + .035), (x + s * .04, y - .07, z + .035), .018, MAT["steel"], 8))
    parts.append(box("bridge", (x - .03, y - .02, z + .02), (x + .03, y + .04, z + .05), MAT["steel"]))
    obj = join(name, parts)
    obj.rotation_euler.z = yaw
    obj["zoom"] = 7
    return obj


def nests():
    """sandbag rings at both sides of the bunker on the floor, and two up on the banks; a spotting scope in each"""
    spots = [(CX - FLOOR + 3.5, -1.5), (CX + FLOOR - 3.5, -1.5), (CX - FLOOR - 7.2, 30), (CX + FLOOR + 7.2, 30)]
    for n, (x, y) in enumerate(spots, 1):
        g = height(x, y)
        ring = []
        for k in range(7):
            a0, a1 = math.pi * (k / 7 * 1.3 - .15), math.pi * ((k + 1) / 7 * 1.3 - .15)
            ring.append(bag_wall("w", (x + math.cos(a0) * 1.3, y + math.sin(a0) * 1.3), (x + math.cos(a1) * 1.3, y + math.sin(a1) * 1.3), 3, g))
        join(f"Sandbag.nest.{n}", ring)
        spotting_scope(f"Scope.fixed.{n}", (x, y - .2, g), 0)
    for n, x in enumerate((LANES[1], LANES[3], LANES[5]), 1):
        top = ray_down(x + .55, .25, 2.5)
        binoculars(f"Binoculars.{n}", (x + .55, .25, top), rng.uniform(-.4, .4))


def bank_bags():
    """sandbags along the trench edge near the bunker, both sides"""
    for s, side in ((-1, "L"), (1, "R")):
        x = CX + s * (FLOOR + 8.3)
        for k, y0 in enumerate(range(-10, 130, 12)):
            bag_wall(f"Sandbag.bank.{side}{k}", (x, y0), (x, y0 + 9), 2)


# ---------- nature

def flat_colours(objs, colour):
    for o in objs:
        if o.type == "MESH":
            o.data.materials.clear()
            o.data.materials.append(colour)


def load_nature(name):
    path = os.path.join(NATURE, name + ".gltf")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in new:
        if o.type != "MESH":
            for c in o.children:
                c.parent = None
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    for o in meshes:
        o.matrix_world = o.matrix_world.copy()
    return meshes


def scatter():
    rocks = sum((load_nature(f"Rock_Medium_{k}") for k in (1, 2, 3)), [])
    flat_colours(rocks, MAT["rock"])
    trees = load_nature("CommonTree_1") + load_nature("CommonTree_3")
    for t in trees:
        t.data.materials.clear()
        t.data.materials.append(MAT["bark"])
        t.data.materials.append(MAT["leaves"])
        # leaves: the faces above a third of the height
        hi = max(v.co.z for v in t.data.vertices)
        for p in t.data.polygons:
            p.material_index = 1 if p.center.z > hi * .35 else 0
    protos = rocks + trees
    for p in protos:
        p.location = (0, 0, -100)
    n = 0
    for k in range(110):
        y = rng.uniform(-30, 830)
        side = rng.choice((-1, 1))
        d = rng.uniform(FLOOR + .5, FLOOR + 6) if k % 3 else rng.uniform(FLOOR + 13, FLOOR + 40)
        x = CX + side * d
        if trench_at(y) and FLOOR + 7.5 < d < FLOOR + 11:
            continue
        src = rng.choice(rocks)
        o = link(bpy.data.objects.new(f"Rock.{n}", src.data))
        o.location = (x, y, height(x, y) - .15)
        o.rotation_euler = (0, 0, rng.uniform(0, 6.3))
        o.scale = [rng.uniform(.2, .45)] * 3 if d < FLOOR + 7 else [rng.uniform(.5, 1.3)] * 3
        n += 1
    for k in range(60):
        side, y = rng.choice((-1, 1)), rng.uniform(-40, 840)
        d = rng.uniform(FLOOR + 15, FLOOR + 68)
        x = CX + side * d
        o = link(bpy.data.objects.new(f"Tree.{k}", rng.choice(trees).data))
        o.location = (x, y, height(x, y) - .1)
        o.rotation_euler = (0, 0, rng.uniform(0, 6.3))
        o.scale = [rng.uniform(.8, 1.4)] * 3
    for p in protos:
        bpy.data.objects.remove(p)


# ---------- cleanup of the old file

def drop_old():
    for o in list(bpy.data.objects):
        if o.name.startswith("DistanceMarker") or o.name in ("Single Target.001", "Target(Square)"):
            bpy.data.objects.remove(o)


def flat_wood():
    """wood materials: the image texture off, a flat colour (owner: no wood textures)"""
    for m in bpy.data.materials:
        if not m.node_tree or "wood" not in m.name.lower():
            continue
        nodes = m.node_tree.nodes
        for n in [n for n in nodes if n.type == "TEX_IMAGE"]:
            nodes.remove(n)
        b = nodes.get("Principled BSDF")
        if b:
            b.inputs["Base Color"].default_value = (.36, .24, .13, 1)


def tidy():
    """loose parts get collections so the owner can find things"""
    groups = {"Ground": ("Ground", "Road"), "Lanes": ("Rail.", "Carrier.", "Lane Target.", "Button."),
              "Markers": ("Marker.",), "Sandbags": ("Sandbag.",), "Optics": ("Scope.fixed", "Binoculars."),
              "Nature": ("Rock.", "Tree.")}
    for g, prefixes in groups.items():
        col = bpy.data.collections.new(g)
        bpy.context.scene.collection.children.link(col)
        for o in list(bpy.context.scene.collection.objects):
            if o.name.startswith(prefixes):
                col.objects.link(o)
                bpy.context.scene.collection.objects.unlink(o)


if __name__ == "__main__":
    drop_old()
    flat_wood()
    ground()
    lanes()
    buttons()
    markers()
    nests()
    bank_bags()
    scatter()
    tidy()
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT, copy=True)
    print("saved", OUT)
