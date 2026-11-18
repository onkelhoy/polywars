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
STOPS = [5, 10, 15, 20, 25]        # the hall's hanging targets
HALL = 27.0                           # the covered hall runs this far down field A
HALL_H = 3.4
ARMORY = (-12.0, -24.0, -3.2)         # armory under ground behind bunker A: y from, y to, floor z
OPEN_A = [50, 75, 100]                # fixed frames past the hall
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
    "lamp": mat("Lamp glow", (1.0, .88, .55), .3),
    "lamp_shade": mat("Lamp shade", (.18, .2, .17), .5, .5),
    "barrier_red": mat("Barrier red", (.7, .06, .04), .6),
    "wire": mat("Barbed wire", (.12, .12, .12), .5, .8),
    "horn": mat("Horn grey", (.35, .37, .34), .4, .6),
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
    xs = [-200, -140, -100, -75, -60, -edge - 8, -edge, edge, edge + 8, 60, 75, 100, 140, 200] + list(range(-int(edge) + 4, int(edge), 8))
    ys = [-160, -120, -90, -70] + list(range(-60, 900, 20)) + [920, 960]
    bm = bmesh.new()
    def z(x, y):
        out = max(0, abs(x) - edge)
        h = min(1, out / 30) ** 1.5 * (6 + 10 * (hills(x, y) * .5 + .5))
        if y < -70:
            h = max(h, min(1, (-70 - y) / 50) * (4 + 4 * (hills(x, y) * .5 + .5)))
        if y > 840:
            h = max(h, min(1, (y - 840) / 60) * 14)
        return h
    # the armory (under ground behind bunker A) and its stairwell: no ground over them
    hx0, hx1, hy0, hy1 = A - 6, A + 6, ARMORY[1], -5.4
    xs = sorted(set(xs + [hx0, hx1]))
    ys = sorted(set(ys + [hy0, hy1]))
    grid = [[bm.verts.new((x, y, z(x, y))) for x in xs] for y in ys]
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            if hx0 < cx < hx1 and hy0 < cy < hy1:
                continue
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.material_index = 0
    return P.obj_from(bm, "Ground", [M["field"]], c)


def strip(name, x0, x1, y0, y1, z, material, c, step=20, sink=.25):
    """a flat strip raised `z` over the ground, its edges dipping `sink` into it (no flicker, no floating edge)"""
    bm = bmesh.new()
    prev = None
    y = y0
    while True:
        row = [bm.verts.new((x0 - sink, y, -.06)), bm.verts.new((x0, y, z)), bm.verts.new((x1, y, z)), bm.verts.new((x1 + sink, y, -.06))]
        if prev:
            for k in range(3):
                bm.faces.new((prev[k], prev[k + 1], row[k + 1], row[k]))
        prev = row
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
    # the gravel road and the square (raised a little, edges in the ground)
    strip("Ground road", -ROAD_W / 2, ROAD_W / 2, -86, 830, .06, M["road"], c)
    strip("Ground square", -8, 8, -35, -18, .07, M["road"], c, 17)
    b = col("Berms")
    # safety berms both sides of the road, outer berms, backstops
    for s in (-1, 1):
        berm(f"Berm road {s}", (s * (ROAD_W / 2 + 2.2), 8 if s > 0 else HALL + 1), (s * (ROAD_W / 2 + 2.2), 826), 2.6, 4.2, b)
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
    return c


def hall():
    """field A's covered range: the firing room (back wall + door), side walls and a roof running HALL m down the
    lanes, the far end open; earth banked against the outside walls; ceiling tracks per lane, lamps between them"""
    c = col("Hall A")
    w, t, h = FIELD_W / 2 + .6, .5, HALL_H
    y0 = -5.4
    bm = bmesh.new()
    P.cube(bm, (A - w, y0, -.1), (A + w, 0, 0))                     # firing room floor
    P.cube(bm, (A - w, y0, 0), (A - w + t, HALL, h))                 # side walls
    P.cube(bm, (A + w - t, y0, 0), (A + w, HALL, h))
    door = 1.4
    P.cube(bm, (A - w, y0, 0), (A - door / 2, y0 + t, h))            # back wall with the door to the stairs
    P.cube(bm, (A + door / 2, y0, 0), (A + w, y0 + t, h))
    P.cube(bm, (A - door / 2, y0, 2.3), (A + door / 2, y0 + t, h))
    P.cube(bm, (A - w - .3, y0 - .3, h), (A + w + .3, HALL + .4, h + .35), 1)   # roof slab
    # baffles: deep beams across under the roof every 6 m (a bullet can't leave upward)
    for y in range(6, int(HALL), 6):
        P.cube(bm, (A - w + t, y, h - .6), (A + w - t, y + .25, h), 1)
    bm.normal_update()
    for f in bm.faces:
        cx, cy, cz = f.calc_center_median()
        if abs(cx - A) < w - t + .01 and y0 + t - .01 < cy and cz < h + .01 and f.normal.z < .5:
            f.material_index = 2
    P.obj_from(bm, "Hall A", [M["concrete"], M["concrete_dark"], M["inside"]], c)
    # the lanes' floor under the roof: packed gravel (the field's grass starts past the open end)
    bm = bmesh.new()
    P.cube(bm, (A - w + t, 0, -.05), (A + w - t, HALL, .04))
    P.obj_from(bm, "Hall floor A", M["road"], c)
    # counter + booths at the firing line
    parts = [box("counter", (A - FIELD_W / 2, -.55, .98), (A + FIELD_W / 2, 0, 1.05), M["wood"], c)]
    for k in range(1, LANES):
        x = A - FIELD_W / 2 + k * LANE_W
        parts.append(box("divider", (x - .03, -1.6, 0), (x + .03, 0, 2.0), M["wood"], c))
    join("Booths A", parts)
    # tracks along each lane under the roof, a lamp between lanes every 6 m
    tracks = []
    for n in range(LANES):
        x = A - FIELD_W / 2 + (n + .5) * LANE_W
        tracks.append(box("track", (x - .05, -.3, h - .16), (x + .05, HALL - .5, h - .06), M["steel"], c))
        for y in range(3, int(HALL), 6):
            tracks.append(box("hanger", (x - .02, y, h - .06), (x + .02, y + .04, h), M["steel"], c))
    join("Rail.tracks A", tracks)
    lamps = []
    for k in range(LANES + 1):
        x = A - FIELD_W / 2 + k * LANE_W
        for y in [-3.5] + list(range(2, int(HALL), 6)):
            lamps.append(box("cord", (x - .01, y - .01, h - .6), (x + .01, y + .01, h), M["steel"], c))
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=.22, radius2=.05, depth=.18)
            bmesh.ops.translate(bm, vec=(x, y, h - .69), verts=bm.verts)
            lamps.append(P.obj_from(bm, "shade", M["lamp_shade"], c))
            lamps.append(box("bulb", (x - .06, y - .06, h - .82), (x + .06, y + .06, h - .74), M["lamp"], c))
    join("Lamps A", lamps)
    # earth banked against the outside walls, a turf mound on the roof
    b = col("Berms")
    for s in (-1, 1):
        berm(f"Berm hall {s}", (A + s * (w + 1.6), y0 + 1), (A + s * (w + 1.6), HALL), h + .3, 4.6, b, .8)
    roof = berm("Hall roof earth", (A - w, (HALL + y0) / 2), (A + w, (HALL + y0) / 2), .7, HALL - y0, c, HALL - y0 - 4)
    roof.location.z = h + .35
    return c


def armory():
    """under ground behind bunker A: stairs down from the firing room's door, a room with gun racks along the walls
    (each rack = a gun stand), lamps; a concrete roof at ground level with earth over it"""
    c = col("Armory")
    y_from, y_to, fz = ARMORY
    w, t = 6.0, .4
    y0 = -5.4
    bm = bmesh.new()
    # stairwell walls (open to the sky, a low concrete curb round it)
    for s in (-1, 1):
        P.cube(bm, (A + s * 1.0 - t / 2, y_from, fz), (A + s * 1.0 + t / 2, y0, .5))
    # the room
    P.cube(bm, (A - w, y_to, fz - .1), (A + w, y_from, fz), 0)                  # floor
    P.cube(bm, (A - w, y_to, fz), (A - w + t, y_from, 0))
    P.cube(bm, (A + w - t, y_to, fz), (A + w, y_from, 0))
    P.cube(bm, (A - w, y_to, fz), (A + w, y_to + t, 0))
    P.cube(bm, (A - w, y_from - t, fz), (A - 1.2, y_from, 0))
    P.cube(bm, (A + 1.2, y_from - t, fz), (A + w, y_from, 0))
    P.cube(bm, (A - w, y_to, 0), (A + w, y_from, .3), 1)                         # roof slab
    bm.normal_update()
    for f in bm.faces:
        cx, cy, cz = f.calc_center_median()
        if cz < 0 and abs(cx - A) < w - t + .01 and y_to + t - .01 < cy < y_from - t + .01:
            f.material_index = 2
    P.obj_from(bm, "Armory walls", [M["concrete"], M["concrete_dark"], M["inside"]], c)
    # the floor the player walks on (ground): room + stairwell landing
    bm = bmesh.new()
    P.cube(bm, (A - w + t, y_to + t, fz - .02), (A + w - t, y_from, fz))
    P.cube(bm, (A - .8, y_from, fz - .02), (A + .8, y0, fz))             # under the stairs too: the steps stand on it
    P.obj_from(bm, "Ground armory", M["concrete_dark"], c)
    # stairs: from the floor up to the door sill (steps, the exporter slices them per tread)
    bm = bmesh.new()
    n = 13
    run = (y0 - y_from) / n
    for k in range(n):
        P.cube(bm, (A - .8, y_from + k * run, fz), (A + .8, y_from + (k + 1) * run, fz + (k + 1) * (-fz / n)))
    P.obj_from(bm, "stairs armory", M["concrete"], c)
    # gun racks along the side walls: a frame with a shelf; the gun floats over it (Stand.<n>)
    k = 0
    for s in (-1, 1):
        for i in range(7):
            y = y_to + 1.2 + i * 1.5
            x = A + s * (w - t - .35)
            rack = [box("shelf", (x - .3, y - .6, fz + .8), (x + .3, y + .6, fz + .86), M["crate"], c),
                    box("back", (x + s * .25 - .03, y - .6, fz), (x + s * .25 + .03, y + .6, fz + 1.9), M["crate"], c),
                    box("leg", (x - .3, y - .6, fz), (x - .24, y - .54, fz + .8), M["crate"], c),
                    box("leg", (x + .24, y + .54, fz), (x + .3, y + .6, fz + .8), M["crate"], c)]
            k += 1
            o = join(f"Stand.{k}", rack)
    # a table in the middle, crates, lamps
    box("Armory table", (A - 1.0, y_to + 3, fz), (A + 1.0, y_to + 7, fz + .85), M["wood"], c)
    for i, y in enumerate((y_to + 2.5, y_to + 8.5)):
        lamp = [box("cord", (A - .01, y - .01, -.6), (A + .01, y + .01, 0), M["steel"], c),
                box("bulb", (A - .07, y - .07, -.72), (A + .07, y + .07, -.6), M["lamp"], c)]
        join(f"Armory lamp {i}", lamp)
    # earth over the roof
    b = col("Berms")
    roof = berm("Armory roof earth", (A - w - .5, (y_to + y_from) / 2), (A + w + .5, (y_to + y_from) / 2), .6, y_from - y_to + 1.5, c, y_from - y_to - 1)
    roof.location.z = .3
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
        # a trolley on the ceiling track, two cables down to a clip bar, the paper hangs from it
        y, h = STOPS[0], HALL_H
        cart = [box("trolley", (x - .12, y - .15, h - .3), (x + .12, y + .15, h - .16), M["olive"], c, .015),
                box("cable", (x - .29, y - .006, 1.72), (x - .27, y + .006, h - .3), M["steel"], c),
                box("cable", (x + .27, y - .006, 1.72), (x + .29, y + .006, h - .3), M["steel"], c),
                box("clip", (x - .38, y - .02, 1.68), (x + .38, y + .02, 1.74), M["steel"], c)]
        o = join(f"Carrier.L{n}", cart)
        o["stops"] = STOPS
        paper_target(f"Lane Target.L{n}", x, y, 1.0, .68, c, posts=False)
        # the buttons on the counter, left of the lane
        top = 1.05
        for name, dx, m in ((f"Button.near.L{n}", -.75, "green"), (f"Button.far.L{n}", -.55, "orange")):
            b = box(name, (A - FIELD_W / 2 + (n - 1) * LANE_W + 1.0 + dx - .06, -.35, top), (A - FIELD_W / 2 + (n - 1) * LANE_W + 1.0 + dx + .06, -.23, top + .04), M[m], c)
            b["lane"] = n
        base = box(f"Button base L{n}", (A - FIELD_W / 2 + (n - 1) * LANE_W + .12, -.4, top), (A - FIELD_W / 2 + (n - 1) * LANE_W + .62, -.18, top + .01), M["olive"], c)


def targets_a():
    """past the hall's open end: fixed frames at 50 / 75 / 100 m, staggered so they don't hide each other"""
    c = col("Targets A")
    for n in range(1, LANES + 1):
        d = OPEN_A[(n - 1) % 3]
        x = A - FIELD_W / 2 + (n - .5) * LANE_W
        paper_target(f"Target.{d}.A{n}", x, d, .9, .8 + d / 200, c)


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
    for d in OPEN_A:
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
    # tents: two rows facing each other across a camp street (doors to the street), both sides of the road;
    # the tent's door is its +y end
    for s in (-1, 1):
        for k in range(4):
            x = s * (16 + k * 5.2)
            place(tent_objs, Vector((x, -45, 0)), math.pi + rng.uniform(-.03, .03), c, f"Tent n {s} {k}")
            place(tent_objs, Vector((x, -57, 0)), rng.uniform(-.03, .03), c, f"Tent s {s} {k}")
    # sandbag walls: the camp gate on the road, round the square's corners
    walls = [o for o in (bags.objects if bags else []) if "wall" in o.name.lower()]
    if walls:
        w = centred([walls[0]])[0]
        for at, yaw in (((-5.8, -80), 0), ((5.8, -80), 0), ((-11, -33), math.pi / 2), ((11, -33), math.pi / 2)):
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


def horn(at, yaw, c, name):
    """an air raid siren: a drum with two flared horns"""
    x, y, z = at
    parts = []
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=.22, radius2=.22, depth=.35)
    bmesh.ops.translate(bm, vec=(x, y, z + .17), verts=bm.verts)
    parts.append(P.obj_from(bm, "drum", M["horn"], c))
    for s in (-1, 1):
        # a flared bell pointing out along x (narrow end at the drum)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=10, radius1=.09, radius2=.26, depth=.5)
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(s * math.pi / 2, 3, "Y"))
        bmesh.ops.translate(bm, vec=(s * .45, 0, 0), verts=bm.verts)
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(yaw, 3, "Z"))
        bmesh.ops.translate(bm, vec=(x, y, z + .17), verts=bm.verts)
        parts.append(P.obj_from(bm, "bell", M["horn"], c))
    o = join(name, parts)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def guard_tower(at, yaw, c, name, legs=6.0, siren=False):
    """four timber legs with cross braces, a cabin with half walls and a hip roof, a ladder"""
    x, y = at
    r, top = 1.4, legs
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("leg", (x + sx * r - .1, y + sy * r - .1, 0), (x + sx * r + .1, y + sy * r + .1, top + 2.4), M["wood"], c))
    for z in (top * .35, top * .7):
        for s in (-1, 1):
            parts.append(box("brace", (x - r, y + s * r - .05, z - .07), (x + r, y + s * r + .05, z + .07), M["wood"], c))
            parts.append(box("brace", (x + s * r - .05, y - r, z - .07), (x + s * r + .05, y + r, z + .07), M["wood"], c))
    parts.append(box("floor", (x - r - .3, y - r - .3, top), (x + r + .3, y + r + .3, top + .15), M["wood"], c))
    for s in (-1, 1):
        parts.append(box("wall", (x - r - .3, y + s * (r + .25) - .05, top + .15), (x + r + .3, y + s * (r + .25) + .05, top + 1.15), M["wood"], c))
        parts.append(box("wall", (x + s * (r + .25) - .05, y - r - .3, top + .15), (x + s * (r + .25) + .05, y + r + .3, top + 1.15), M["wood"], c))
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=(r + .9) * 1.41, radius2=.05, depth=1.1)
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.pi / 4, 3, "Z"))
    bmesh.ops.translate(bm, vec=(x, y, top + 2.4 + .55), verts=bm.verts)
    parts.append(P.obj_from(bm, "roof", M["canvas_dark"], c))
    # ladder on the camp side
    for s in (-1, 1):
        parts.append(box("rail", (x + s * .25 - .03, y - r - .45, 0), (x + s * .25 + .03, y - r - .39, top + .9), M["wood"], c))
    for k in range(int(top / .35)):
        z = .3 + k * .35
        parts.append(box("rung", (x - .25, y - r - .45, z), (x + .25, y - r - .39, z + .04), M["wood"], c))
    o = join(name, parts)
    o.rotation_euler.z = yaw
    if siren:
        horn((x, y, top + 2.4 + 1.1), 0, c, f"{name} siren")
    return o


def shooting_tower(c):
    """a raised firing platform at field B's side: concrete legs, sandbagged edge, a roof, stairs up the back"""
    x, y, top = B + FIELD_W / 2 + 6, -2.0, 5.0
    w, d = 3.6, 3.2
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("pier", (x + sx * (w / 2 - .25) - .25, y + sy * (d / 2 - .25) - .25, 0), (x + sx * (w / 2 - .25) + .25, y + sy * (d / 2 - .25) + .25, top), M["concrete"], c))
    parts.append(box("deck", (x - w / 2, y - d / 2, top), (x + w / 2, y + d / 2, top + .25), M["concrete"], c))
    for sx in (-1, 1):
        parts.append(box("post", (x + sx * (w / 2 - .1) - .08, y + d / 2 - .25, top + .25), (x + sx * (w / 2 - .1) + .08, y + d / 2 - .09, top + 2.6), M["wood"], c))
        parts.append(box("post", (x + sx * (w / 2 - .1) - .08, y - d / 2 + .09, top + .25), (x + sx * (w / 2 - .1) + .08, y - d / 2 + .25, top + 2.6), M["wood"], c))
    parts.append(box("roof", (x - w / 2 - .3, y - d / 2 - .3, top + 2.6), (x + w / 2 + .3, y + d / 2 + .5, top + 2.75), M["wood"], c))
    join("Shooting tower", parts)
    P.bag_wall("Sandbag tower front", c, w - .2, 4, Vector((x, y + d / 2 - .2, top + .25)))
    for s in (-1, 1):
        P.bag_wall(f"Sandbag tower side {s}", c, d - .6, 3, Vector((x + s * (w / 2 - .2), y, top + .25)), yaw=math.pi / 2)
    # stairs up from behind (steps): along -y
    bm = bmesh.new()
    n = 20
    run = .3
    for k in range(n):
        y1 = y - d / 2 - (n - k) * run
        P.cube(bm, (x - .6, y1, 0), (x + .6, y1 + run, (k + 1) * top / n + .25 * (k + 1) / n))
    P.obj_from(bm, "stairs tower", M["concrete"], c)
    sc = [box("leg", (x - .04, y + .6, top + .25), (x + .04, y + .68, top + 1.35), M["steel"], c),
          box("head", (x - .06, y + .52, top + 1.35), (x + .06, y + .76, top + 1.42), M["steel"], c)]
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.05, radius2=.065, depth=.6)
    tube = P.obj_from(bm, "tube", M["olive"], c)
    tube.rotation_euler = (math.pi / 2, 0, 0)
    tube.location = (x, y + .7, top + 1.5)
    sc.append(tube)
    o = join("Scope.fixed.3", sc)
    o["eye"] = [x, y + .36, top + 1.5]
    o["zoom"] = 30


def towers():
    c = col("Towers")
    shooting_tower(c)
    for k, (x, y) in enumerate(((-46, -88), (46, -88), (-46, -8), (46, -8))):
        guard_tower((x, y), math.pi / 4 * (1 if x > 0 else -1), c, f"Guard tower {k}", siren=k in (0, 3))
    # sirens on poles: the square and the end of the hall
    for k, (x, y) in enumerate(((7, -36), (A + FIELD_W / 2 + 2.5, HALL + 2))):
        box(f"Siren pole {k}", (x - .08, y - .08, 0), (x + .08, y + .08, 6), M["wood"], c)
        horn((x, y, 6), 0, c, f"Siren {k}")


def fences():
    """barbed wire round the camp (posts every 3 m, three strands, a coil along the bottom), a gate with a striped
    barrier where the road comes in, a low rail fence round the flag square"""
    c = col("Fences")
    x0, x1, y0, y1 = -48.0, 48.0, -90.0, -6.0
    gate = 4.0
    runs = [((x0, y0), (-gate, y0)), ((gate, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x0, y0), (x0, y1))]
    for i, (a, b) in enumerate(runs):
        a, b = Vector(a), Vector(b)
        n = max(1, int((b - a).length / 3))
        parts = []
        for k in range(n + 1):
            p = a.lerp(b, k / n)
            parts.append(box("post", (p.x - .06, p.y - .06, 0), (p.x + .06, p.y + .06, 1.6), M["wood"], c))
        horiz = abs(b.x - a.x) > abs(b.y - a.y)
        for z in (.45, .9, 1.4):
            lo, hi = (min(a.x, b.x), min(a.y, b.y)), (max(a.x, b.x), max(a.y, b.y))
            parts.append(box("wire", (lo[0] - (0 if horiz else .01), lo[1] - (.01 if horiz else 0), z), (hi[0] + (0 if horiz else .01), hi[1] + (.01 if horiz else 0), z + .02), M["wire"], c))
        # a coil: zigzag loops low along it
        m = int((b - a).length / .5)
        for k in range(m):
            p = a.lerp(b, (k + .5) / m)
            off = .18 if k % 2 else -.18
            q = p + (Vector((0, off)) if horiz else Vector((off, 0)))
            parts.append(box("coil", (q.x - .02, q.y - .02, .05 + (k % 3) * .08), (q.x + .02, q.y + .02, .4 + (k % 3) * .08), M["wire"], c))
        join(f"Fence wire {i}", parts)
    # the gate: two posts, a red / white striped pole
    gp = [box("gate post", (-gate - .15, y0 - .15, 0), (-gate + .15, y0 + .15, 1.2), M["concrete"], c),
          box("gate post", (gate - .15, y0 - .15, 0), (gate + .15, y0 + .15, 1.0), M["concrete"], c)]
    for k in range(8):
        xa = -gate + k * (2 * gate / 8)
        gp.append(box("bar", (xa, y0 - .05, 1.0), (xa + 2 * gate / 8, y0 + .05, 1.1), M["barrier_red" if k % 2 == 0 else "white"], c))
    join("Gate barrier", gp)
    # rail fence round the flag square
    rf = []
    for (a, b) in (((-8, -35), (8, -35)), ((-8, -18), (-2.5, -18)), ((2.5, -18), (8, -18)), ((-8, -35), (-8, -18)), ((8, -35), (8, -18))):
        a, b = Vector(a), Vector(b)
        n = max(1, int((b - a).length / 2.5))
        for k in range(n + 1):
            p = a.lerp(b, k / n)
            rf.append(box("post", (p.x - .05, p.y - .05, 0), (p.x + .05, p.y + .05, .7), M["white"], c))
        lo, hi = (min(a.x, b.x), min(a.y, b.y)), (max(a.x, b.x), max(a.y, b.y))
        rf.append(box("rail", (lo[0] - .03, lo[1] - .03, .55), (hi[0] + .03, hi[1] + .03, .6), M["white"], c))
    join("Fence square", rf)


OUR_NATURE = os.path.expanduser("~/Developer/games/polywar/assets/models/nature")
TREES = ["CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4", "PineTree_1", "PineTree_2", "PineTree_3", "BirchTree_1", "BirchTree_2"]
BUSHES = ["Bush_1", "Bush_2"]


def trees():
    """our own low poly trees and bushes (assets/models/nature, the lighter lod2), round the fields and the camp"""
    c = col("Nature")
    protos = {}
    for name in TREES + BUSHES:
        path = os.path.join(OUR_NATURE, f"{name}.lod2.glb")
        if not os.path.exists(path):
            path = os.path.join(OUR_NATURE, f"{name}.glb")
        if not os.path.exists(path):
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.type != "MESH":
                for ch in o.children:
                    mw = ch.matrix_world.copy(); ch.parent = None; ch.matrix_world = mw
        for o in [o for o in new if o.type != "MESH"]:
            bpy.data.objects.remove(o)
        meshes = [o for o in new if o.name in bpy.data.objects]
        if not meshes:
            continue
        protos[name] = join(f"proto {name}", meshes) if len(meshes) > 1 else meshes[0]
        protos[name].matrix_world = Matrix.Identity(4)
    trees_ = [protos[n] for n in TREES if n in protos]
    bushes = [protos[n] for n in BUSHES if n in protos]
    edge = GAP + FIELD_W + 7
    def put(src, name, x, y, sc):
        o = bpy.data.objects.new(name, src.data)
        o.location = (x, y, 0)
        o.rotation_euler.z = rng.uniform(0, 6.3)
        o.scale = [sc] * 3
        c.objects.link(o)
    for k in range(170):
        x = rng.choice((-1, 1)) * rng.uniform(edge, edge + 70)
        put(rng.choice(trees_), f"Tree.{k}", x, rng.uniform(-140, 900), rng.uniform(.9, 1.5))
    for k in range(40):
        x = rng.choice((-1, 1)) * rng.uniform(edge - 2, edge + 20)
        put(rng.choice(bushes), f"Tree.bush{k}", x, rng.uniform(-80, 850), rng.uniform(.8, 1.3))
    # inside the wire: a few trees between tents and along the fence
    for k in range(14):
        x = rng.choice((-1, 1)) * rng.uniform(36, 45)
        put(rng.choice(trees_), f"Tree.c{k}", x, rng.uniform(-86, -12), rng.uniform(.8, 1.2))
    for p in protos.values():
        bpy.data.objects.remove(p)


def grass_zones():
    """where the grass package grows what (exported as rectangles, not drawn): tall on the fields and round the
    bunkers, short where people walk (camp streets, round the square), none under tents / buildings / roads"""
    c = col("Grass zones")
    def zone(kind, x0, y0, x1, y1, k):
        o = box(f"Grass.{kind}.{k}", (min(x0, x1), min(y0, y1), .1), (max(x0, x1), max(y0, y1), .11), M["turf"], c)
        o.hide_render = True
        o["grass"] = kind
    k = 0
    # tall: field A past the hall, field B, a band round the bunkers, outside the tent rows
    for args in ((A - FIELD_W / 2, HALL + 1, A + FIELD_W / 2, 112), (B - FIELD_W / 2, 3, B + FIELD_W / 2, 830),
                 (A - FIELD_W / 2 - 6, -8, A - FIELD_W / 2 - 1, HALL), (A + FIELD_W / 2 + 1, -8, A + FIELD_W / 2 + 4, HALL),
                 (B - FIELD_W / 2 - 4, -8, B + FIELD_W / 2 + 4, -5)):
        zone("tall", *args, k); k += 1
    for s in (-1, 1):
        zone("tall", s * 13, -70, s * 40, -61, k); k += 1     # behind the south row
        zone("tall", s * 13, -41, s * 40, -37, k); k += 1     # behind the north row
        zone("short", s * 13, -52, s * 40, -50, k); k += 1    # the camp street between the rows
        zone("short", s * 4, -36, s * 12, -14, k); k += 1     # round the square
    # none: tents, the hall, bunker B, the armory, road, square
    for s in (-1, 1):
        for row in (-45, -57):
            for i in range(4):
                x = s * (16 + i * 5.2)
                zone("none", x - 2.2, row - 3.2, x + 2.2, row + 3.2, k); k += 1
    for args in ((A - FIELD_W / 2 - 1, -6, A + FIELD_W / 2 + 1, HALL), (B - FIELD_W / 2 - 1, -6, B + FIELD_W / 2 + 1, 1),
                 (A - 6.5, ARMORY[1] - .5, A + 6.5, -5), (-ROAD_W / 2 - .3, -90, ROAD_W / 2 + .3, 830), (-8, -35, 8, -18)):
        zone("none", *args, k); k += 1


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
    hall()
    armory()
    firing_point(B, "B")
    lanes_a()
    targets_a()
    targets_b()
    markers()
    camp()
    vehicles()
    crates()
    scopes_and_glasses()
    towers()
    fences()
    trees()
    grass_zones()
    # where the player starts: in the hall's firing room, behind the middle lane
    sp = bpy.data.objects.new("Spawn", None)
    sp.location = (A, -2.6, 0)
    bpy.context.scene.collection.objects.link(sp)
    ground_heights()
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    print("saved", OUT)
