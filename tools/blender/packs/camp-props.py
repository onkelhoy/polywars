"""Military camp props, modelled in code: sandbag (+ wall), bunker, ridge tent, flag pole (papit flag) on a stone ring.

  blender -b --factory-startup -P tools/blender/packs/camp-props.py -- [out.blend] [--force]
The owner edits the result by hand: it is never overwritten without --force. The functions are reused by camp-layout.py.

Writes ~/Developer/3d/shooting-range/camp-props.blend (one collection per prop, side by side) for the owner to look at.
Low poly, flat shaded, flat colours. Blender z up, y forward (the bunker's slit faces +y).
"""
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix

OUT = os.path.expanduser("~/Developer/3d/shooting-range/camp-props.blend")
LOGO = os.path.expanduser("~/Developer/projects/papit/asset/logo-square.svg")
rng = random.Random(3)


def mat(name, rgb, rough=.85, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


M = {
    "sack": mat("Sandbag", (.42, .33, .18)),
    "sack2": mat("Sandbag dark", (.34, .27, .15)),
    "concrete": mat("Concrete", (.33, .32, .29), .95),
    "concrete_dark": mat("Concrete dark", (.24, .23, .21), .95),
    "inside": mat("Bunker inside", (.08, .08, .07), 1),
    "earth": mat("Earth", (.27, .21, .13), 1),
    "turf": mat("Turf", (.21, .29, .11), 1),
    "canvas": mat("Canvas", (.29, .30, .17), .9),
    "canvas_dark": mat("Canvas shade", (.20, .21, .12), .9),
    "rope": mat("Rope", (.55, .50, .38), .9),
    "wood": mat("Wood", (.33, .22, .12), .9),
    "pole": mat("Flag pole", (.85, .85, .82), .4),
    "brass": mat("Brass", (.75, .58, .2), .3, .9),
    "flag": mat("papit orange", (.937, .647, .153), .8),  # #efa527
    "flag_text": mat("papit brown", (.302, .102, .082), .8),  # #4d1a15
    "stone": mat("Stone", (.48, .47, .44), .95),
    "gravel": mat("Gravel", (.45, .42, .36), 1),
    "steel": mat("Steel", (.15, .16, .15), .5, .6),
}


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def obj_from(bm, name, material, col, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    if isinstance(material, list):
        for m in material:
            me.materials.append(m)
    else:
        me.materials.append(material)
    col.objects.link(o)
    return o


def cube(bm, lo, hi, index=0):
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r["verts"]:
        v.co = Vector(((lo[i] + hi[i]) / 2 + v.co[i] * (hi[i] - lo[i]) for i in range(3)))
    for f in {f for v in r["verts"] for f in v.link_faces}:
        f.material_index = index
    return r["verts"]


# ---------------- sandbag

def sack_bm(length=.56, width=.30, height=.15, seed=0):
    """a filled sack: a subdivided box, puffed in the middle, pinched and tied at the ends, settled flat at the bottom"""
    r = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.x * 2, v.co.y * 2, v.co.z * 2          # -1..1
        end = abs(x) ** 2.2                                   # 0 middle .. 1 at the ends
        pinch = 1 - .38 * end                                 # ends narrower
        puff = 1 - .25 * (abs(y) ** 2) * (1 - end)            # rounded sides
        vz = z * (1 - .45 * end)                              # ends lower
        # sits on its bottom: the lower half flat-ish
        if z < 0:
            vz = -1 + (vz + 1) * .5
        v.co = Vector((x * length / 2 * (1 - .06 * abs(y)),
                       y * width / 2 * pinch * puff,
                       (vz + 1) / 2 * height * (1 - .2 * (abs(y) ** 2))))
        v.co += Vector((r.uniform(-.008, .008), r.uniform(-.008, .008), r.uniform(-.006, .006)))
    return bm


def sack(name, col, seed=0, dark=False):
    return obj_from(sack_bm(seed=seed), name, M["sack2" if dark else "sack"], col)


def bag_wall(name, col, length, rows, at=Vector((0, 0, 0)), yaw=0.0, bag=.52, row_h=.125, inset=.015, double=False):
    """a running-bond wall of sacks (each row half a bag over), the rows stepping in a little, two deep if `double`"""
    bm_all = bmesh.new()
    rot = Matrix.Rotation(yaw, 4, "Z")
    n = max(1, round(length / bag))
    k = 0
    for r in range(rows):
        shift = (r % 2) * bag / 2
        count = n - (r % 2)
        for depth in ((-.16, .16) if double else (0,)):
            for i in range(count):
                k += 1
                b = sack_bm(seed=k * 31 + r)
                tilt = Matrix.Rotation(rng.uniform(-.04, .04), 4, "X") @ Matrix.Rotation(rng.uniform(-.05, .05), 4, "Z")
                x = -length / 2 + shift + bag * (i + .5)
                m = Matrix.Translation((x, depth + r * inset * (1 if depth >= 0 else -1) * -1, r * row_h)) @ tilt
                bmesh.ops.transform(b, matrix=rot @ m, verts=b.verts)
                bmesh.ops.translate(b, vec=at, verts=b.verts)
                me = bpy.data.meshes.new("t")
                b.to_mesh(me)
                b.free()
                bm_all.from_mesh(me)
                for f in bm_all.faces[-len(me.polygons):]:
                    f.material_index = 1 if (k * 7) % 5 == 0 else 0
                bpy.data.meshes.remove(me)
    return obj_from(bm_all, name, [M["sack"], M["sack2"]], col)


# ---------------- bunker

def bunker(col, at=Vector((0, 0, 0)), width=14.0, depth=7.0, height=3.0, lanes=0):
    """concrete firing bunker: thick walls, a long slit at shoulder height facing +y, an overhanging roof slab with an
    earth + turf mound, sandbags along the slit and the roof edge, an entrance at the back (−y), dark inside"""
    w, d, h, t = width / 2, depth / 2, height, .6  # t: wall thickness
    # `lanes`: a firing point: one wide window over a counter, a pier between lanes; else narrow slits
    slit_lo, slit_hi = (1.0, 2.15) if lanes else (1.2, 1.65)
    bm = bmesh.new()
    # floor slab
    cube(bm, (-w, -d, -.1), (w, d, 0), 0)
    # front wall: below and above the slit, piers every 3.5 m through the slit
    cube(bm, (-w, d - t, 0), (w, d, slit_lo), 0)
    cube(bm, (-w, d - t, slit_hi), (w, d, h), 0)
    piers = [-w + t / 2] + ([-w + (width / lanes) * i for i in range(1, lanes)] if lanes else [(-w + 2.8 * i) for i in range(1, int(width / 2.8))]) + [w - t / 2]
    for x in piers:
        r = .2 if lanes else .45
        cube(bm, (x - r, d - t, slit_lo), (x + r, d, slit_hi), 0)
    # sides, back (with the door)
    cube(bm, (-w, -d, 0), (-w + t, d - t, h), 0)
    cube(bm, (w - t, -d, 0), (w, d - t, h), 0)
    door = 1.4
    cube(bm, (-w + t, -d, 0), (-door / 2, -d + t, h), 0)
    cube(bm, (door / 2, -d, 0), (w - t, -d + t, h), 0)
    cube(bm, (-door / 2, -d, 2.2), (door / 2, -d + t, h), 0)
    # the roof slab, overhanging the front (shades the slit) with a chamfered edge
    cube(bm, (-w - .3, -d - .2, h), (w + .3, d + .9, h + .45), 1)
    # inside faces dark: faces pointing into the room
    bm.normal_update()
    for f in bm.faces:
        c = f.calc_center_median()
        inside = abs(c.x) < w - t + .01 and -d + t - .01 < c.y < d - t + .01 and 0 <= c.z <= h
        if inside:
            f.material_index = 2
    o = obj_from(bm, "Bunker", [M["concrete"], M["concrete_dark"], M["inside"]], col)
    o.location = at

    # earth mound over the roof: a low ridge, turf on top
    bm = bmesh.new()
    xs = [-w - .3 + i * (width + .6) / 8 for i in range(9)]
    ys = [-d - .2, -d + 1.2, 0, d - .4, d + .9]
    zs = [0, .5, .75, .45, 0]
    grid = []
    for j, y in enumerate(ys):
        row = []
        for i, x in enumerate(xs):
            edge = 0 if i in (0, len(xs) - 1) else 1
            row.append(bm.verts.new((x, y, h + .45 + zs[j] * edge + rng.uniform(-.06, .06) * edge * (j not in (0, 4)))))
        grid.append(row)
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.material_index = 1
    mound = obj_from(bm, "Bunker roof earth", [M["earth"], M["turf"]], col)
    mound.location = at

    # earth banked up the sides and back (the front stays bare concrete): a skirt from just under the roof to the
    # ground 3 m out, lumpy, turf on top, bare earth low down; a gap for the door
    bm = bmesh.new()
    out, top = 3.2, h + .35
    ring = [(-w - .3, d + .5), (-w - .3, -d - .2), (-door / 2 - .2, -d - .2), None, (door / 2 + .2, -d - .2), (w + .3, -d - .2), (w + .3, d + .5)]
    def skirt(a, b, flip):
        n = max(2, int((Vector(b) - Vector(a)).length / 1.6))
        rows = []
        for i in range(n + 1):
            t = i / n
            p = Vector(a).lerp(Vector(b), t)
            # outward: away from the bunker's centre line
            o = Vector((p.x, p.y)) - Vector((max(-w + 1, min(w - 1, p.x)), max(-d + 1, min(d - 1, p.y))))
            o = o.normalized() if o.length > 1e-6 else Vector((0, -1))
            rows.append([bm.verts.new((p.x + o.x * out * k, p.y + o.y * out * k,
                                       top * (1 - k) ** 1.4 + (rng.uniform(-.12, .12) if 0 < k < 1 else 0))) for k in (0, .35, .7, 1)])
        for i in range(n):
            for k in range(3):
                q = (rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1])
                f = bm.faces.new(q if not flip else q[::-1])
                f.material_index = 1 if k < 2 else 0
    segs = [ring[0:3], ring[4:7]]
    for seg in segs:
        for a, b in zip(seg, seg[1:]):
            skirt(a, b, False)
    bank = obj_from(bm, "Bunker earth bank", [M["earth"], M["turf"]], col)
    bank.location = at
    bm = bank.data
    bank.data.update()
    # face the camera side up
    import bmesh as _b
    t = _b.new(); t.from_mesh(bank.data); _b.ops.recalc_face_normals(t, faces=t.faces[:]); t.to_mesh(bank.data); t.free()

    # sandbags: on the roof front edge, a low wall either side of the door
    bag_wall("Bunker roof bags", col, width - .4, 2, at + Vector((0, d + .55, h + .45)))
    bag_wall("Bunker door bags L", col, 2.6, 4, at + Vector((-door / 2 - 1.6, -d - 1.2, 0)), double=True)
    bag_wall("Bunker door bags R", col, 2.6, 4, at + Vector((door / 2 + 1.6, -d - 1.2, 0)), double=True)
    return o


# ---------------- tent

def tent(col, at=Vector((0, 0, 0)), yaw=0.0, length=4.2, width=3.0, ridge=2.3, wall=.7):
    """a WW2 ridge tent: two poles + ridge, canvas roof to low walls, the front flaps tied open, guy ropes to pegs"""
    L, W = length / 2, width / 2
    bm = bmesh.new()
    # canvas: ridge -> eaves -> wall bottom, both sides; a slight sag between the poles
    def ridge_z(y):
        return ridge - .08 * (1 - (y / L) ** 2)
    ys = [-L + i * length / 6 for i in range(7)]
    for s in (-1, 1):
        prev = None
        for y in ys:
            sag = .05 * (1 - (y / L) ** 2)
            vs = (bm.verts.new((0, y, ridge_z(y))), bm.verts.new((s * W, y, wall - sag)), bm.verts.new((s * (W + .05), y, 0)))
            if prev:
                for k in range(2):
                    f = bm.faces.new((prev[k], vs[k], vs[k + 1], prev[k + 1]) if s > 0 else (prev[k + 1], vs[k + 1], vs[k], prev[k]))
                    f.material_index = 0 if k == 0 else 1
            prev = vs
    # back wall closed, front: two flaps folded back
    for y, closed in ((-L, True), (L, False)):
        if closed:
            f = bm.faces.new((bm.verts.new((-W - .05, y, 0)), bm.verts.new((-W, y, wall)), bm.verts.new((0, y, ridge_z(y))),
                              bm.verts.new((W, y, wall)), bm.verts.new((W + .05, y, 0))))
            f.material_index = 1
        else:
            for s in (-1, 1):
                a = bm.verts.new((0, y, ridge_z(y)))
                b = bm.verts.new((s * W, y, wall))
                c = bm.verts.new((s * (W + .05), y, 0))
                e = bm.verts.new((s * W * .55, y + .35, .15))  # the flap pulled out to the side
                f = bm.faces.new((a, b, c, e) if s > 0 else (e, c, b, a))
                f.material_index = 1
    canvas = obj_from(bm, "Tent canvas", [M["canvas"], M["canvas_dark"]], col)
    # dark inside floor seen through the door
    bm = bmesh.new()
    cube(bm, (-W, -L, 0), (W, L, .02))
    obj_from(bm, "Tent floor", M["inside"], col)
    # poles, ridge, guy ropes + pegs
    bm = bmesh.new()
    for y in (-L, L):
        cube(bm, (-.03, y - .03, 0), (.03, y + .03, ridge + .15))
    obj_from(bm, "Tent poles", M["wood"], col)
    bm = bmesh.new()
    for y in (-L, -L / 3, L / 3, L):
        for s in (-1, 1):
            top = Vector((s * W, y, wall))
            peg = Vector((s * (W + 1.0), y, 0))
            d = (peg - top)
            n = d.normalized()
            side = n.cross(Vector((0, 1, 0))).normalized() * .008
            q = [top - side, top + side, peg + side, peg - side]
            bm.faces.new([bm.verts.new(p) for p in q])
            bm.faces.new([bm.verts.new(p) for p in q[::-1]])
    for y in (-L, L):
        top = Vector((0, y, ridge + .1))
        peg = Vector((0, y + (1.4 if y > 0 else -1.4), 0))
        side = Vector((.008, 0, 0))
        q = (top - side, top + side, peg + side, peg - side)
        bm.faces.new([bm.verts.new(p) for p in q])
        bm.faces.new([bm.verts.new(p) for p in q[::-1]])
    obj_from(bm, "Tent ropes", M["rope"], col)
    bm = bmesh.new()
    for y in (-L, -L / 3, L / 3, L):
        for s in (-1, 1):
            x = s * (W + 1.0)
            cube(bm, (x - .025, y - .025, 0), (x + .025, y + .025, .18))
    for y in (-L - 1.4, L + 1.4):
        cube(bm, (-.025, y - .025, 0), (.025, y + .025, .18))
    obj_from(bm, "Tent pegs", M["wood"], col)
    parts = [o for o in col.objects if o.name.startswith("Tent")]
    for o in parts:
        o.matrix_world = Matrix.Translation(at) @ Matrix.Rotation(yaw, 4, "Z") @ o.matrix_world
    return canvas


# ---------------- flag

def logo_text(col):
    """the papit logo's letters (svg) as flat geometry, unit square = the logo (0..1, y up)"""
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=LOGO)
    new = [o for o in bpy.data.objects if o not in before]
    curves = [o for o in new if o.type == "CURVE"]
    # the first path is the orange square: drop it; the rest are letter strokes (outlined)
    curves.sort(key=lambda o: -max(o.dimensions))
    square = curves[0]
    lo = Vector((min(v.x for o in [square] for s in o.data.splines for v in [p.co for p in s.bezier_points]),
                 min(v.y for o in [square] for s in o.data.splines for v in [p.co for p in s.bezier_points]), 0))
    size = square.dimensions.x
    letters = []
    for o in curves[1:]:
        # the letters' paths are their outlines: filled flat
        o.data.dimensions = "2D"
        o.data.fill_mode = "BOTH"
        o.data.resolution_u = 3
        deps = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(deps))
        x = bpy.data.objects.new("logo letter", me)
        x.matrix_world = o.matrix_world
        col.objects.link(x)
        letters.append(x)
    for o in new:
        bpy.data.objects.remove(o)
    for o in letters:
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        o.data.transform(Matrix.Translation(-lo))
        o.data.transform(Matrix.Scale(1 / size, 4))
        o.data.materials.clear()
        o.data.materials.append(M["flag_text"])
    return letters


def flag(col, at=Vector((0, 0, 0)), pole=11.0, fw=3.0, fh=2.0):
    """a tall pole (base, brass ball, halyard) with the papit flag waving off +x; a ring of stones and gravel round it"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=.09, radius2=.05, depth=pole)
    bmesh.ops.translate(bm, vec=(0, 0, pole / 2), verts=bm.verts)
    obj_from(bm, "Flag pole", M["pole"], col, smooth=True)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=.13)
    bmesh.ops.translate(bm, vec=(0, 0, pole + .1), verts=bm.verts)
    obj_from(bm, "Flag ball", M["brass"], col, smooth=True)
    bm = bmesh.new()
    cube(bm, (-.45, -.45, 0), (.45, .45, .35))
    cube(bm, (-.32, -.32, .35), (.32, .32, .55))
    obj_from(bm, "Flag base", M["concrete"], col)
    # the cloth: a grid waving along x (more at the free end), hung from near the top
    top = pole - .25
    nx, ny = 12, 6
    def wave(u, v):
        a = u * u
        return Vector((.1 + u * fw * (1 - .04 * a), .32 * a * math.sin(u * 5.2 + v * .7) + .06 * math.sin(v * 3), top - (1 - v) * fh - .12 * a * (1 - v)))
    bm = bmesh.new()
    grid = [[bm.verts.new(wave(i / nx, j / ny)) for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=.012)
    cloth = obj_from(bm, "Flag cloth", M["flag"], col)
    # the letters on both faces, bent onto the wave
    for side in (1, -1):
        for o in logo_text(col):
            for v in o.data.vertices:
                u, w = v.co.x, v.co.y
                if side < 0:
                    u = 1 - u
                # logo square (1x1) onto the cloth (fw x fh): keep its aspect, centred vertically
                uu = min(1, max(0, u * fh / fw + (1 - fh / fw)))
                p = wave(uu, w)
                nrm = (wave(min(1, uu + .01), w) - p).cross(wave(uu, min(1, w + .01)) - p).normalized()
                v.co = p + nrm * side * .012
            o.name = "Flag letters"
    # gravel disc + a ring of stones
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=20, radius=2.6)
    for v in bm.verts:
        v.co.z = .03
    obj_from(bm, "Flag gravel", M["gravel"], col)
    n = 16
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-.05, .05)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=.32)
        for v in bm.verts:
            v.co.x *= rng.uniform(.9, 1.3)
            v.co.y *= rng.uniform(.8, 1.1)
            v.co.z *= rng.uniform(.5, .75)
            v.co += Vector((rng.uniform(-.04, .04), rng.uniform(-.04, .04), rng.uniform(-.03, .03)))
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(a, 3, "Z"))
        bmesh.ops.translate(bm, vec=(math.cos(a) * 2.75, math.sin(a) * 2.75, .08), verts=bm.verts)
        obj_from(bm, f"Flag stone {k}", M["stone"], col)
    for o in [o for o in col.objects if o.name.startswith("Flag")]:
        o.location += at


# ---------------- scene

def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


if __name__ == "__main__":
    out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 1 else OUT
    if os.path.exists(out) and "--force" not in sys.argv:
        sys.exit(f"{out} exists (the owner edits it): pass --force to overwrite")
    clear()
    c = collection("Sandbags")
    for i in range(3):
        sack(f"Sandbag {i}", c, seed=i).location = (i * .7 - 30, -6, 0)
    bag_wall("Sandbag wall", c, 4.2, 5, Vector((-30, -3, 0)))
    bag_wall("Sandbag wall double", c, 3.2, 4, Vector((-30, 0, 0)), double=True)
    bunker(collection("Bunker"), Vector((0, 0, 0)))
    tent(collection("Tent"), Vector((22, 0, 0)))
    flag(collection("Flag"), Vector((38, 0, 0)))
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("saved", out)
