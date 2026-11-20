"""Training camp upgrade for the owner's camp.blend: barracks, command tent, new bunker, watch towers, a training yard,
a vehicle park and an airfield (runway, hangar, planes). Simple blocks: the owner refines them by hand.

  blender -b --disable-autoexec ~/Developer/3d/shooting-range/camp.blend -P tools/blender/packs/camp-upgrade.py

Saves camp.blend. Re-runnable: everything lives in the collection "Upgrade" (rebuilt each run); the plateaus under the
new areas are flattened (fixed heights), trees there are removed and nearby ones re-dropped onto the ground.
camp-props.blend pieces (tents, towers, bunker, fence) are linked, so the owner's edits there come through.
Blender z up; the range runs down +y, the camp sits in the valley at y -6..-90.
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../.."))
VEH = os.path.join(ROOT, "assets/models/vehicles")
PROPS = bpy.path.abspath("//camp-props.blend")
rng = random.Random(7)
scene = bpy.context.scene

# ---------------------------------------------------------------- reset
old = bpy.data.collections.get("Upgrade")
if old:
    for o in list(old.all_objects):
        bpy.data.objects.remove(o)
    for c in list(old.children_recursive):
        bpy.data.collections.remove(c)
    bpy.data.collections.remove(old)
UP = bpy.data.collections.new("Upgrade")
scene.collection.children.link(UP)


def sub(name):
    c = bpy.data.collections.new(name)
    UP.children.link(c)
    return c


def mat(name, rgb, rough=.9, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


M = {
    "asphalt": mat("Runway asphalt", (.13, .13, .13), 1),
    "paint": mat("Runway paint", (.85, .85, .80), 1),
    "apron": mat("Concrete apron", (.36, .35, .32), .95),
    "plank": mat("Barracks wood", (.36, .27, .17)),
    "roof": mat("Barracks roof", (.20, .22, .17)),
    "hangar": mat("Hangar metal", (.30, .33, .29), .6, .4),
    "hangar_dark": mat("Hangar inside", (.12, .12, .11), 1),
    "wood": mat("Training wood", (.40, .29, .16)),
    "log": mat("Training log", (.30, .21, .12)),
    "rope": mat("Training rope", (.62, .55, .40)),
    "tyre": mat("Tyre rubber", (.06, .06, .06), .8),
    "steel": mat("Training steel", (.18, .19, .18), .5, .6),
    "sock": mat("Windsock orange", (.90, .40, .10)),
    "white": mat("Windsock white", (.90, .90, .88)),
    "mud": mat("Training mud", (.25, .19, .12), 1),
}

# ---------------------------------------------------------------- ground: flatten the plateaus under the new areas
G = bpy.data.objects["Ground"]
EAST_Z, WEST_Z = 11.0, 10.5


def ground_z(x, y, objs=None):
    best = None
    for o in objs or [G]:
        inv = o.matrix_world.inverted()
        ok, p, n, i = o.ray_cast(inv @ Vector((x, y, 200)), (inv.to_3x3() @ Vector((0, 0, -1))).normalized())
        if ok:
            z = (o.matrix_world @ p).z
            best = z if best is None else max(best, z)
    return best if best is not None else 0.0


nature = [o for o in bpy.data.collections["Nature"].all_objects if o.parent is None]
before = {o.name: ground_z(o.location.x, o.location.y) for o in nature}
for v in G.data.vertices:
    w = G.matrix_world @ v.co
    if w.x >= 74 and w.y <= 300:
        w.z = EAST_Z
    elif w.x <= -74 and w.y <= 20:
        w.z = WEST_Z
    else:
        continue
    v.co = G.matrix_world.inverted() @ w
G.data.update()

# areas kept free of trees: (xmin, ymin, xmax, ymax)
CLEAR = [(70, -160, 200, 290), (-170, -150, -70, 10)]
for o in nature:
    x, y = o.location.x, o.location.y
    if any(a <= x <= c and b <= y <= d for a, b, c, d in CLEAR):
        bpy.data.objects.remove(o)
        continue
    o.location.z += ground_z(x, y) - before[o.name]

# ---------------------------------------------------------------- helpers
def obj(name, bm, material, col, mats=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats or [material]:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    return o


def cube(bm, centre, size, mi=0, rot=0.0):
    r = bmesh.ops.create_cube(bm, size=1)
    vs = r["verts"]
    bmesh.ops.scale(bm, vec=size, verts=vs)
    if rot:
        bmesh.ops.rotate(bm, verts=vs, matrix=Matrix.Rotation(rot, 3, "Z"))
    bmesh.ops.translate(bm, vec=Vector(centre), verts=vs)
    for f in {f for v in vs for f in v.link_faces}:
        f.material_index = mi


def cyl(bm, a, b, radius, seg=6, mi=0):
    """a cylinder from point a to b"""
    a, b = Vector(a), Vector(b)
    d = b - a
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=radius, radius2=radius, depth=d.length)
    vs = r["verts"]
    rot = d.normalized().to_track_quat("Z", "Y").to_matrix()
    bmesh.ops.rotate(bm, verts=vs, matrix=rot)
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=vs)
    for f in {f for v in vs for f in v.link_faces}:
        f.material_index = mi


def place(o, x, y, z=None, yaw=0.0, sink=.05, foot=2.0):
    """origin at (x, y) on the ground (lowest of the footprint corners, a bit sunk)"""
    if z is None:
        z = min(ground_z(x + dx, y + dy) for dx in (-foot, 0, foot) for dy in (-foot, 0, foot)) - sink
    o.location = (x, y, z)
    o.rotation_euler.z = yaw
    return o


# ---------------------------------------------------------------- linked camp-props pieces
LINK = ["Tent", "BigTent", "WatchTower_01", "WatchTower_02", "WatchTower_03", "WatchTower_04", "bunker", "bunker_earth",
        "Crate", "Barrel", "table", "siren", "fence.metal_barbed_close_L", "fence.metal_barbed_closed",
        "fence.metal_barbed_close_R"]
with bpy.data.libraries.load(PROPS, link=True) as (src, dst):
    dst.objects = [n for n in LINK if n in src.objects]
LIB = {o.name: o for o in dst.objects}


def linked(src, name, col, x, y, yaw=0.0, foot=None):
    s = LIB[src]
    o = bpy.data.objects.new(name, s.data)
    o.scale = s.scale
    o.rotation_euler = s.rotation_euler
    col.objects.link(o)
    half = foot if foot is not None else max(s.dimensions.x, s.dimensions.y) / 2 * .7
    place(o, x, y, yaw=s.rotation_euler.z + yaw, foot=half)
    # the prop's origin may sit off its base: keep the base on the ground
    o.location.z -= min((s.matrix_world @ Vector(b)).z for b in s.bound_box) - s.location.z
    return o


# ---------------------------------------------------------------- vehicles (static decor, linked from camp-vehicles.blend)
with bpy.data.libraries.load(bpy.path.abspath("//camp-vehicles.blend"), link=True) as (src, dst):
    dst.meshes = [n for n in src.meshes if n.startswith("vehicle ")]
VMESH = {m.name[len("vehicle "):]: m for m in dst.meshes}


def park(kind, name, col, x, y, yaw=0.0, z=None):
    o = bpy.data.objects.new(name, VMESH[kind])
    col.objects.link(o)
    return place(o, x, y, z=z, yaw=yaw, sink=.02, foot=2)


# ---------------------------------------------------------------- fence runs (linked barbed pieces, 2 m each)
def fence(col, x0, y0, x1, y1, gaps=()):
    """a straight run from (x0, y0) to (x1, y1); gaps = [(from, to)] metres along the run left open"""
    d = Vector((x1 - x0, y1 - y0))
    n = int(round(d.length / 2))
    d.normalize()
    yaw = math.atan2(d.y, d.x)
    for i in range(n):
        s = i * 2
        if any(a <= s + 1 <= b for a, b in gaps):
            continue
        last = i == n - 1 or any(a <= s + 3 <= b for a, b in gaps)
        p = Vector((x0, y0)) + d * s
        o = bpy.data.objects.new(f"Fence barbed up.{len(col.objects):03d}",
                                 LIB["fence.metal_barbed_closed" if last else "fence.metal_barbed_close_L"].data)
        col.objects.link(o)
        q = p + d * 2
        o.location = (p.x, p.y, min(ground_z(p.x, p.y), ground_z(q.x, q.y)) - .05)
        o.rotation_euler.z = yaw


# ================================================================ inside the camp
camp = sub("Camp up")

# barracks: long wooden huts with a pitched roof, door to the camp
def barracks(name, x, y, w=7.0, l=16.0, h=2.8):
    bm = bmesh.new()
    cube(bm, (0, 0, h / 2), (w, l, h), 0)
    cube(bm, (0, 0, .25), (w + .4, l + .4, .5), 0)  # plinth
    # roof: two slopes as thin slabs
    for side in (-1, 1):
        r = bmesh.ops.create_cube(bm, size=1)
        vs = r["verts"]
        bmesh.ops.scale(bm, vec=(w / 2 * 1.2, l + .8, .15), verts=vs)
        bmesh.ops.rotate(bm, verts=vs, matrix=Matrix.Rotation(-side * .45, 3, "Y"))
        bmesh.ops.translate(bm, vec=(side * w / 4 * 1.05, 0, h + .75), verts=vs)
        for f in {f for v in vs for f in v.link_faces}:
            f.material_index = 1
    cube(bm, (w / 2 + .02, 0, 1.0), (.05, 1.1, 2.0), 2)  # door
    for k in (-1, 1):
        for j in (-5, 5):
            cube(bm, (w / 2 + .02, j * l / 16 * k, 1.6), (.05, 1.2, .8), 2)  # windows
    o = obj(name, bm, M["plank"], camp, [M["plank"], M["roof"], M["hangar_dark"]])
    return o

for i, x in enumerate((-42, -33, -24)):
    place(barracks(f"Barracks {i}", 0, 0), x, -77, yaw=0, foot=3)
for i, x in enumerate((24, 33, 42)):
    place(barracks(f"Barracks {i + 3}", 0, 0), x, -77, yaw=math.pi, foot=3)
place(barracks("Mess hall", 0, 0, w=8, l=16, h=3.2), -12, -77, yaw=0, foot=3)
linked("BigTent", "Tent command", camp, 12, -77, yaw=math.pi / 2)
# improved bunker (east, slit to the range)
linked("bunker", "Bunker C", camp, 34, -27, foot=3)
linked("bunker_earth", "Bunker earth bank C", camp, 34, -27, foot=3)
# watch towers at the camp's back corners and the gate
linked("WatchTower_01", "Watch tower camp 0", camp, -44, -86)
linked("WatchTower_02", "Watch tower camp 1", camp, 44, -86)
linked("WatchTower_03", "Watch tower gate", camp, 9, -96)

# ================================================================ west: vehicle park + training yard (fenced)
west = sub("West compound")
WX0, WX1, WY0, WY1 = -152, -80, -132, -8
fence(west, WX1, WY0, WX1, WY1, gaps=[(78, 86)])  # east side, gate towards the camp
fence(west, WX1, WY1, WX0, WY1)
fence(west, WX0, WY1, WX0, WY0)
fence(west, WX0, WY0, WX1, WY0)
linked("WatchTower_04", "Watch tower west 0", west, -148, -12)
linked("WatchTower_02", "Watch tower west 1", west, -84, -128)

# vehicle park: concrete pad, tanks in a row, trucks, bikes, artillery facing the range
pad = bmesh.new()
cube(pad, (0, 0, 0), (60, 34, .1), 0)
place(obj("Ground vehicle park", pad, M["apron"], west), -116, -30, z=WEST_Z + .02)
for i, (f, n) in enumerate([("tank 1", "Tank 0"), ("tank 2", "Tank 1"), ("tank 3", "Tank 2"),
                            ("tank 4", "Tank 3"), ("tank ww2", "Tank 4")]):
    park(f, n, west, -140 + i * 11, -20, yaw=math.pi / 2, z=WEST_Z + .07)
park("truck", "Truck 0", west, -140, -36, yaw=math.pi / 2, z=WEST_Z + .07)
park("truck", "Truck 1", west, -132, -36, yaw=math.pi / 2, z=WEST_Z + .07)
for i in range(3):
    park("motorbike", f"Motorbike {i}", west, -122 + i * 2.2, -37, yaw=math.pi / 2, z=WEST_Z + .07)
for i in range(3):
    park("artillery", f"Artillery {i}", west, -108 + i * 8, -40, yaw=0, z=WEST_Z + .07)

# training yard
yard = sub("Training yard")
YZ = WEST_Z
mud = bmesh.new()
cube(mud, (0, 0, 0), (56, 66, .06), 0)
place(obj("Ground training yard", mud, M["mud"], yard), -116, -92, z=YZ + .01)

# climbing walls (with A-frame braces)
for i in range(2):
    bm = bmesh.new()
    cube(bm, (0, 0, 1.6), (4.0, .25, 3.2), 0)
    for sx in (-1.8, 1.8):
        cyl(bm, (sx, -.1, 3.1), (sx, -1.6, 0), .08, mi=1)
        cyl(bm, (sx, .1, 3.1), (sx, 1.6, 0), .08, mi=1)
    cube(bm, (0, -1.2, .6), (3.6, .2, .1), 1)  # step plank
    place(obj(f"Climbing wall {i}", bm, M["wood"], yard, [M["wood"], M["log"]]), -136 + i * 8, -70, z=YZ)

# monkey bars (hanging)
bm = bmesh.new()
L = 10
for sx in (-.5, .5):
    for y in (0, L):
        cyl(bm, (sx, y, 0), (sx, y, 2.5), .08, mi=1)
    cyl(bm, (sx, 0, 2.4), (sx, L, 2.4), .05)
for k in range(1, int(L / .5)):
    cyl(bm, (-.5, k * .5, 2.45), (.5, k * .5, 2.45), .025)
place(obj("Monkey bars", bm, M["steel"], yard, [M["steel"], M["log"]]), -116, -80, z=YZ)

# balance logs: zig-zag on short posts
bm = bmesh.new()
pts = [(0, 0), (2, 5), (0, 10), (2, 15), (0, 20)]
for (ax, ay), (bx, by) in zip(pts, pts[1:]):
    cyl(bm, (ax, ay, .55), (bx, by, .55), .14, seg=7)
for ax, ay in pts:
    cyl(bm, (ax, ay, 0), (ax, ay, .5), .12, seg=6)
place(obj("Balance logs", bm, M["log"], yard), -104, -80, z=YZ)

# crawl under barbed wire: low posts, wire lines
bm = bmesh.new()
for x in range(0, 13, 3):
    for y in range(0, 4, 3):
        cyl(bm, (x, y, 0), (x, y, .6), .04)
for y in (0, 1.5, 3):
    cyl(bm, (0, y, .55), (12, y, .55), .012, seg=4)
for x in range(0, 13, 3):
    cyl(bm, (x, 0, .55), (x, 3, .55), .012, seg=4)
place(obj("Crawl wire", bm, M["steel"], yard), -140, -98, z=YZ)

# tyre run: two rows of flat tyres
bm = bmesh.new()
for r in range(2):
    for k in range(8):
        t = bmesh.ops.create_circle(bm, segments=8, radius=.38)
        res = bmesh.ops.extrude_edge_only(bm, edges=[e for e in bm.edges if e.verts[0] in t["verts"]])
        bmesh.ops.scale(bm, vec=(.55, .55, 1), verts=[v for v in res["geom"] if isinstance(v, bmesh.types.BMVert)])
        allv = t["verts"] + [v for v in res["geom"] if isinstance(v, bmesh.types.BMVert)]
        ext = bmesh.ops.extrude_face_region(bm, geom=[f for f in {f for v in allv for f in v.link_faces}])
        bmesh.ops.translate(bm, vec=(0, 0, .2), verts=[v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)])
        bmesh.ops.translate(bm, vec=(r * .9 + (k % 2) * .45, k * .9, 0),
                            verts=list({v for v in allv} | {v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)}))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
place(obj("Tyre run", bm, M["tyre"], yard), -122, -100, z=YZ)

# rope tower: 4 posts, a deck at 4 m, ropes hanging down
bm = bmesh.new()
for sx in (-1.5, 1.5):
    for sy in (-1.5, 1.5):
        cyl(bm, (sx, sy, 0), (sx, sy, 5.0), .12, mi=1)
cube(bm, (0, 0, 4.0), (3.4, 3.4, .15), 0)
for sx in (-1.6, 1.6):
    cube(bm, (sx, 0, 4.6), (.08, 3.4, .1), 0)  # rail
for k, (sx, sy) in enumerate([(-.6, -1.9), (.6, -1.9), (-1.9, .5)]):
    cyl(bm, (sx, sy, .2), (sx, sy, 4.1), .03, seg=4, mi=2)
cube(bm, (0, 1.9 + 1.5, 2.0), (.8, .1, 4.3), 0, rot=0)  # ladder board (simple)
place(obj("Rope tower", bm, M["wood"], yard, [M["wood"], M["log"], M["rope"]]), -100, -110, z=YZ)

# hurdles
bm = bmesh.new()
for k in range(5):
    for sx in (-1, 1):
        cyl(bm, (sx, k * 3, 0), (sx, k * 3, .9), .05)
    cube(bm, (0, k * 3, .8), (2.1, .08, .15), 0)
place(obj("Hurdles", bm, M["wood"], yard), -142, -125 + 0, z=YZ)

# ================================================================ east: airfield
air = sub("Airfield")
AZ = EAST_Z
RX, RY0, RY1, RW = 140, -140, 260, 24
bm = bmesh.new()
cube(bm, (0, 0, 0), (RW, RY1 - RY0, .1), 0)
for y in range(int(RY0) + 20, int(RY1) - 20, 20):  # centre line dashes
    cube(bm, (0, y - (RY0 + RY1) / 2, .06), (.5, 10, .04), 1)
for end in (-1, 1):  # threshold bars
    for k in range(-4, 5):
        if k:
            cube(bm, (k * 2.4, end * ((RY1 - RY0) / 2 - 8), .06), (1.2, 12, .04), 1)
place(obj("Ground runway", bm, M["asphalt"], air, [M["asphalt"], M["paint"]]), RX, (RY0 + RY1) / 2, z=AZ + .03)

# apron between hangar and runway
bm = bmesh.new()
cube(bm, (0, 0, 0), (12, 70, .1), 0)
place(obj("Ground apron", bm, M["apron"], air), 122, 20, z=AZ + .02)

# hangar: stepped arch (low poly), open towards the runway (+x)
def hangar(name, span=36.0, deep=32.0, high=12.0, steps=6):
    bm = bmesh.new()
    t = .4
    for k in range(steps * 2 + 1):  # roof slabs around a half circle
        a0 = math.pi * k / (steps * 2 + 1)
        a1 = math.pi * (k + 1) / (steps * 2 + 1)
        p0 = Vector((0, math.cos(a0) * span / 2, math.sin(a0) * high))
        p1 = Vector((0, math.cos(a1) * span / 2, math.sin(a1) * high))
        mid = (p0 + p1) / 2
        r = bmesh.ops.create_cube(bm, size=1)
        vs = r["verts"]
        bmesh.ops.scale(bm, vec=(deep, (p1 - p0).length + .05, t), verts=vs)
        bmesh.ops.rotate(bm, verts=vs, matrix=Matrix.Rotation(math.atan2(p1.z - p0.z, p1.y - p0.y), 3, "X"))
        bmesh.ops.translate(bm, vec=mid, verts=vs)
    # back wall
    cube(bm, (-deep / 2, 0, high / 2), (t, span, high), 0)
    # door frame posts and half open doors
    for side in (-1, 1):
        cube(bm, (deep / 2, side * (span / 2 - 4), 3.5), (.4, 8, 7), 1)
    cube(bm, (0, 0, .05), (deep, span, .1), 2)  # concrete floor
    return obj(name, bm, M["hangar"], air, [M["hangar"], M["hangar_dark"], M["apron"]])

place(hangar("Hangar"), 98, 20, z=AZ)
park("bomber", "Bomber", air, 98, 20, yaw=0, z=AZ + .12)
for i, y in enumerate((-6, 50)):
    park("fighter", f"Fighter {i}", air, 121, y, yaw=0, z=AZ + .12)
park("fighter", "Fighter 2", air, 108, -18, yaw=math.pi / 6, z=AZ)

# windsock
bm = bmesh.new()
cyl(bm, (0, 0, 0), (0, 0, 6), .06, mi=1)
for k in range(4):
    r = bmesh.ops.create_cone(bm, cap_ends=False, segments=8, radius1=.45 - k * .07, radius2=.38 - k * .07, depth=.9)
    bmesh.ops.rotate(bm, verts=r["verts"], matrix=Matrix.Rotation(math.pi / 2, 3, "Y"))
    bmesh.ops.translate(bm, vec=(.45 + k * .9, 0, 5.8 - k * .12), verts=r["verts"])
    for f in {f for v in r["verts"] for f in v.link_faces}:
        f.material_index = k % 2 * 2
place(obj("Windsock", bm, M["sock"], air, [M["sock"], M["steel"], M["white"]]), 160, 40, z=AZ)
linked("WatchTower_03", "Watch tower airfield", air, 112, 70)
for i in range(6):
    linked("Barrel", f"Barrel fuel {i}", air, 114 + (i % 3) * .7, -24 + (i // 3) * .7)
for i in range(4):
    linked("Crate", f"Crate air {i}", air, 112 + i * .9, 62, yaw=rng.uniform(-.3, .3))

print("upgrade:", len(UP.all_objects), "objects")
bpy.ops.wm.save_mainfile()
