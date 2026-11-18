"""Rebuilds the paper targets in camp.blend as classic square boards: a thin box, the front (facing the firing line,
blender -y) UV'd 0..1 with the ring texture (assets/textures/range/target-rings.png, made here), the rest plain paper.
The ring material is marked `texture` so export.py keeps it as a real texture (not baked to vertex colours).
Keeps each target's centre and width. Saves the .blend.

  blender -b ~/Developer/3d/shooting-range/camp.blend -P tools/blender/packs/flat-targets.py
"""
import bpy, bmesh, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
import pw

THICK, SIZE = .02, 512
PNG = os.path.join(pw.ROOT, "assets/textures/range/target-rings.png")


def rings():
    """white paper, black centre disc with white rings in it, thin black rings outside (radius 1 = board half width)"""
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    r = np.hypot(x - SIZE / 2 + .5, y - SIZE / 2 + .5) / (SIZE / 2)
    ink = r < .5
    for a in (.1, .2, .3, .4):
        ink &= abs(r - a) > .008
    for a in (.6, .7, .8, .9):
        ink |= abs(r - a) < .007
    c = np.where(ink, .06, .93)
    px = np.stack([c, c, c * .97, np.ones_like(c)], -1).astype(np.float32)
    img = bpy.data.images.get("target-rings") or bpy.data.images.new("target-rings", SIZE, SIZE)
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = PNG
    img.file_format = "PNG"
    img.save()
    img.filepath = PNG
    return img


def face_material(img):
    m = bpy.data.materials.get("Target face") or bpy.data.materials.new("Target face")
    m.use_nodes = True
    m["texture"] = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None) or nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1
    return m


def targets():
    return [o for o in bpy.data.objects if o.type == "MESH" and (o.name.startswith("Target.") or o.name.startswith("Lane Target."))
            and " post" not in o.name and any(m and m.name in ("Target ink", "Target face") for m in o.data.materials)]


face = face_material(rings())
paper = bpy.data.materials["Target paper"]
for o in targets():
    me = o.data
    xs, ys, zs = ([v.co[k] for v in me.vertices] for k in range(3))
    cx, cy, cz = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2
    h = (max(xs) - min(xs)) / 2
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x, v.co.y, v.co.z = cx + v.co.x * 2 * h, cy + v.co.y * THICK, cz + v.co.z * 2 * h
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        f.material_index = 0
        if f.normal.y < -.9:
            f.material_index = 1
            for l in f.loops:
                l[uv].uv = ((l.vert.co.x - cx) / (2 * h) + .5, (l.vert.co.z - cz) / (2 * h) + .5)
    if me.users > 1:
        o.data = me = me.copy()
    me.materials.clear()
    me.materials.append(paper)
    me.materials.append(face)
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    bm.to_mesh(me)
    bm.free()
    print("board", o.name, round(2 * h * o.scale.x, 2))
bpy.ops.wm.save_mainfile()
