"""Make a textured material a crisp two sided cut-out (fences, nets, leaves): alpha wired, pixel sharp, both faces drawn.

Run inside Blender (Scripting tab > open this file > Run Script). Fixes the active object's materials,
or the material named in NAME if set.
"""
import bpy

NAME = ""  # e.g. "MetalFence"; empty = materials of the active object

mats = [bpy.data.materials[NAME]] if NAME else [s.material for s in bpy.context.active_object.material_slots if s.material]
for m in mats:
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    for tex in (n for n in nodes if n.type == "TEX_IMAGE"):
        tex.interpolation = "Closest"  # 32 px stays pixel sharp
        if tex.image: tex.image.alpha_mode = "STRAIGHT"
        if not bsdf.inputs["Alpha"].is_linked:
            links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    m.use_backface_culling = False  # both sides
    if hasattr(m, "surface_render_method"): m.surface_render_method = "DITHERED"  # EEVEE Next: cut-out
    else: m.blend_method = "CLIP"
    if hasattr(m, "use_transparent_shadow"): m.use_transparent_shadow = True
    print("fixed", m.name)
