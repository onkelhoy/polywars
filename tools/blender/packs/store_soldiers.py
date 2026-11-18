"""Unrigged store characters (.fbx mesh only) -> assets/models/characters/<slug>/model.blend on the base rig
(the owner's characters/base/model.blend, lib/base_rig.py).

  blender -b -P tools/blender/packs/store_soldiers.py [-- <slug> ...]

Sources live in <slug>/source/ (+ <slug>/textures/). Props (guns) dropped, meshes joined, stood on the ground,
scaled to HEIGHT. The rig is fitted from per character landmarks (`FITS`, fractions of the height, x out from the
middle; read off front renders), each joint centred in the mesh's depth, the mesh weighted automatically (bone
heat), then `soldiers.to_base` re-poses it into the base T-pose and swaps in the base armature.
"""
import bpy, os, sys, glob
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Matrix, Vector
import pw, base_rig

HEIGHT = 1.8
# landmarks (x, z) as fractions of the height, left side (+x); `leg`: x of the knee / ankle;
# `voxel`: when bone heat fails, weigh a remeshed copy (m; the mesh itself is untouched);
# `cut`: arm radius (m), torso vertices further in than the arm's line lose their arm weights (armpits)
FITS = {
    "ww2-soldier-allied": {"fbx": "7311cde45afa9a3dcd0cc29371d83051.fbx", "name": "WW2 Allied soldier", "voxel": .008, "cut": .045,
                           "shoulder": (.10, .79), "elbow": (.165, .62), "wrist": (.18, .5), "tip": (.17, .40), "leg": (.066, .078)},
    "army-soldier-cartoon": {"fbx": "98562d67ea70dc98b644b8c37b56c21b.fbx", "name": "Army soldier (cartoon)",
                             "shoulder": (.10, .79), "elbow": (.165, .62), "wrist": (.18, .5), "tip": (.17, .40), "leg": (.066, .078)},
    "soldier-low-poly": {"fbx": "LowPolySoldier.fbx", "name": "Low poly soldier", "drop": ("ACR",),
                         "shoulder": (.10, .80), "elbow": (.22, .69), "wrist": (.31, .61), "tip": (.35, .555), "leg": (.07, .087)},
}


def _mesh(folder, fit, reset=True):
    if reset:
        bpy.ops.wm.read_homefile(use_empty=True)
    had = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(folder, "source", fit["fbx"]))
    for o in [o for o in bpy.data.objects if o not in had]:
        if o.type != "MESH" or not o.data.polygons or o.name.startswith(fit.get("drop", ())):
            bpy.data.objects.remove(o)
    _textures(folder)
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o not in had]
    # one UV map each, same name, so joining keeps one
    for o in meshes:
        uv = o.data.uv_layers
        while len(uv) > 1:
            uv.remove(uv[-1])
        if len(uv):
            uv[0].name = "UVMap"
    for o in meshes:
        o.matrix_world = o.matrix_world.copy()
        o.parent = None
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = "body"
    ps = [v.co for v in body.data.vertices]
    lo, hi = Vector([min(p[i] for p in ps) for i in range(3)]), Vector([max(p[i] for p in ps) for i in range(3)])
    s = HEIGHT / (hi.z - lo.z)
    body.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
    return body


def _textures(folder):
    """only the base colour image stays (the export bakes it into vertex colours), its file from textures/;
    materials without one get `<prefix>_TX.png` (Soldier_MT -> Soldier_TX.png), else the one colour map there"""
    pngs = glob.glob(os.path.join(folder, "textures", "*.png"))
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        nodes = m.node_tree.nodes
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        base = bsdf.inputs["Base Color"]
        keep = base.links[0].from_node if base.links and base.links[0].from_node.type == "TEX_IMAGE" else None
        for n in [n for n in nodes if n.type == "TEX_IMAGE" and n is not keep]:
            nodes.remove(n)
        if keep and keep.image:
            local = os.path.join(folder, "textures", os.path.basename(keep.image.filepath))
            if os.path.exists(local):
                keep.image.filepath = local
                keep.image.reload()
            continue
        colour = [p for p in pngs if not any(k in os.path.basename(p).lower() for k in ("normal", "rough", "metal"))]
        hit = next((p for p in pngs if os.path.basename(p).split("_")[0].lower() == m.name.split("_")[0].lower()), None)
        hit = hit or (colour[0] if len(colour) == 1 else None)
        if hit:
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(hit)
            m.node_tree.links.new(tex.outputs["Color"], base)


def _depth(body, x, z, r=.03):
    """middle of the mesh in y round (x, z)"""
    ys = [v.co.y for v in body.data.vertices if abs(v.co.x - x) < r and abs(v.co.z - z) < r]
    return (min(ys) + max(ys)) / 2 if ys else 0


def _fit(body, fit):
    """the base armature's deform bones (no controls: to_base places those), joints on the landmarks"""
    arm = base_rig.armature(deform_only=True)
    spec = base_rig.bones()
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for b in list(eb):
        if not spec[b.name][3] and b.name != "root":
            eb.remove(b)
    H = HEIGHT
    for side, s in (("L", 1), ("R", -1)):
        P = lambda k: Vector((s * fit[k][0] * H, 0, fit[k][1] * H))
        S, E, W, T = P("shoulder"), P("elbow"), P("wrist"), P("tip")
        for p in (S, E, W):
            p.y = _depth(body, p.x, p.z)
        T.y = W.y
        h, L = (T - W).normalized(), (T - W).length
        front = Vector((0, -1, 0))
        front = (front - h * front.dot(h)).normalized()
        out = h.cross(front).normalized() * s
        n = lambda k: eb[f"{k}.{side}"]
        n("shoulder").head, n("shoulder").tail = Vector((s * .03, S.y, S.z)), S
        n("upper_arm").head, n("upper_arm").tail = S, E
        n("forearm").head, n("forearm").tail = E, W
        K = W + h * L * .45
        n("hand").head, n("hand").tail = W, K
        for f, off, base, segs in (("fingers", out * .006, K, (.2, .18, .17)), ("index", front * .018, K, (.2, .18, .17)),
                                   ("thumb", front * .022, W + h * L * .15, (.12, .1, .08))):
            d = h if f != "thumb" else (h + front * 1.2).normalized()
            p = base + off
            for i, k in enumerate(segs, 1):
                b = n(f"{f}.{i}")
                b.head, b.tail = p, p + d * L * k
                p = b.tail
        # legs: knee / ankle x from the landmarks, heights from the base
        lx = lambda k: s * fit["leg"][k] * H
        for name, k in (("thigh", 0), ("shin", 1), ("foot", 1), ("toe", 1)):
            b = n(name)
            dx = lx(k) - spec[f"{name}.{side}"][0][0]
            b.head.x += dx; b.tail.x += dx
        n("thigh").tail = n("shin").head
    for b in eb:
        if b.name in spec and not b.use_connect and b.parent and (b.parent.tail - b.head).length < 1e-4:
            b.use_connect = True
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def _transfer(src, dst):
    """vertex groups from `src` onto `dst` by the nearest face"""
    for g in src.vertex_groups:
        if g.name not in dst.vertex_groups:
            dst.vertex_groups.new(name=g.name)
    dt = dst.modifiers.new("weights", "DATA_TRANSFER")
    dt.object = src
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"
    dt.layers_vgroup_select_src = "ALL"
    dt.layers_vgroup_select_dst = "NAME"
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = dst; dst.select_set(True)
    bpy.ops.object.modifier_apply(modifier="weights")


def _cut(body, fit):
    """torso vertices further in than the arm's line (shoulder -> elbow -> wrist, less 1.3 arm radii) and not facing the body: arm weights -> chest"""
    H, r = HEIGHT, fit["cut"]
    S, E, W = ((fit[k][0] * H, fit[k][1] * H) for k in ("shoulder", "elbow", "wrist"))
    def line(z):
        a, b = (S, E) if z > E[1] else (E, W)
        t = (z - a[1]) / (b[1] - a[1])
        return a[0] + (b[0] - a[0]) * t
    groups = {g.name: g for g in body.vertex_groups}
    chest = groups["chest"]
    moved = 0
    for side, s in (("L", 1), ("R", -1)):
        arm = [g for n, g in groups.items() if n.endswith("." + side) and n.split(".")[0] in ("upper_arm", "forearm", "hand", "thumb", "index", "fingers")]
        ids = {g.index for g in arm}
        for v in body.data.vertices:
            z, x = v.co.z, v.co.x * s
            # the sleeve's inside faces the body (normal inward): stays on the arm
            if not (W[1] < z < S[1] - .03) or x >= line(z) - 1.3 * r or v.normal.x * s < -.2:
                continue
            w = sum(e.weight for e in v.groups if e.group in ids)
            if w <= 0:
                continue
            for g in arm:
                g.remove([v.index])
            chest.add([v.index], w, "ADD")
            moved += 1
    print("cut", moved, "torso vertices off the arms")


def _weigh(body, arm, voxel=None):
    """bone heat on a cleaned copy (merged, no loose bits), weights copied onto the mesh (nearest face)"""
    proxy = body.copy(); proxy.data = body.data.copy(); proxy.name = "proxy"
    bpy.context.scene.collection.objects.link(proxy)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = proxy; proxy.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=.002)
    bpy.ops.mesh.delete_loose()
    bpy.ops.object.mode_set(mode="OBJECT")
    # bone heat fails on this mesh: weigh a closed copy (voxel remesh, thrown away after; fuses arms close to the body)
    if voxel:
        rm = proxy.modifiers.new("remesh", "REMESH")
        rm.mode, rm.voxel_size = "VOXEL", voxel
        bpy.ops.object.modifier_apply(modifier="remesh")
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    _transfer(proxy, body)
    bpy.data.objects.remove(proxy)
    body.parent = arm
    body.modifiers.new("armature", "ARMATURE").object = arm
    count = {g.index: 0 for g in body.vertex_groups}
    for v in body.data.vertices:
        for e in v.groups:
            if e.weight > .1:
                count[e.group] += 1
    print("weights:", {g.name: count[g.index] for g in body.vertex_groups})


def build(slug):
    import soldiers
    fit = FITS[slug]
    folder = os.path.join(pw.ASSETS, "models", "characters", slug)
    body = _mesh(folder, fit)
    arm = _fit(body, fit)
    _weigh(body, arm, fit.get("voxel"))
    if "cut" in fit:
        _cut(body, fit)
    arm = soldiers.to_base(arm, body)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, "model.blend"))
    print("wrote", slug, len(arm.data.bones), "bones")


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for slug in args or FITS:
    build(slug)
