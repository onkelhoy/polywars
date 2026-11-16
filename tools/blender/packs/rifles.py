"""Single-gun downloads (Sketchfab "low-poly-*" .blend / .fbx / .gltf) and the Ultimate Gun Pack scopes -> editable model.blend.

  blender -b --disable-autoexec -P tools/blender/packs/rifles.py -- <store>/Weapons [--force] [slug ...]

Each source is flattened (modifiers / skin applied, one mesh), turned into the gun frame (muzzle +Y, up +Z,
right +X, bounding box centre at the origin) and scaled to the real length. Writes
assets/models/weapons/{guns,attachments}/<slug>/model.blend + about/license.txt. Existing files are kept unless --force.
`flip` turns the muzzle / up guess around when the auto guess is wrong (see tools/blender/packs/rifles-shot.py):
`m` muzzle, `u` up, `r` rolls a quarter (side magazines make the gun wider than high).
"""
import bpy, math, os, shutil, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from mathutils import Matrix, Vector
import pw

# slug: (store folder, file in it, real length m, flips)
GUNS = {
    "arisaka-type-99": ("low-poly-arisaka-type-99", "source/Arisaka Type 99.blend", 1.118, ""),
    "beretta-model-57": ("low-poly_beretta_model_57", "scene.gltf", 1.0, ""),
    "carcano-m1891": ("low-poly-carcano-m1891", "source/Carcano.fbx", 1.285, ""),
    "gewehr-43": ("low-poly-gewehr-43", "source/Gewehr 43.blend", 1.13, ""),
    "k31": ("low-poly-k31", "source/K31.fbx", 1.105, ""),
    "kar98k": ("low-poly-kar98k", "source/Kar98K.blend", 1.11, ""),
    "kropatschek": ("low-poly-kropatschek-rifle", "source/Kropatschek Rifle.blend", 1.24, ""),
    "lebel-m1886": ("low-poly-lebel-m1886", "source/Lebel 1886.fbx", 1.30, ""),
    "m1903a1-springfield": ("low-poly-m1903a1-springfield", "source/Springfield M1903.blend", 1.097, ""),
    "p14-enfield": ("low-poly-p14-enfield", "source/P14 Enfield.blend", 1.175, ""),
    "remington-model-8": ("low-poly-remington-model-8", "source/remmington model 8.blend", 1.04, ""),
    "ross-mk3": ("low-poly-ross-mk3", "source/Ross Mk3.fbx", 1.285, ""),
    "ruger-10-22": ("low-poly-ruger-1022", "source/ruger 10-22.blend", .94, ""),
    "vetterli-m78": ("low-poly-vetterli-m78-rifle", "source/Vetterli Rifle.fbx", 1.32, ""),
    "winchester-1866": ("low-poly-winchester-1866-yellow-boy", "source/Winchester 1866 Yellow Boy.blend", 1.03, ""),
    "winchester-1895": ("low-poly-winchester-1895-russian", "source/Winchester 1895 Russian.blend", 1.17, ""),
    "winchester-1910": ("low-poly-winchester-model-1910", "source/Winchester Model 1910.blend", 1.0, ""),
    "general-liu": ("low-poly_general_liu_rifle", "scene.gltf", 1.1, ""),
    "gewehr-88": ("low-poly_gewehr_88", "scene.gltf", 1.245, ""),
    "mas-36": ("low-poly_mas_36", "scene.gltf", 1.02, ""),
    "smle-mk3": ("low-poly_smle_mk_iii", "scene.gltf", 1.13, ""),
    "double-deuce": ("low-poly_stolzer__son_double_deuce", "scene.gltf", 1.05, ""),
    "svt-40": ("low-poly_svt-40", "scene.gltf", 1.226, ""),
    "vz-52": ("low-poly_vz.52", "scene.gltf", 1.003, ""),
    "mp40": ("low-poly-mp40", "source/MP40.fbx", .833, ""),
    "mp28": ("low-poly-mp-28", "source/MP28.fbx", .812, "r"),
    "sterling": ("low-poly-sterling-smg", "source/Sterling SMG.fbx", .69, "r"),
    "ithaca-m37": ("low-poly-ithaca-m37", "source/Ithaca M37.blend", 1.0, ""),
    "lahti-l39": ("low-poly-lahti-l39", "source/Lahti L39.fbx", 2.24, "u"),
    "beretta-m1951": ("low-poly-beretta-m1951", "Beretta M1951.blend", .203, ""),
    "borchardt-c93": ("low-poly-borchardt-c-93", "Borchardt.fbx", .35, ""),
    "husqvarna-m40": ("low-poly-husqvarna-m40", "Husqvarna m40.blend", .267, ""),
    "nagant-m1895": ("low-poly-nagant-m1895", "Nagant M1895.fbx", .235, ""),
    "nambu-type-14": ("low-poly-nambu-type-14", "Nambu Type 14.fbx", .23, ""),
    "webley-mk-vi": ("low-poly-webley-mk-vi", "Webley MKIV.fbx", .286, ""),
    "mauser-c96": ("low-poly-masuer-c96", "Masuer C96.fbx", .312, ""),
    "welrod-mk2": ("low-poly-welrod-mk2", "Welrod Mk2.fbx", .31, ""),
}
UGP = "Ultimate Gun Pack - July 2019"
SCOPES = {f"scope-{i}": (UGP, f"Blends/Accessories/Scope_{i}.blend", .30, "m") for i in (1, 2, 3)}

FORCE = False


def load(path):
    bpy.ops.wm.read_homefile(use_empty=True)
    ext = os.path.splitext(path)[1].lower()
    if ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()


def flatten(name):
    """every visible mesh, evaluated (skin + modifiers) in world space, as one new mesh object"""
    deps = bpy.context.evaluated_depsgraph_get()
    srcs = [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.hide_render and o.visible_get()]
    mats, parts = [], []
    for o in srcs:
        ev = o.evaluated_get(deps)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=deps)
        me.transform(o.matrix_world)
        remap = []
        for m in [slot.material for slot in o.material_slots] or list(me.materials):  # slots: object-linked materials too
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        index = [remap[min(p.material_index, len(remap) - 1)] if remap else 0 for p in me.polygons]
        me.materials.clear()  # resets the face indices: set them after
        for m in mats:
            me.materials.append(m)
        for p, i in zip(me.polygons, index):
            p.material_index = i
        parts.append(bpy.data.objects.new(o.name, me))
    for o in [o for o in bpy.data.objects if o not in parts]:  # read_homefile would drop the new meshes too
        bpy.data.objects.remove(o)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for p in parts:
        bpy.context.scene.collection.objects.link(p)
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.matrix_world = Matrix.Identity(4)
    return obj


def drop_strays(obj):
    """loose pieces (props like a stripper clip beside the gun) that touch nothing of the gun: gone"""
    parts = pw.loose_parts(obj.data)
    vs = obj.data.vertices
    boxes = [pw.bbox(vs[i].co for i in p) for p in parts]
    pad = max((b[1] - b[0]).length for b in boxes) * .01

    def touch(a, b):
        return all(a[0][k] - pad <= b[1][k] and b[0][k] - pad <= a[1][k] for k in range(3))
    keep, todo = {0}, [0]
    while todo:
        i = todo.pop()
        for j in range(len(parts)):
            if j not in keep and touch(boxes[i], boxes[j]):
                keep.add(j)
                todo.append(j)
    gone = [v for j, p in enumerate(parts) if j not in keep for v in p]
    if gone:
        pw.delete_vertices(obj, gone)
        print(f"dropped {len(parts) - len(keep)} stray pieces")


def frame(obj, length, flips):
    """longest axis -> +Y (muzzle end = the thinner end), thinnest -> X, up = the side the barrel sits on"""
    vs = [v.co.copy() for v in obj.data.vertices]
    lo, hi = pw.bbox(vs)
    size = hi - lo
    order = sorted(range(3), key=lambda k: size[k])  # thin, mid, long
    t, u, l = order
    if "r" in flips:  # side magazine: wider than high, the thin / up guess swapped
        t, u = u, t
    R = Matrix(((0, 0, 0), (0, 0, 0), (0, 0, 0)))
    R[0][t], R[1][l], R[2][u] = 1, 1, 1
    if R.determinant() < 0:  # a turn, never a mirror (the bolt stays on its side)
        R[0][t] = -1
    pts = [R @ (v - (lo + hi) / 2) for v in vs]
    half = size[l] / 2

    def end(sign):
        return [p for p in pts if p.y * sign > half * .8]

    def height(ps):
        return max(p.z for p in ps) - min(p.z for p in ps) if ps else 0
    muzzle = 1 if height(end(1)) < height(end(-1)) else -1
    if "m" in flips:
        muzzle = -muzzle
    near = end(muzzle)
    up = 1 if sum(p.z for p in near) / max(1, len(near)) > 0 else -1
    if "u" in flips:
        up = -up
    # keep it a rotation (right-handed): flipping y and z together is a turn about x
    F = Matrix.Diagonal((muzzle * up, muzzle, up))
    s = length / size[l]
    M = Matrix.Diagonal((s, s, s)) @ F @ R
    obj.data.transform(M.to_4x4() @ Matrix.Translation(-(lo + hi) / 2))
    # the bore on x = 0 (a bolt handle sticking out moves the box centre): centre of the front 5 %
    ys = [v.co.y for v in obj.data.vertices]
    tip = max(ys) - (max(ys) - min(ys)) * .05
    xs = [v.co.x for v in obj.data.vertices if v.co.y > tip]
    obj.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, 0, 0)))
    obj.data.update()


WOOD, METAL, SCOPE = (.25, .12, .05, 1), (.05, .05, .055, 1), (.03, .03, .03, 1)


def colour_input(mat):
    if not mat or not mat.use_nodes:
        return None
    n = next((n for n in mat.node_tree.nodes if n.type in ("BSDF_PRINCIPLED", "BSDF_DIFFUSE")), None)
    if not n or any(l for l in n.inputs[0].links):
        return None  # textured or driven: leave it
    return n.inputs["Base Color" if n.type == "BSDF_PRINCIPLED" else "Color"]


def colour_defaults(obj, kind):
    """materials still at Blender's default grey (the source lost or never had colours): reaching the butt = wood,
    the rest gunmetal; scopes all black"""
    me = obj.data
    ys = [v.co.y for v in me.vertices]
    butt = min(ys) + (max(ys) - min(ys)) * .1
    for i, mat in enumerate(me.materials):
        c = colour_input(mat)
        if not c or any(abs(x - .8) > .02 for x in c.default_value[:3]):
            continue
        at_butt = any(sum(me.vertices[v].co.y for v in p.vertices) / len(p.vertices) < butt for p in me.polygons if p.material_index == i)
        colour = SCOPE if kind == "attachments" else WOOD if at_butt else METAL
        mat = mat.copy()
        me.materials[i] = mat
        colour_input(mat).default_value = colour
        mat.diffuse_color = colour


def convert(store, kind, slug, src):
    folder_name, file, length, flips = src
    out = os.path.join(pw.ASSETS, "models", "weapons", kind, slug)
    blend = os.path.join(out, "model.blend")
    if os.path.exists(blend) and not FORCE:
        print("kept", os.path.relpath(blend, pw.ROOT))
        return
    load(os.path.join(store, folder_name, file))
    obj = flatten(slug)
    drop_strays(obj)
    frame(obj, length, flips)
    colour_defaults(obj, kind)
    for lic in ("license.txt", "License.txt"):
        p = os.path.join(store, folder_name, lic)
        if os.path.exists(p):
            os.makedirs(os.path.join(out, "about"), exist_ok=True)
            shutil.copy(p, os.path.join(out, "about", "license.txt"))
    bpy.data.orphans_purge(do_recursive=True)
    pw.save_part(obj, slug, blend)


def main():
    a = pw.args()
    global FORCE
    store, FORCE = a[0], "--force" in a
    only = [x for x in a[1:] if not x.startswith("--")]
    for kind, table in (("guns", GUNS), ("attachments", SCOPES)):
        for slug, src in table.items():
            if not only or slug in only:
                convert(store, kind, slug, src)


main()
