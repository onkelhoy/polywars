"""Render generator output to a PNG, to check assemblies without a browser.
blender -b -P tools/blender/render_pieces.py -- pieces.json out.png [yaw=35] [pitch=30] [width=900] [height=600]
pieces.json: [{ "piece": name, "matrix": 16 numbers (glTF, column-major), "file"?: path to glb }]
Default file: assets/models/buildings/modular-village/<piece>.glb
"""
import bpy, json, sys, math, os
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
src, out = args[0], args[1]
opt = dict(a.split("=") for a in args[2:])
yaw, pitch = math.radians(float(opt.get("yaw", 35))), math.radians(float(opt.get("pitch", 30)))
W, H = int(opt.get("width", 900)), int(opt.get("height", 600))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KIT = os.path.join(ROOT, "assets/models/buildings/modular-village")

bpy.ops.wm.read_factory_settings(use_empty=True)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # glTF Y up -> Blender Z up
Ci = C.inverted()
loaded = {}
def load(path):
    if path not in loaded:
        before = set(bpy.data.objects)
        try: bpy.ops.import_scene.gltf(filepath=path)
        except Exception as e: print("MISSING", path, e); loaded[path] = []; return []
        new = [o for o in bpy.data.objects if o not in before]
        loaded[path] = [(o.data, o.matrix_world.copy()) for o in new if o.type == "MESH"]
        for o in new: bpy.data.objects.remove(o)
    return loaded[path]

lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for p in json.load(open(src)):
    path = p.get("file") or os.path.join(KIT, p["piece"] + ".glb")
    if not os.path.isabs(path): path = os.path.join(ROOT, path)
    m = p["matrix"]
    M = C @ Matrix([m[0:16:4], m[1:16:4], m[2:16:4], m[3:16:4]]) @ Ci
    for data, local in load(path):
        o = bpy.data.objects.new(p["piece"], data)
        o.matrix_world = M @ local
        bpy.context.scene.collection.objects.link(o)
        for c in o.bound_box:
            v = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))

scene = bpy.context.scene
center, size = (lo + hi) / 2, (hi - lo).length
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
cam.data.type = "ORTHO"; cam.data.ortho_scale = size * float(opt.get("zoom", 1)); cam.data.clip_end = size * 10
d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
cam.location = center + d * size * 3
cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.engine = "BLENDER_WORKBENCH"
sh = scene.display.shading
sh.light = "STUDIO"; sh.color_type = "TEXTURE"; sh.show_shadows = True; sh.show_cavity = True; sh.shadow_intensity = .35
scene.display.light_direction = (.4, .5, .75)
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.image_settings.file_format = "JPEG" if out.endswith(".jpg") else "PNG"
scene.render.filepath = os.path.abspath(out)
bpy.ops.render.render(write_still=True)
print("RENDERED", out, "bounds", [round(v, 2) for v in (*lo, *hi)])
