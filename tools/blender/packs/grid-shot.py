"""Guns from the right on a cm grid (lines every 5 cm, labels every 10 cm = gun-frame y / z in cm), one per row,
plus weapon.json points if any (red dots), to read / check positions by eye.

  blender -b -P tools/blender/packs/grid-shot.py -- out.png <folder> [<folder> ...]
"""
import bpy, json, math, os, sys
a = sys.argv[sys.argv.index("--") + 1:]
out, folders = a[0], a[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
W, H = 1.5, .3  # metres per row
def mat(name, rgb):
    m = bpy.data.materials.new(name); m.diffuse_color = (*rgb, 1); return m
grey, red, lab = mat("g", (.35, .35, .35)), mat("r", (1, 0, 0)), mat("l", (.7, .7, .2))
def box(x, y, z, sy, sz, m, sx=.001):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z)); o = bpy.context.object
    o.scale = (sx, sy, sz); o.data.materials.append(m)
def text(s, y, z, size=.012, m=lab):
    t = bpy.data.curves.new("t", "FONT"); t.body = s; t.size = size
    o = bpy.data.objects.new("t", t); sc.collection.objects.link(o); o.data.materials.append(m)
    o.location = (.2, y, z); o.rotation_euler = (math.pi / 2, 0, math.pi / 2)
for i, f in enumerate(folders):
    zc = -i * H
    blend = os.path.join(f, "gun.blend") if os.path.exists(os.path.join(f, "gun.blend")) else os.path.join(f, "model.blend")
    with bpy.data.libraries.load(blend) as (src, dst):
        dst.objects = list(src.objects)
    for o in dst.objects:
        if o and o.type == "MESH":
            sc.collection.objects.link(o); o.location = (0, 0, zc)
    for k in range(-14, 15):
        y = k * .05
        box(-.3, y, zc, .0006 if k % 2 else .0012, H, grey)
        if k % 2 == 0: text(str(k * 5), y + .002, zc - H / 2 + .01, .01)
    for k in range(-3, 4):
        box(-.3, 0, zc + k * .05, W * 1.4, .0006 if k % 2 else .0012, grey)
        text(str(k * 5), -W / 2 - .02, zc + k * .05 + .002, .01)
    text(os.path.basename(f.rstrip("/")), -W / 2 + .03, zc + H / 2 - .04, .02)
    j = os.path.join(f, "weapon.json")
    if os.path.exists(j):
        for name, p in json.load(open(j)).get("points", {}).items():
            # glTF (x, y up, -z muzzle) -> blender (x, -z, y)
            bpy.ops.mesh.primitive_uv_sphere_add(radius=.004, location=(p[0] + .1, -p[2], zc + p[1]))
            bpy.context.object.data.materials.append(red)
            text(name, -p[2] + .005, zc + p[1] + .005, .008, red)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = W
cam.location = (5, 0, -(len(folders) - 1) * H / 2); cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "MATERIAL"; sc.display.shading.light = "FLAT"
sc.world = bpy.data.worlds.new("w"); sc.world.color = (1, 1, 1)
sc.render.resolution_x = 2400; sc.render.resolution_y = int(2400 * len(folders) * H / W)
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
