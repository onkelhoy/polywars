"""Store Willys jeep (one FBX mesh) -> drivable vehicle asset.

  blender -b --disable-autoexec -P tools/blender/packs/jeep.py

Splits the 4 wheels (with their lug nuts) and the steering wheel (rim + spokes) into own objects with the origin
at their pivot, scales to 3.4 m, nose +Y, wheels on z = 0. Writes assets/models/vehicles/willys-jeep/
model.blend, model.glb (via export.py) and vehicle.json.
vehicle.json is in glTF space (y up, nose -z, right +x), metres; the runtime tunes the physics numbers.
"""
import bpy, json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import bmesh, numpy as np
from mathutils import Matrix, Vector
import pw

STORE = os.path.expanduser("~/Developer/3d/store/Vehicles/willys-jeep-low-poly")
SRC = os.path.join(STORE, "source/willys jeep Blend.fbx")
PALETTE = os.path.join(STORE, "textures/willys-pallete_16x16.png")
OUT = os.path.join(pw.ASSETS, "models/vehicles/willys-jeep")
LENGTH = 3.4
# steering wheel parts by centre in source units (rim + 3 spokes); the column stays on the body
STEER = [(0.86, 0.09, 3.09), (0.63, -0.06, 3.25), (0.79, 0.30, 2.86), (1.16, 0.03, 3.16)]


def split(obj, indices, name):
    """Move the given vertices (whole loose parts) into a new object."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    keep = set(indices)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
    me = obj.data.copy()
    bm.to_mesh(me)
    bm.free()
    part = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(part)
    return part


GLASS = (.83, .83, .83)  # the palette swatch the panes use (headlights too: only faces up by the windshield)
CLEAR = (.80, .88, .95, .14)
STREAK = (1, 1, 1, .5)


def glass(body, img):
    """Windshield panes -> own object "Window" (named to draw after the other parts: glTF children go by name),
    clear vertex colour + a few thin white diagonal streaks just in front of each pane."""
    w, h = img.size
    px = list(img.pixels)
    me = body.data
    uv = me.uv_layers.active.data
    panes = []
    for p in me.polygons:
        u = sum(uv[l].uv.x for l in p.loop_indices) / p.loop_total
        v = sum(uv[l].uv.y for l in p.loop_indices) / p.loop_total
        k = ((int((v % 1) * h) % h) * w + int((u % 1) * w) % w) * 4
        if all(abs(a - b) < .03 for a, b in zip(px[k:k + 3], GLASS)) and p.center.y < .6 and p.center.z > 1.0:
            panes.append(p.index)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    gm = bmesh.new()
    cols = []
    big = set(sorted(panes, key=lambda i: -bm.faces[i].calc_area())[:4])
    for i in panes:
        f = bm.faces[i]
        vs = [gm.verts.new(v.co) for v in f.verts]
        gm.faces.new(vs)
        cols.append(CLEAR)
        if i not in big:
            continue
        # streaks: thin slanted strips across the pane, 2 mm out (both sides)
        n = f.normal
        lo, hi = pw.bbox(v.co for v in f.verts)
        right = Vector((1, 0, 0))
        upv = n.cross(right).normalized()
        c = (lo + hi) / 2
        width, height = (hi - lo).x, max((hi - lo).z, .05)
        for k, (dx, ln) in enumerate(((-.25, .55), (.05, .35), (.3, .25))):
            for side in (1, -1):
                o = c + right * dx * width + n * .002 * side
                a, b = o + (right * .18 + upv) * ln * height * .5, o - (right * .18 + upv) * ln * height * .5
                t = right * .006
                q = [gm.verts.new(x) for x in (a - t, a + t, b + t, b - t)]
                gm.faces.new(q if side > 0 else q[::-1])
                cols.append(STREAK)
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in panes], context="FACES_ONLY")
    bm.to_mesh(me)
    bm.free()
    gme = bpy.data.meshes.new("Window")
    gm.to_mesh(gme)
    gm.free()
    col = gme.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    for poly, c in zip(gme.polygons, cols):
        for l in poly.loop_indices:
            col.data[l].color = c
    gme.color_attributes.active_color = col
    mat = bpy.data.materials.new("Glass")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .1
    gme.materials.append(mat)
    win = bpy.data.objects.new("Window", gme)
    bpy.context.scene.collection.objects.link(win)
    print("glass faces:", len(panes))
    return win


def pivot(obj, at):
    obj.data.transform(Matrix.Translation(-at))
    obj.location = at


def main():
    pw.empty_file()
    bpy.ops.import_scene.fbx(filepath=SRC)
    for o in list(bpy.data.objects):
        if o.name != "jeep":
            bpy.data.objects.remove(o)
    body = bpy.data.objects["jeep"]
    body.name = body.data.name = "Body"
    pw.bake(body, body.matrix_world.copy())
    me = body.data  # FBX brings white vertex colours and spare UV maps: the palette UV only
    for c in list(me.color_attributes):
        me.color_attributes.remove(c)
    uv = me.uv_layers.active.name
    for l in [l for l in me.uv_layers if l.name != uv]:
        me.uv_layers.remove(l)

    parts = pw.loose_parts(body.data)
    boxes = [pw.world_bbox(body, p) for p in parts]
    centre = [(lo + hi) / 2 for lo, hi in boxes]
    size = [hi - lo for lo, hi in boxes]

    # wheels: the 4 biggest parts standing in the y-z plane (spare lies the other way)
    wheels = [i for i in range(len(parts)) if size[i].y > 1.5 and size[i].z > 1.5 and size[i].x < .6][:4]
    groups = {}
    for w in wheels:
        c = centre[w]
        nuts = [i for i in range(len(parts)) if len(parts[i]) <= 10 and i not in wheels
                and centre[i].x * c.x > 0 and abs(centre[i].x) > abs(c.x) and (centre[i] - c).yz.length < .5]
        groups[w] = [v for i in [w] + nuts for v in parts[i]]
    steer = [min(range(len(parts)), key=lambda i: (centre[i] - Vector(s)).length) for s in STEER]

    # source frame: nose -y, left +x. Turn 180 so the nose is +y, scale, centre, wheels on z = 0
    lo, hi = pw.world_bbox(body)
    s = LENGTH / (hi - lo).y
    zmin = min(boxes[w][0].z for w in wheels)
    M = Matrix.Scale(s, 4) @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation(
        -Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, zmin)))
    pw.bake(body, M)

    # rim plane normal (steering axis) from the rim's vertices, before splitting
    rim = np.array([tuple(body.data.vertices[v].co) for v in parts[steer[0]]])
    rc = rim.mean(axis=0)
    axis = Vector(np.linalg.svd(rim - rc)[2][2])
    rc = Vector(rc)
    if axis.y > 0:  # point from the rim towards the driver (back, -y)
        axis = -axis

    objs = []
    wheel_info = []
    for w in wheels:
        o = split(body, groups[w], "")
        wlo, whi = pw.world_bbox(o)
        c = (wlo + whi) / 2
        o.name = o.data.name = "Wheel" + (".F" if c.y > 0 else ".R") + (".R" if c.x > 0 else ".L")
        pivot(o, c)
        objs.append(o)
        wheel_info.append((o.name, c, (whi.z - wlo.z) / 2, whi.x - wlo.x))
    sw = split(body, [v for i in steer for v in parts[i]], "SteeringWheel")
    pivot(sw, rc)
    # local frame: steering axis along the object's -y (so the runtime spins it round its own axis)
    q = Vector((0, -1, 0)).rotation_difference(axis)
    sw.data.transform(q.to_matrix().to_4x4().inverted())
    sw.rotation_mode = "QUATERNION"
    sw.rotation_quaternion = q
    pw.delete_vertices(body, sorted({v for g in groups.values() for v in g} | {v for i in steer for v in parts[i]}))

    # palette on every part (export bakes it into vertex colours)
    img = bpy.data.images.load(PALETTE)
    mat = bpy.data.materials.new("Jeep")
    mat.use_nodes = True
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = .8
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    for o in [body, sw] + objs:
        o.data.materials.clear()
        o.data.materials.append(mat)
        for p in o.data.polygons:
            p.material_index = 0
            p.use_smooth = False

    win = glass(body, img)

    root = bpy.data.objects.new("Jeep", None)
    bpy.context.scene.collection.objects.link(root)
    for o in [body, sw, win] + objs:
        o.parent = root

    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "model.blend"))
    print("saved model.blend")

    gl = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]  # blender z-up -> glTF y-up
    seat = rc + Vector((0, -.42, -.32))
    eye = rc + Vector((0, -.38, .42))
    lo, hi = pw.world_bbox(body)
    data = {
        "model": "model.glb",
        "frame": "glTF: y up, nose -z, right +x, metres",
        "size": [abs(x) for x in gl(hi - lo)],
        "centre": gl((lo + hi) / 2),
        "mass": 1040,
        "topSpeed": 18,
        "wheels": [{"node": n, "position": gl(c), "radius": round(r, 4), "width": round(wd, 4),
                    "steer": c.y > 0, "drive": True} for n, c, r, wd in sorted(wheel_info)],
        "steeringWheel": {"node": "SteeringWheel", "position": gl(rc), "axis": gl(axis), "turns": 1.5},
        "seat": gl(seat),
        "eye": gl(eye),
        "exit": gl(Vector((rc.x - 1.1, rc.y - .4, 0))),
    }
    with open(os.path.join(OUT, "vehicle.json"), "w") as f:
        json.dump(data, f, indent=1)
    print("wrote vehicle.json")

    import export
    export.export(os.path.join(OUT, "model.glb"))


main()
