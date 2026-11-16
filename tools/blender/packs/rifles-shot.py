"""Contact sheet of gun / attachment model.blend files seen from the right (muzzle points right, up is up), labelled.

  blender -b -P tools/blender/packs/rifles-shot.py -- out.png <folder> [<folder> ...]
"""
import bpy, math, os, sys
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
out, folders = a[0], a[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
cols, gap_y, gap_z = 3, float(os.environ.get("GAP", 1.6)), float(os.environ.get("GAP", 1.6)) / 3.2
for i, f in enumerate(folders):
    with bpy.data.libraries.load(os.path.join(f, "model.blend")) as (src, dst):
        dst.objects = [n for n in src.objects]
    x, z = (i % cols) * gap_y, -(i // cols) * gap_z
    for o in dst.objects:
        if o and o.type == "MESH":
            sc.collection.objects.link(o)
            o.location = (0, x, z)
    t = bpy.data.curves.new("t", "FONT"); t.body = os.path.basename(f.rstrip("/")); t.size = gap_y * .0375
    to = bpy.data.objects.new("t", t); sc.collection.objects.link(to)
    to.location = (.3, x - gap_y * .37, z + gap_z * .28); to.rotation_euler = (math.pi / 2, 0, math.pi / 2)
rows = (len(folders) + cols - 1) // cols
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = cols * gap_y
cam.location = (5, (cols - 1) * gap_y / 2, -(rows - 1) * gap_z / 2); cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "MATERIAL"; sc.display.shading.light = "STUDIO"
sc.render.resolution_x = 2400; sc.render.resolution_y = int(2400 * rows * gap_z / (cols * gap_y)) + 40
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
