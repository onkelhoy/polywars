"""Imports model files into one new .blend (parts stay separate objects), or straight to .glb.

  blender -b -P tools/blender/import.py -- <out.blend|out.glb> <file.fbx|.obj|.glb|.gltf> [...] [--texture=<image>]

  blender -b -P tools/blender/import.py -- <out-folder> <files...> --each      one .glb per file

--texture: the pack's palette texture, wired into every material's base colour (FBX packs often drop it).

Each file's objects are named after the file. Textures referenced by the files are kept, export.py
bakes them into vertex colours. Writing a .glb runs the same export as export.py.
"""
import bpy, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import pw

IMPORT = {
    ".fbx": lambda f: bpy.ops.import_scene.fbx(filepath=f),
    ".obj": lambda f: bpy.ops.wm.obj_import(filepath=f),
    ".glb": lambda f: bpy.ops.import_scene.gltf(filepath=f),
    ".gltf": lambda f: bpy.ops.import_scene.gltf(filepath=f),
}


def main():
    a = pw.args()
    texture = next((x.split("=", 1)[1] for x in a if x.startswith("--texture=")), None)
    each = "--each" in a
    a = [x for x in a if not x.startswith("--")]
    out, files = a[0], a[1:]
    if each:
        for f in files:
            build([f], os.path.join(out, os.path.splitext(os.path.basename(f))[0] + ".glb"), texture)
    else:
        build(files, out, texture)


def build(files, out, texture):
    pw.empty_file()
    for f in files:
        before = set(bpy.data.objects)
        IMPORT[os.path.splitext(f)[1].lower()](f)
        new = [o for o in bpy.data.objects if o not in before]
        meshes = [o for o in new if o.type == "MESH"]
        base = os.path.splitext(os.path.basename(f))[0]
        for i, o in enumerate(meshes):
            o.name = base if len(meshes) == 1 else f"{base}.{i}"
        for o in new:
            if o.type in ("CAMERA", "LIGHT"):
                bpy.data.objects.remove(o)
    if texture:
        image = bpy.data.images.load(os.path.abspath(texture))
        for mat in bpy.data.materials:
            if not mat.node_tree:
                continue
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not bsdf:
                continue
            node = mat.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = image
            mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    if out.endswith(".glb"):
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import export
        export.export(os.path.abspath(out))
    else:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out), relative_remap=True)
        print("saved", os.path.relpath(out, pw.ROOT))


main()
