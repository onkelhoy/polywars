"""Exports a .blend to .glb next to it (same name), for @papit/game-mesh.

  blender -b <file.blend> -P tools/blender/export.py [-- <out.glb>]

- Linked collection instances are made real (local mesh copies), so linked part files export.
- Objects parented to a bone become skinned meshes: vertex groups named like a bone keep their
  weights, every other vertex goes to the parent bone. game-mesh then animates them via the rig.
- Actions on NLA tracks (or the active one) export as glTF animations.
- Trailing holds (keys that no longer change anything) are cut off each action.
- Image textures are baked into vertex colours (game-mesh draws base colour x COLOR_0 only).
- An armature also writes `<out>.rig.json` (glTF drops bone lengths and constraints):
  { bones: { name: { length, deform } }, ik: [{ bone, chain, target, pole, weight }],
    copyRotation: [{ bone, target, weight }] }. Weights are the rest values (actions may key them).
"""
import bpy, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import pw
from mathutils import Matrix


def realize_instances():
    for empty in [o for o in bpy.data.objects if o.instance_type == "COLLECTION" and o.instance_collection]:
        for src in empty.instance_collection.all_objects:
            if src.type != "MESH":
                continue
            obj = bpy.data.objects.new(empty.name, src.data.copy())
            for vg in src.vertex_groups:
                obj.vertex_groups.new(name=vg.name)
            bpy.context.scene.collection.objects.link(obj)
            obj.matrix_world = empty.matrix_world @ src.matrix_world
            if empty.parent:
                world = obj.matrix_world.copy()
                obj.parent, obj.parent_type, obj.parent_bone = empty.parent, empty.parent_type, empty.parent_bone
                bpy.context.view_layer.update()
                obj.matrix_world = world
        bpy.data.objects.remove(empty)


def bones_to_skin():
    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent_type == "BONE" and o.parent]:
        arm, bone, world = obj.parent, obj.parent_bone, obj.matrix_world.copy()
        names = {b.name for b in arm.data.bones}
        for vg in list(obj.vertex_groups):
            if vg.name not in names:
                obj.vertex_groups.remove(vg)
        weighted = {v.index for v in obj.data.vertices if any(g.weight > 0 for g in v.groups)}
        target = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
        target.add([i for i in range(len(obj.data.vertices)) if i not in weighted], 1.0, "REPLACE")
        obj.parent, obj.parent_type = arm, "OBJECT"
        bpy.context.view_layer.update()
        obj.matrix_world = world
        mod = obj.modifiers.new("rig", "ARMATURE")
        mod.object = arm


def principled_materials():
    """glTF reads one Principled BSDF behind the material output. Older packs have several outputs
    (Cycles/EEVEE) and Diffuse BSDFs; each material is reduced to one output fed by a Principled
    BSDF (the linked one if any, else a new one with the diffuse colour)."""
    for mat in bpy.data.materials:
        nt = mat.node_tree
        if not nt:
            continue
        outputs = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"]
        fed = [o.inputs["Surface"].links[0].from_node for o in sorted(outputs, key=lambda o: not o.is_active_output) if o.inputs["Surface"].links]
        bsdf = next((n for n in fed if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            source = next((n for n in fed if "Color" in n.inputs), None)
            colour = source.inputs["Color"].default_value[:] if source else mat.diffuse_color[:]
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.inputs["Base Color"].default_value = colour
            bsdf.inputs["Roughness"].default_value = 1
        for o in outputs:
            nt.nodes.remove(o)
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        out.target = "ALL"
        out.is_active_output = True
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])


def textures_to_vertex_colours():
    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        me = obj.data
        if not me.uv_layers.active:
            continue
        images = {}
        for i, mat in enumerate(me.materials):
            if mat and mat.node_tree:
                for n in mat.node_tree.nodes:
                    if n.type == "TEX_IMAGE" and n.image and n.image.size[0]:
                        images[i] = n.image
        if not images:
            continue
        pixels = {i: (img.size[0], img.size[1], list(img.pixels)) for i, img in images.items()}
        col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        uv = me.uv_layers.active.data
        for poly in me.polygons:
            if poly.material_index not in pixels:
                continue
            w, h, px = pixels[poly.material_index]
            u = sum(uv[l].uv.x for l in poly.loop_indices) / poly.loop_total
            v = sum(uv[l].uv.y for l in poly.loop_indices) / poly.loop_total
            x, y = int((u % 1) * w) % w, int((v % 1) * h) % h
            k = (y * w + x) * 4
            c = px[k:k + 4]
            for l in poly.loop_indices:
                col.data[l].color = c
        me.color_attributes.active_color = col
        for i in images:  # colour now lives in COLOR_0; keep base colour white
            mat = me.materials[i].copy()
            me.materials[i] = mat
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf:
                for l in list(bsdf.inputs["Base Color"].links):
                    mat.node_tree.links.remove(l)
                bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)


def trim_actions():
    """Cuts trailing holds: a clip ends on the last frame where any curve still changes (packs key a still tail)."""
    for a in bpy.data.actions:
        curves = [c for layer in a.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
        if not curves:
            continue
        start, end = (int(round(f)) for f in a.frame_range)
        last = start
        prev = [c.evaluate(start) for c in curves]
        for f in range(start + 1, end + 1):
            now = [c.evaluate(f) for c in curves]
            if any(abs(x - y) > 1e-4 for x, y in zip(now, prev)):
                last = f
            prev = now
        if start < last and end - last >= max(4, (end - start) // 5):  # small tails are loop seams
            a.use_frame_range = True
            a.frame_start, a.frame_end = start, last
            print(f"trimmed {a.name}: {end} -> {last}")


def write_rig(arm, out):
    rig = {"bones": {}, "ik": [], "copyRotation": []}
    for b in arm.data.bones:
        rig["bones"][b.name] = {"length": round(b.length, 5), "deform": b.use_deform}
    for pb in arm.pose.bones:
        for c in pb.constraints:
            if c.type == "IK" and c.subtarget:
                ik = {"bone": pb.name, "chain": c.chain_count, "target": c.subtarget, "weight": round(c.influence, 4)}
                if c.pole_subtarget:
                    ik["pole"] = c.pole_subtarget
                rig["ik"].append(ik)
            elif c.type == "COPY_ROTATION" and c.subtarget:
                rig["copyRotation"].append({"bone": pb.name, "target": c.subtarget, "weight": round(c.influence, 4)})
    path = os.path.splitext(out)[0] + ".rig.json"
    with open(path, "w") as f:
        json.dump(rig, f, indent=1)
    print("wrote", os.path.relpath(path, pw.ROOT))


def export(out):
    arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    for arm in arms[:1]:
        write_rig(arm, out)
    for arm in arms:
        arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    trim_actions()
    realize_instances()
    bones_to_skin()
    principled_materials()
    textures_to_vertex_colours()
    for arm in arms:
        arm.data.pose_position = "POSE"
        for track in (arm.animation_data.nla_tracks if arm.animation_data else []):
            track.mute = False
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", export_yup=True, export_apply=True,
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
        export_skins=True, export_def_bones=False, export_lights=False, export_cameras=False,
        export_vertex_color="ACTIVE", export_image_format="NONE",
    )
    print("exported", os.path.relpath(out, pw.ROOT))


if __name__ == "__main__":
    a = pw.args()
    export(a[0] if a else os.path.splitext(bpy.data.filepath)[0] + ".glb")
