# Blender -b -P tools/blender/cut_rail.py : cut one sleeper out of RailwayTrack_Straight -> assets/models/transport/train/rail-sleeper.glb
# prints sleeper spacing + rail profile size (used by @polywar/rail presets)
import bpy, bmesh, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "assets/models/transport/train/RailwayTrack_Straight.glb")
OUT = os.path.join(ROOT, "assets/models/transport/train/rail-sleeper.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
o = next(x for x in bpy.data.objects if x.type == "MESH")
bpy.context.view_layer.objects.active = o
wood = [i for i, m in enumerate(o.data.materials) if m.name.lower().startswith("wood")][0]
bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
# sleeper centres: cluster wood face centres along x
xs = sorted(round(f.calc_center_median().x, 1) for f in bm.faces if f.material_index == wood)
groups = []
for x in xs:
    if groups and x - groups[-1][-1] < .5: groups[-1].append(x)
    else: groups.append([x])
centres = [sum(g) / len(g) for g in groups]
spacing = (centres[-1] - centres[0]) / (len(centres) - 1)
mid = min(centres, key=abs)
rail = [f for f in bm.faces if f.material_index != wood]
rz = max(v.co.z for f in rail for v in f.verts)
print("SLEEPERS", len(centres), "spacing", round(spacing, 3), "rail top", round(rz, 3), "rail y", sorted(set(round(v.co.y, 2) for f in rail for v in f.verts)))
# whole wood pieces (connected faces) whose centre is the middle sleeper
bm.faces.ensure_lookup_table(); seen = set(); kill = []
for f in bm.faces:
    if f.index in seen: continue
    stack, piece = [f], []
    while stack:
        g = stack.pop()
        if g.index in seen: continue
        seen.add(g.index); piece.append(g)
        for e in g.edges:
            for h in e.link_faces: stack.append(h)
    cx = sum(g.calc_center_median().x for g in piece) / len(piece)
    if piece[0].material_index != wood or abs(cx - mid) > spacing * .4: kill += piece
bmesh.ops.delete(bm, geom=kill, context="FACES")
for v in bm.verts: v.co.x -= mid
bm.to_mesh(o.data); bm.free()
o.location.x = 0
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True)
print("wrote", OUT)
