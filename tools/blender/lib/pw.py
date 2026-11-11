"""Shared Blender helpers for polywar asset scripts. Run inside Blender (`blender -b -P ...`)."""
import bpy, bmesh, mathutils, os
from mathutils import Matrix, Vector

BLENDER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(BLENDER_DIR))
ASSETS = os.path.join(ROOT, "assets")


def args():
    import sys
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


bpy.context.preferences.filepaths.save_version = 0


def empty_file():
    bpy.ops.wm.read_homefile(use_empty=True)
    return bpy.context.scene


def append_object(blend, name):
    """Append one object (with mesh + materials) from another .blend into the current file."""
    with bpy.data.libraries.load(blend, link=False) as (src, dst):
        dst.objects = [name]
    obj = dst.objects[0]
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()  # matrix_world is only evaluated after this
    return obj


def loose_parts(mesh):
    """Vertex index lists per connected piece, largest first (stable order)."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    seen, parts = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        while stack:
            x = stack.pop()
            if x.index in seen:
                continue
            seen.add(x.index)
            comp.append(x.index)
            stack += [e.other_vert(x) for e in x.link_edges]
        parts.append(comp)
    bm.free()
    parts.sort(key=lambda p: -len(p))
    return parts


def bbox(points):
    pts = list(points)
    lo = Vector([min(p[k] for p in pts) for k in range(3)])
    hi = Vector([max(p[k] for p in pts) for k in range(3)])
    return lo, hi


def world_bbox(obj, indices=None):
    M = obj.matrix_world
    vs = obj.data.vertices
    return bbox(M @ vs[i].co for i in (indices if indices is not None else range(len(vs))))


def bake(obj, matrix):
    """Apply matrix to the mesh data and reset the object transform."""
    obj.data.transform(matrix)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()


def delete_vertices(obj, indices):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in indices], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def save_part(obj, name, path):
    """Rename object/mesh, put it in a collection named `name`, save as its own .blend."""
    scene = bpy.context.scene
    coll = bpy.data.collections.new(name)
    scene.collection.children.link(coll)
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj.name = name
    obj.data.name = name
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, relative_remap=True)
    print("saved", os.path.relpath(path, ROOT))


def link_collection(blend, name, instance_name=None):
    """Link a collection from another .blend (relative path) and return an instance empty for it."""
    with bpy.data.libraries.load(blend, link=True, relative=True) as (src, dst):
        dst.collections = [name]
    coll = dst.collections[0]
    empty = bpy.data.objects.new(instance_name or name, None)
    empty.instance_type = "COLLECTION"
    empty.instance_collection = coll
    empty.empty_display_size = 0.01
    bpy.context.scene.collection.objects.link(empty)
    return empty


def parent_to_bone(obj, armature, bone, world):
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = world
