"""Rebuilds the round paper targets in camp.blend as flat discs: rings are coplanar faces (paper / ink by material) on a
thin board, no stacked ring solids (z-fighting, many bullet boxes). Copies named `Target.50.A7.NNN` get their own
names back (Target.<distance>.<n>) from the old range.json by position. Saves the .blend.

  blender -b ~/Developer/3d/shooting-range/camp.blend -P tools/blender/packs/flat-targets.py -- <old range.json>
"""
import bpy, bmesh, json, math, sys
from mathutils import Vector

SEG, THICK = 32, .02
old = json.load(open(sys.argv[sys.argv.index("--") + 1]))["targets"] if "--" in sys.argv else []
old = [t for t in old if " post" not in t["name"]]

def targets():
    return [o for o in bpy.data.objects if o.type == "MESH" and (o.name.startswith("Target.") or o.name.startswith("Lane Target."))
            and " post" not in o.name and any(m and m.name == "Target ink" for m in o.data.materials)]

def bands(o):
    """ink annuli [(r0, r1)] in the board plane (xz), from the ink's loose parts; outer radius of the paper"""
    me = o.data
    c = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    ink = me.materials.find("Target ink")
    bm = bmesh.new(); bm.from_mesh(me)
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen or f.material_index != ink:
            continue
        stack, part = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop(); part.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen and h.material_index == ink:
                        seen.add(h.index); stack.append(h)
        rs = [math.hypot(v.co.x - c.x, v.co.z - c.z) for g in part for v in g.verts]
        out.append((min(rs), max(rs)))
    # half the board's width (the max radius would be a square board's corner)
    xs = [v.co.x for v in me.vertices]
    outer = (max(xs) - min(xs)) / 2
    bm.free()
    return c, sorted(out), outer

def rebuild(o):
    c, ink, outer = bands(o)
    me = o.data
    mats = {m.name: i for i, m in enumerate(me.materials)}
    radii = sorted({0.0, outer, *[r for b in ink for r in b]})
    radii = [r for i, r in enumerate(radii) if i == 0 or r - radii[i - 1] > .003]
    bm = bmesh.new()
    def ring(r, y):
        return [bm.verts.new((c.x + r * math.cos(2 * math.pi * k / SEG), y, c.z + r * math.sin(2 * math.pi * k / SEG))) for k in range(SEG)]
    for y, flip in ((c.y - THICK / 2, False), (c.y + THICK / 2, True)):
        centre = bm.verts.new((c.x, y, c.z))
        prev = None
        for i in range(1, len(radii)):
            mid = (radii[i - 1] + radii[i]) / 2
            m = mats["Target ink"] if any(a - .002 <= mid <= b + .002 for a, b in ink) else mats["Target paper"]
            cur = ring(radii[i], y)
            for k in range(SEG):
                q = [centre, cur[k], cur[(k + 1) % SEG]] if prev is None else [prev[k], cur[k], cur[(k + 1) % SEG], prev[(k + 1) % SEG]]
                f = bm.faces.new(q[::-1] if flip else q); f.material_index = m
            prev = cur
        if flip: back = prev
        else: front = prev
    for k in range(SEG):
        f = bm.faces.new([front[k], front[(k + 1) % SEG], back[(k + 1) % SEG], back[k]]); f.material_index = mats["Target paper"]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if o.data.users > 1:
        o.data = o.data.copy()
    bm.to_mesh(o.data); bm.free()

done = set()
for o in targets():
    if o.data.name not in done or o.data.users == 1:
        rebuild(o); done.add(o.data.name)

# names back: the old target nearest in game x / z (blender x, -y)
taken = {o.name for o in bpy.data.objects}
for o in targets():
    if not o.name.startswith("Target.50.A7."):
        continue
    w = o.matrix_world @ (sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices))
    best = min(old, key=lambda t: math.hypot((t["min"][0] + t["max"][0]) / 2 - w.x, (t["min"][2] + t["max"][2]) / 2 + w.y), default=None)
    if best and best["name"] not in taken:
        o.name = best["name"]; taken.add(best["name"])
        print("renamed ->", o.name)
    else:
        print("kept", o.name)
bpy.ops.wm.save_mainfile()
