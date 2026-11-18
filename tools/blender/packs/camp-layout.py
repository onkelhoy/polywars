"""The military camp shooting range -> ~/Developer/3d/shooting-range/camp.blend (then shooting-range.py exports it).

  blender -b --factory-startup -P tools/blender/packs/camp-layout.py

Two fields side by side with a road between them, a firing bunker at the head of each (open window, a counter, a booth
per lane, a crate per lane = gun stand), earth berms (safety walls, backstops), the flag circle where the road starts,
tents / jeeps / truck / crates behind. Props come from the owner's camp-props.blend (copied, never written) and
camp-props.py (bunker, sandbags). Blender z up, +y down the range, the firing line at y = 0.

Field A (x < 0): short range, a lane target on a flush rail per lane, stops 10..100 m, backstop at 112 m.
Field B (x > 0): long range, one target frame per lane at 100..700 m, a big one at 800 m, backstop at 830 m.
Names the exporter reads: Ground*, Berm*, Rail.L<n>, Carrier.L<n>, Lane Target.L<n>, Button.near/far.L<n>, Stand.<n>,
Target.<d>.<n>, Marker.<d>, Scope.fixed.<n>, Binoculars.<n>.
"""
import bpy, bmesh, importlib.util, math, os, random, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("props", os.path.join(HERE, "camp-props.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)

HOME = os.path.expanduser("~/Developer/3d")
PROPS = os.path.join(HOME, "shooting-range/camp-props.blend")
OUT = os.path.join(HOME, "shooting-range/camp.blend")
LOGO = os.path.expanduser("~/Developer/projects/papit/asset/logo-square.png")
JEEP = os.path.join(HOME, "store/Vehicles/willys-jeep-low-poly/source/willys jeep Blend.fbx")
TRUCK = os.path.join(HOME, "store/Vehicles/WW2Truck/WW2Truck")
NATURE = os.path.join(HOME, "store/Natrue/Stylized Nature MegaKit[Standard]/glTF")
rng = random.Random(11)

LANES = 7
LANE_W = 3.6                          # bunker width per lane
FIELD_W = LANES * LANE_W              # 25.2
ROAD_W = 6.0
GAP = ROAD_W / 2 + 4.5                # road centre -> field edge (a safety berm between)
A = -(GAP + FIELD_W / 2)              # field centres (x)
B = GAP + FIELD_W / 2
STOPS = [10, 25, 50, 75, 100]
FAR = [100, 200, 300, 400, 500, 600, 700]

mat = P.mat
M = dict(P.M)
M.update({
    "mown": mat("Range grass", (.26, .33, .14), 1),
    "mown2": mat("Range grass light", (.30, .37, .16), 1),
    "field": mat("Field grass", (.22, .30, .12), 1),
    "road": mat("Gravel road", (.30, .27, .21), 1),
    "rail": mat("Rail steel", (.2, .2, .21), .5, .7),
    "paper": mat("Target paper", (.93, .91, .84), .9),
    "ink": mat("Target ink", (.05, .05, .05), .9),
    "red": mat("Marker red", (.72, .04, .03), .8),
    "white": mat("Marker white", (.95, .95, .93), .8),
    "green": mat("Button green", (.12, .5, .14), .5),
    "orange": mat("Button orange", (.85, .38, .06), .5),
    "olive": mat("Olive drab", (.24, .26, .15), .7),
    "crate": mat("Crate wood", (.38, .28, .15), .9),
    "bark": mat("Bark", (.25, .17, .10), 1),
    "leaves": mat("Leaves", (.19, .31, .11), 1),
    "rock": mat("Rock", (.42, .41, .38), 1),
})


def col(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def box(name, lo, hi, material, c, bevel=0.0):
    bm = bmesh.new()
    P.cube(bm, lo, hi)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect="EDGES")
    return P.obj_from(bm, name, material, c)


def join(name, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = o.data.name = name
    return o


def move_to(o, c):
    for x in list(o.users_collection):
        x.objects.unlink(o)
    c.objects.link(o)


# ---------------- ground + berms

def hills(x, y):
    s = 0.0
    for f, a in ((.013, 1), (.031, .45), (.07, .2)):
        s += a * math.sin(x * f * 5.3 + math.sin(y * f * 1.9) * 2.1) * math.cos(y * f * 3.7 + math.sin(x * f * 2.3) * 1.7)
    return s / 1.65


def ground(c):
    """flat for the camp, fields and road; rising into soft hills beyond the outer berms"""
    edge = GAP + FIELD_W + 6
    xs = sorted(set([-200, -140, -100, -75, -60, -edge - 8, -edge, edge, edge + 8, 60, 75, 100, 140, 200] + list(range(-int(edge) + 4, int(edge), 8))))
    ys = sorted(set([-160, -120, -90, -70] + list(range(-60, 900, 20)) + [920, 960]))
    bm = bmesh.new()
    def z(x, y):
        out = max(0, abs(x) - edge)
        h = min(1, out / 30) ** 1.5 * (6 + 10 * (hills(x, y) * .5 + .5))
        if y < -70:
            h = max(h, min(1, (-70 - y) / 50) * (4 + 4 * (hills(x, y) * .5 + .5)))
        if y > 840:
            h = max(h, min(1, (y - 840) / 60) * 14)
        return h
    grid = [[bm.verts.new((x, y, z(x, y))) for x in xs] for y in ys]
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.material_index = 0
    return P.obj_from(bm, "Ground", [M["field"]], c)


def strip(name, x0, x1, y0, y1, z, material, c, step=20):
    """a flat strip over the ground (road, mown field)"""
    bm = bmesh.new()
    prev = None
    y = y0
    while True:
        a, b = bm.verts.new((x0, y, z)), bm.verts.new((x1, y, z))
        if prev:
            bm.faces.new((prev[0], prev[1], b, a))
        prev = (a, b)
        if y >= y1:
            break
        y = min(y1, y + step)
    return P.obj_from(bm, name, material, c)


def berm(name, a, b, height, base, c, top=1.2):
    """an earth bank along a -> b (xy): trapezoid, lumpy, turf over earth"""
    a, b = Vector(a), Vector(b)
    d = (b - a)
    n = max(2, int(d.length / 6))
    side = Vector((-d.y, d.x)).normalized()
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        p = a.lerp(b, i / n)
        lump = (rng.uniform(-.25, .25) if 0 < i < n else 0)
        prof = [(-base / 2, 0), (-top / 2 - (base - top) * .18, height * .55 + lump * .5), (-top / 2, height + lump),
                (top / 2, height + lump), (top / 2 + (base - top) * .18, height * .55 + lump * .5), (base / 2, 0)]
        rows.append([bm.verts.new((p.x + side.x * s, p.y + side.y * s, h)) for s, h in prof])
    for i in range(n):
        for k in range(len(rows[0]) - 1):
            f = bm.faces.new((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
            f.material_index = 1 if 1 <= k <= 3 else 0
    # end caps
    for r in (rows[0], rows[-1][::-1]):
        f = bm.faces.new(r[::-1])
        f.material_index = 0
    o = P.obj_from(bm, name, [M["earth"], M["turf"]], c)
    t = bmesh.new(); t.from_mesh(o.data); bmesh.ops.recalc_face_normals(t, faces=t.faces[:]); t.to_mesh(o.data); t.free()
    return o


def land():
    c = col("Ground")
    ground(c)
    # the fields mown in stripes, the road gravel
    for cx, length in ((A, 112), (B, 830)):
        for k in range(LANES):
            x0 = cx - FIELD_W / 2 + k * LANE_W
            strip(f"Ground field {cx:.0f} {k}", x0, x0 + LANE_W, 4, length, .01, M["mown" if k % 2 else "mown2"], c)
    strip("Ground road", -ROAD_W / 2, ROAD_W / 2, -60, 830, .02, M["road"], c)
    strip("Ground square", -8, 8, -35, -18, .015, M["road"], c, 17)
    b = col("Berms")
    # safety berms both sides of the road, outer berms, backstops
    for s in (-1, 1):
        berm(f"Berm road {s}", (s * (ROAD_W / 2 + 2.2), 8), (s * (ROAD_W / 2 + 2.2), 826), 2.6, 4.2, b)
        berm(f"Berm outer {s}", (s * (GAP + FIELD_W + 2.5), 2), (s * (GAP + FIELD_W + 2.5), 832), 3.4, 6, b)
    berm("Berm backstop A", (A - FIELD_W / 2 - 1, 116), (A + FIELD_W / 2 + 1, 116), 5.5, 8, b, 1.6)
    berm("Berm backstop B", (B - FIELD_W / 2 - 1, 836), (B + FIELD_W / 2 + 1, 836), 9, 12, b, 2)
    # a low bank behind field A's backstop to its far end: the short field ends there
    return c


# ---------------- firing points

def firing_point(cx, field):
    """the bunker at the head of a field: the window faces +y, one booth per lane, a gun crate behind each"""
    c = col(f"Bunker {field}")
    depth = 6.0
    o = P.bunker(c, Vector((cx, -depth / 2 + .6, 0)), FIELD_W + 1.2, depth, 3.0, lanes=LANES)
    for x in list(c.objects):
        x.name = f"{x.name} {field}"
    # counter along the window, booth dividers, a crate (gun stand) per lane
    front = .6 - .6  # inner face of the front wall (y)
    parts = [box("counter", (cx - FIELD_W / 2, front - .55, .98), (cx + FIELD_W / 2, front, 1.05), M["wood"], c)]
    for k in range(1, LANES):
        x = cx - FIELD_W / 2 + k * LANE_W
        parts.append(box("divider", (x - .03, front - 1.6, 0), (x + .03, front, 2.0), M["wood"], c))
    join(f"Booths {field}", parts)
    for k in range(LANES):
        x = cx - FIELD_W / 2 + (k + .5) * LANE_W
        crate = box(f"Stand.{field}{k + 1}", (x + .6, front - 2.3, 0), (x + 1.4, front - 1.8, .45), M["crate"], c, .02)
        crate["lane"] = k + 1
    return c


# ---------------- lanes (field A) and far targets (field B)

def paper_target(name, x, y, z, size, c, posts=True):
    """a paper face on a board: black rings, white between; two wooden posts"""
    parts = [box("board", (x - size / 2, y - .015, z), (x + size / 2, y + .015, z + size), M["paper"], c)]
    for k, r in enumerate((.42, .29, .16, .05)):
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, segments=24, radius=r * size)
        o = P.obj_from(bm, "ring", M["ink" if k % 2 == 0 else "paper"], c)
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.location = (x, y - .017 - .002 * k, z + size / 2)
        parts.append(o)
    board = join(name, parts)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if posts:
        for s in (-1, 1):
            box(f"{name} post", (x + s * size * .38 - .04, y + .02, 0), (x + s * size * .38 + .04, y + .1, z + size * .6), M["wood"], c)
    return board


def lanes_a():
    c = col("Lanes A")
    for n in range(1, LANES + 1):
        x = A - FIELD_W / 2 + (n - .5) * LANE_W
        # a flush steel strip in a concrete curb: reads as a slot in the grass, not a railway
        box(f"Rail.L{n}", (x - .06, STOPS[0] - 1.5, 0), (x + .06, STOPS[-1] + 1.5, .03), M["rail"], c)
        y = STOPS[0]
        cart = [box("cart", (x - .35, y - .25, .02), (x + .35, y + .25, .16), M["olive"], c, .02),
                box("mast", (x - .03, y - .03, .16), (x + .03, y + .03, .95), M["steel"], c)]
        join(f"Carrier.L{n}", cart)
        paper_target(f"Lane Target.L{n}", x, y - .05, .95, .7, c, posts=False)
        # the buttons on the counter, left of the lane
        top = 1.05
        for name, dx, m in ((f"Button.near.L{n}", -.75, "green"), (f"Button.far.L{n}", -.55, "orange")):
            b = box(name, (A - FIELD_W / 2 + (n - 1) * LANE_W + 1.0 + dx - .06, -.35, top), (A - FIELD_W / 2 + (n - 1) * LANE_W + 1.0 + dx + .06, -.23, top + .04), M[m], c)
            b["lane"] = n
        base = box(f"Button base L{n}", (A - FIELD_W / 2 + (n - 1) * LANE_W + .12, -.4, top), (A - FIELD_W / 2 + (n - 1) * LANE_W + .62, -.18, top + .01), M["olive"], c)


def targets_b():
    c = col("Targets B")
    for n, d in enumerate(FAR, 1):
        x = B - FIELD_W / 2 + (n - .5) * LANE_W
        size = .8 + d / 700 * 1.0
        paper_target(f"Target.{d}.{n}", x, d, .6, size, c)
    for s in (-1, 0, 1):
        paper_target(f"Target.800.{s + 2}", B + s * 4, 800, 1.0, 2.4, c)


# ---------------- markers

FONT = "/System/Library/Fonts/Supplemental/Impact.ttf"


def digit(ch, size, c):
    cu = bpy.data.curves.new("d", "FONT")
    cu.body, cu.size, cu.extrude, cu.resolution_u = ch, size, .004, 2
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    if os.path.exists(FONT):
        cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    o = bpy.data.objects.new("d", cu)
    c.objects.link(o)
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(o)
    out = bpy.data.objects.new("d", me)
    c.objects.link(out)
    me.materials.clear()
    me.materials.append(M["white"])
    return out


def marker(d, x, c, tag):
    s, chars = .3, str(d)
    h = len(chars) * s + .1
    parts = [box("post", (x - .05, d - .05, -.3), (x + .05, d + .05, 1.0), M["wood"], c),
             box("board", (x - .2, d - .02, 1.0), (x + .2, d + .02, 1.0 + h), M["red"], c)]
    for k, ch in enumerate(chars):
        for side in (-1, 1):
            o = digit(ch, s * 1.05, c)
            o.rotation_euler = (math.pi / 2, 0, 0 if side < 0 else math.pi)
            o.location = (x, d + side * .025, 1.0 + h - .05 - s * (k + .5))
            parts.append(o)
    o = join(f"Marker.{d}.{tag}", parts)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def markers():
    c = col("Markers")
    for d in STOPS:
        marker(d, A - FIELD_W / 2 + .4, c, "A")
    for d in FAR + [800]:
        marker(d, B + FIELD_W / 2 - .4, c, "B")


# ---------------- props from camp-props.blend

def append_collection(name):
    with bpy.data.libraries.load(PROPS, link=False) as (src, dst):
        dst.collections = [n for n in src.collections if n == name]
    got = dst.collections[0] if dst.collections else None
    return got


def place(proto_objs, at, yaw, c, name):
    """copies of objects (linked meshes) moved by `at` / `yaw` round the origin"""
    out = []
    T = Matrix.Translation(at) @ Matrix.Rotation(yaw, 4, "Z")
    for o in proto_objs:
        x = o.copy()
        x.name = f"{name} {o.name}"
        x.matrix_world = T @ o.matrix_world
        c.objects.link(x)
        out.append(x)
    return out


def centred(objs):
    """the objects' combined footprint centre (xy) at the origin"""
    pts = [o.matrix_world @ Vector(b) for o in objs for b in o.bound_box]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    for o in objs:
        o.location.x -= cx
        o.location.y -= cy
    return objs


def flag_texture(objs):
    """the cloth gets the papit logo as an image (planar uv over the cloth), the modelled letters go"""
    img = bpy.data.images.load(LOGO, check_existing=True)
    m = bpy.data.materials.new("papit flag")
    m.use_nodes = True
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    keep = []
    for o in objs:
        if "letter" in o.name.lower():
            bpy.data.objects.remove(o)
            continue
        keep.append(o)
        if "cloth" in o.name.lower():
            me = o.data
            me.materials.clear()
            me.materials.append(m)
            uv = me.uv_layers.new(name="UVMap")
            xs = [v.co.x for v in me.vertices]
            zs = [v.co.z for v in me.vertices]
            x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
            for loop in me.loops:
                v = me.vertices[loop.vertex_index].co
                # the flag is 3:2, the logo square: fit its height, the text (bottom right) at the free end
                u = (v.x - x0) / (x1 - x0)
                uv.data[loop.index].uv = (u * 1.5 - .5 if v.y >= 0 else 1 - (u * 1.5 - .5), (v.z - z0) / (z1 - z0))
    return keep


def camp():
    c = col("Camp")
    tent = append_collection("Tent")
    flag = append_collection("Flag")
    bags = append_collection("Sandbags")
    tent_objs = centred(list(tent.objects)) if tent else []
    flag_objs = list(flag.objects) if flag else []
    if flag_objs:
        pole = next((o for o in flag_objs if o.name.startswith("Flag pole")), flag_objs[0])
        off = pole.matrix_world.translation.copy()
        off.z = 0
        flag_objs = flag_texture(flag_objs)
        for o in flag_objs:
            o.matrix_world = Matrix.Translation(-off) @ o.matrix_world
        place(flag_objs, Vector((0, -27, 0)), 0, c, "Flag")
    # tents: two rows either side of the square, doors to the road
    for s in (-1, 1):
        for k in range(4):
            place(tent_objs, Vector((s * (17 + k * 5.4), -48 + (k % 2) * .4, 0)), math.pi / 2 * -s + math.pi / 2 + rng.uniform(-.04, .04), c, f"Tent {s} {k}")
        for k in range(3):
            place(tent_objs, Vector((s * (19.5 + k * 5.4), -60, 0)), math.pi / 2 * -s + math.pi / 2 + rng.uniform(-.04, .04), c, f"Tent b {s} {k}")
    # sandbag walls: the camp gate on the road, round the square's corners
    walls = [o for o in (bags.objects if bags else []) if "wall" in o.name.lower()]
    if walls:
        w = centred([walls[0]])[0]
        for at, yaw in (((-5.5, -66), 0), ((5.5, -66), 0), ((-13, -14), math.pi / 2), ((13, -14), math.pi / 2), ((-9, -42), 0), ((9, -42), 0)):
            place([w], Vector((at[0], at[1], 0)), yaw, c, "Sandbag gate")
    for x in list(c.objects):
        pass
    for coll in (tent, flag, bags):
        if coll:
            for o in list(coll.objects):
                bpy.data.objects.remove(o)
            bpy.data.collections.remove(coll)


def vehicles():
    c = col("Vehicles")
    before = set(bpy.data.objects)
    try:
        bpy.ops.import_scene.fbx(filepath=JEEP)
    except Exception as e:
        print("jeep:", e)
        return
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        o.matrix_world = o.matrix_world.copy()
    for o in new:
        if o.type != "MESH":
            for ch in o.children:
                mw = ch.matrix_world.copy(); ch.parent = None; ch.matrix_world = mw
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    jeep = join("Jeep", meshes)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # to ~3.4 m long, wheels on the ground, nose to +y
    dims = jeep.dimensions
    long_axis = 0 if dims.x > dims.y else 1
    s = 3.4 / max(dims.x, dims.y)
    jeep.scale = (s, s, s)
    bpy.ops.object.transform_apply(scale=True)
    if long_axis == 0:
        jeep.rotation_euler.z = math.pi / 2
        bpy.ops.object.transform_apply(rotation=True)
    centred([jeep])
    zmin = min((jeep.matrix_world @ v.co).z for v in jeep.data.vertices)
    jeep.location.z -= zmin
    bpy.ops.object.transform_apply(location=True)
    # olive drab over its textures
    jeep.data.materials.clear()
    jeep.data.materials.append(M["olive"])
    move_to(jeep, c)
    for k, (x, y, yaw) in enumerate(((-1.4, -8, .12), (1.6, -12.5, -.08), (-1.5, -17, .05))):
        j = jeep.copy()
        j.name = f"Jeep {k}"
        j.location = (x, y, 0)
        j.rotation_euler.z = math.pi + yaw
        c.objects.link(j)
    bpy.data.objects.remove(jeep)


def crates():
    c = col("Camp")
    for k in range(14):
        side = rng.choice((-1, 1))
        x = side * rng.uniform(9, 14)
        y = rng.uniform(-12, -4)
        s = rng.uniform(.5, .9)
        o = box(f"Crate {k}", (-s / 2, -s * .35, 0), (s / 2, s * .35, s * .6), M["crate"], c, .015)
        o.location = (x, y, 0)
        o.rotation_euler.z = rng.uniform(-.3, .3)
    for k in range(8):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.3, radius2=.3, depth=.9)
        bmesh.ops.translate(bm, vec=(0, 0, .45), verts=bm.verts)
        o = P.obj_from(bm, f"Barrel {k}", M["olive"], c)
        o.location = (rng.choice((-1, 1)) * rng.uniform(15, 18), rng.uniform(-14, -6), 0)


def scopes_and_glasses():
    c = col("Optics")
    # spotting scopes on sandbag rests in front of field B's bunker, both ends
    for n, x in enumerate((B - FIELD_W / 2 + 1.2, B + FIELD_W / 2 - 1.2), 1):
        P.bag_wall(f"Sandbag rest {n}", c, 1.6, 4, Vector((x, 1.4, 0)), double=True)
        parts = [box("leg", (x - .04, .9, 0), (x + .04, .98, 1.05), M["steel"], c),
                 box("head", (x - .06, .82, 1.05), (x + .06, 1.06, 1.12), M["steel"], c)]
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.05, radius2=.065, depth=.6)
        tube = P.obj_from(bm, "tube", M["olive"], c)
        tube.rotation_euler = (math.pi / 2, 0, 0)
        tube.location = (x, 1.0, 1.2)
        parts.append(tube)
        o = join(f"Scope.fixed.{n}", parts)
        o["eye"] = [x, .66, 1.2]
        o["zoom"] = 25
    # binoculars on the counter of each bunker, middle lane
    for n, cx in enumerate((A, B), 1):
        x = cx + .9
        parts = []
        for s in (-1, 1):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=.032, radius2=.032, depth=.15)
            o = P.obj_from(bm, "b", M["olive"], c)
            o.rotation_euler = (math.pi / 2, 0, 0)
            o.location = (x + s * .04, -.3, 1.085)
            parts.append(o)
        o = join(f"Binoculars.{n}", parts)
        o["zoom"] = 7


def trees():
    c = col("Nature")
    protos = []
    for name in ("CommonTree_1", "CommonTree_3", "Rock_Medium_1", "Rock_Medium_2"):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(NATURE, name + ".gltf"))
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.type != "MESH":
                for ch in o.children:
                    mw = ch.matrix_world.copy(); ch.parent = None; ch.matrix_world = mw
        for o in [o for o in new if o.type != "MESH"]:
            bpy.data.objects.remove(o)
        m = [o for o in new if o.name in bpy.data.objects and o.type == "MESH"]
        for o in m:
            o.data.materials.clear()
            if "Tree" in name:
                o.data.materials.append(M["bark"]); o.data.materials.append(M["leaves"])
                hi = max(v.co.z for v in o.data.vertices)
                for p in o.data.polygons:
                    p.material_index = 1 if p.center.z > hi * .35 else 0
            else:
                o.data.materials.append(M["rock"])
            protos.append((name, o))
    edge = GAP + FIELD_W + 7
    for k in range(140):
        name, src = rng.choice([p for p in protos if "Tree" in p[0]])
        side = rng.choice((-1, 1))
        x = side * rng.uniform(edge, edge + 60)
        y = rng.uniform(-120, 880)
        o = bpy.data.objects.new(f"Tree.{k}", src.data)
        o.location = (x, y, 0)
        o.rotation_euler.z = rng.uniform(0, 6.3)
        o.scale = [rng.uniform(.8, 1.5)] * 3
        c.objects.link(o)
    # a few trees and rocks round the camp
    for k in range(18):
        name, src = rng.choice(protos)
        x = rng.choice((-1, 1)) * rng.uniform(26, 45)
        y = rng.uniform(-75, -20)
        o = bpy.data.objects.new(f"{'Tree' if 'Tree' in name else 'Rock'}.c{k}", src.data)
        o.location = (x, y, 0)
        o.rotation_euler.z = rng.uniform(0, 6.3)
        o.scale = [rng.uniform(.4, .9) if "Rock" in name else rng.uniform(.9, 1.3)] * 3
        c.objects.link(o)
    for _, o in protos:
        bpy.data.objects.remove(o)


def ground_heights():
    """everything placed on flat ground (z 0) already; trees past the berms sit on the hills"""
    g = bpy.data.objects["Ground"]
    deps = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        if o.name.startswith(("Tree.", "Rock.")):
            hit, at, *_ = g.ray_cast(Vector((o.location.x, o.location.y, 100)), Vector((0, 0, -1)))
            if hit:
                o.location.z = at.z - .1


if __name__ == "__main__":
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    land()
    firing_point(A, "A")
    firing_point(B, "B")
    lanes_a()
    targets_b()
    markers()
    camp()
    vehicles()
    crates()
    scopes_and_glasses()
    trees()
    ground_heights()
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    print("saved", OUT)
