"""The shooting range (owner's ~/Developer/3d/shooting-range/camp.blend, made by camp-layout.py) -> @polywar/training-camp asset.

  blender -b --disable-autoexec ~/Developer/3d/shooting-range/camp.blend -P tools/blender/packs/shooting-range.py

The .blend is never saved. Writes packages/game/training-camp/asset/training-camp/model.glb (via export.py) and range.json:
  { ground: [[x,y,z]*3, ...] triangles, props: { <model>: [[x, y, z, yaw, scale], ...] }, solids: [{ min, max, surface, name }], stands: [{ at, yaw }],
    targets: [{ name, distance, min, max }], vehicles: [{ kind, at, yaw }], spawn: [x,y,z] }   (game space: y up, the range runs down -z)
Roles come from object names (ROLES below): rename in Blender, export again.
Instanced props (range.json `props`, `rigged`), drawn instanced at runtime, out of model.glb:
- an empty with an `asset` property (assets/models/<asset>.glb, e.g. vehicles/tanks/Tank; optional `box` for its solid)
- a mesh linked from camp-props.blend -> its own asset (assets/models/props/camp/, camp-props-export.py)
- a mesh shared by several objects here (Alt+D) -> props/<mesh>.glb next to model.glb
Only objects turned around z with an even scale; earth / ground pieces stay in the model (painted like the terrain).
"""
import bpy, json, math, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mathutils import Vector
import pw
import export as exporter

OUT = os.path.join(pw.ROOT, "packages/game/training-camp/asset/training-camp")

# object name (prefix) -> role. ground: walkable height; stand: a gun case (a gun floats over it); target: scored
# steps: walkable stairs (a box per step); anything else is solid
ROLES = [
    ("Grass.", "grass"),
    ("Ground", "ground"),
    ("Berm", "ground"),
    ("Bunker earth bank", "ground"),
    ("Bunker roof earth", "decor"),
    ("Stand.", "stand"),
    ("Target.", "target"),
    ("Button base", "decor"),
    ("Flag Flag cloth", "decor"),
    ("Flag Flag gravel", "decor"),
    ("Tent", "decor"),
    ("Armory lamp", "decor"),
    ("Rock.c", "solid"),
    ("Road", "decor"),
    ("Rail.", "decor"),
    ("Tree.", "decor"),
    ("Lane Target.", "target"),
    ("Carrier.", "carrier"),
    ("Button.near.", "button"),
    ("Button.far.", "button"),
    ("Scope.fixed.", "optic"),
    ("Binoculars.", "optic"),
    ("Single Target.001", "ground"),
    ("Single Target.012", "solid"),
    ("Single Target", "solid"),
    ("Single Target.", "target"),
    ("Object_4", "stand"),
    ("Moving Target-guy", "target"),
    ("Target(Square)", "target"),
    ("stairs", "steps"),
    ("Jeep", "vehicle"),
]
# vehicle role prefix -> asset (assets/models/vehicles/<kind>); drawn and driven at runtime, not in the glb
VEHICLES = {"Jeep": "willys-jeep"}
# asset empties that are ridden / driven at runtime: asset -> (vehicle kind, the asset's nose yaw in its own space)
# (the old motorcycle glb had its nose on +x: yaw -pi/2; vehicle yaw 0 = nose +y, + turns left)
ASSET_VEHICLES = {"vehicles/ww2-motorcycle/model": ("ww2-motorcycle", -math.pi / 2)}
# one box per object, whatever its parts
LUMPS = ("Rock.", "Sandbag", "Crate", "Barrel", "Flag stone", "Fence barbed", "Tank ", "Truck ", "Motorbike ", "Artillery ", "Fighter ", "Bomber")
# objects without a material get one (colour)
PAINT = {"Single Target.001": (.30, .36, .20, 1), "Moving Target-guy": (.80, .70, .52, 1), "Single Target.008": (.27, .19, .06, 1)}
# material name -> surface (bullet marks, case sounds)
SURFACES = [("concrete", "stone"), ("wood", "wood"), ("metal", "metal"), ("target", "wood")]
# hollow parts get a box per face (the booths: two sides + a table as one piece); others a box per loose part
HOLLOW = {"Single Target.012", "Armory walls", "Bunker B"}
# gun cases are dense: kept at this share of their faces
DECIMATE = {"Object_5": .12, "Object_4": .5, "Gorebox": .4}


def role(name):
    """exact name first, then the longest prefix"""
    exact = next((r for p, r in ROLES if name == p), None)
    if exact:
        return exact
    hits = sorted(((p, r) for p, r in ROLES if name.startswith(p)), key=lambda x: -len(x[0]))
    return hits[0][1] if hits else "solid"


def steps(obj):
    """a box per tread (face pointing up): from the stairs' floor up to the tread, over the tread's whole extent (no gaps)"""
    lo = pw.world_bbox(obj)[0]
    M, R, out = obj.matrix_world, obj.matrix_world.to_3x3(), []
    for p in obj.data.polygons:
        if (R @ p.normal).normalized().z <= .9:
            continue
        plo, phi = pw.bbox(M @ obj.data.vertices[i].co for i in p.vertices)
        if phi.z <= lo.z + .01:
            continue
        plo.z = lo.z
        out.append(box(plo, phi))
    return out


def face_boxes(obj, thin=.03):
    """a thin world box per face: flat things (targets) hit only where they are, not in the gaps"""
    M, me, out = obj.matrix_world, obj.data, []
    for p in me.polygons:
        if p.area < 1e-4:
            continue
        lo, hi = pw.bbox(M @ me.vertices[i].co for i in p.vertices)
        for k in range(3):
            if hi[k] - lo[k] < thin:
                c = (hi[k] + lo[k]) / 2
                lo[k], hi[k] = c - thin / 2, c + thin / 2
        out.append((lo, hi))
    return out


def part_boxes(obj, fill=.6, thin=.03):
    """world boxes per loose part: the part's box when it's small or fills it (`fill` of its volume), else a box per face
    (hollow buildings: halls, bunkers, rooms stay walkable). HOLLOW objects: every part tested, small ones too"""
    M, me, out = obj.matrix_world, obj.data, []
    for part in pw.loose_parts(me):
        verts = set(part)
        faces = [p for p in me.polygons if p.vertices[0] in verts]
        pts = [M @ me.vertices[i].co for i in part]
        lo, hi = pw.bbox(pts)
        vol = 0
        for p in faces:
            vs = [M @ me.vertices[i].co for i in p.vertices]
            vol += sum(vs[0].dot(vs[i].cross(vs[i + 1])) for i in range(1, len(vs) - 1)) / 6
        size = hi - lo
        if obj.name not in HOLLOW and size.length < 2.5:
            out.append((lo, hi))
            continue
        if abs(vol) >= fill * max(size.x * size.y * size.z, 1e-9):
            out.append((lo, hi))
            continue
        for p in faces:
            if p.area < 1e-3:
                continue
            flo, fhi = pw.bbox(M @ me.vertices[i].co for i in p.vertices)
            for k in range(3):
                if fhi[k] - flo[k] < thin:
                    c = (fhi[k] + flo[k]) / 2
                    flo[k], fhi[k] = c - thin / 2, c + thin / 2
            out.append((flo, fhi))
    # drop boxes inside another
    out.sort(key=lambda b: -(b[1] - b[0]).length)
    kept = []
    for b in out:
        if not any(all(k[0][i] - 1e-4 <= b[0][i] and b[1][i] <= k[1][i] + 1e-4 for i in range(3)) for k in kept):
            kept.append(b)
    return kept


def surface(obj, index=0):
    mats = obj.data.materials
    m = mats[index] if index < len(mats) and mats[index] else None
    n = (m.name if m else obj.name).lower()
    return next((s for k, s in SURFACES if k in n), "metal" if "barrel" in obj.name.lower() else "dirt" if role(obj.name) == "ground" else "wood")


def game(v):
    """Blender z-up -> glTF y-up (the range runs along blender +y = game -z)"""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


GLOW = "Lamp glow"


def lamp_lights(color=(1, .78, .5), strength=1.6, range_=9):
    """a point light per loose part with the GLOW material (the bulbs), game space"""
    out = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or GLOW not in [m.name for m in obj.data.materials if m]:
            continue
        me, M, g = obj.data, obj.matrix_world, obj.data.materials.find(GLOW)
        faces = [p for p in me.polygons if p.material_index == g]
        # loose parts of the glow faces (shared vertices)
        parent = {}
        def find(a):
            while parent.setdefault(a, a) != a:
                a = parent[a]
            return a
        for p in faces:
            for v in p.vertices[1:]:
                parent[find(v)] = find(p.vertices[0])
        parts = {}
        for p in faces:
            for v in p.vertices:
                parts.setdefault(find(v), set()).add(v)
        for vs in parts.values():
            c = sum((M @ me.vertices[v].co for v in vs), Vector()) / len(vs)
            out.append({"name": obj.name, "position": game(c), "color": list(color), "strength": strength, "range": range_})
    return out


def box(lo, hi):
    a, b = game(lo), game(hi)
    return [min(a[k], b[k]) for k in range(3)], [max(a[k], b[k]) for k in range(3)]


def colour_maps_only():
    """export.py bakes any image into vertex colours; keep only images that feed a Base Color (not normal / roughness maps)"""
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        nodes, keep = mat.node_tree.nodes, set()
        for n in nodes:
            if n.type == "BSDF_PRINCIPLED":
                stack = [l.from_node for l in n.inputs["Base Color"].links]
                while stack:
                    x = stack.pop()
                    keep.add(x.name)
                    stack += [l.from_node for i in x.inputs for l in i.links]
        for n in [n for n in nodes if n.type == "TEX_IMAGE" and n.name not in keep]:
            nodes.remove(n)


def paint():
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or any(obj.data.materials):
            continue
        colour = next((c for p, c in PAINT.items() if obj.name.startswith(p)), (.6, .6, .6, 1))
        mat = bpy.data.materials.new(f"paint {obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = colour
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def decimate():
    for obj in bpy.context.scene.objects:
        ratio = next((r for p, r in DECIMATE.items() if obj.type == "MESH" and obj.name.startswith(p)), None)
        if ratio:
            mod = obj.modifiers.new("lod", "DECIMATE")
            mod.ratio = ratio  # applied by the glTF export (export_apply)


def points():
    data = {"ground": [], "solids": [], "stands": [], "targets": [], "buttons": [], "carriers": [], "optics": [], "grass": [], "vehicles": [], "lights": [], "spawn": None}
    # ridable asset empties -> vehicles (data only: not drawn as props, no solid)
    for o in [o for o in bpy.context.scene.objects if o.type == "EMPTY" and o.get("asset") in ASSET_VEHICLES]:
        kind, nose = ASSET_VEHICLES[o["asset"]]
        z = o.matrix_world.to_euler().z + nose
        data["vehicles"].append({"name": o.name, "kind": kind, "at": game(o.matrix_world.translation), "yaw": round(math.atan2(math.sin(z), math.cos(z)), 4)})
        bpy.data.objects.remove(o)
    for obj in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if obj.type != "MESH" or not obj.data.polygons:
            continue
        r, M = role(obj.name), obj.matrix_world
        if r == "ground":
            for p in obj.data.polygons:
                vs = [game(M @ obj.data.vertices[i].co) for i in p.vertices]
                data["ground"] += [[vs[0], vs[i], vs[i + 1]] for i in range(1, len(vs) - 1)]
            continue
        if r == "steps":
            data["solids"] += [{"name": obj.name, "min": mn, "max": mx, "surface": surface(obj)} for mn, mx in steps(obj)]
            continue
        if r == "decor":
            continue
        if r == "vehicle":
            # the camp's jeep mesh keeps the store's nose (-y); the vehicle's yaw 0 is nose +y (game -z), + turns left
            kind = next(k for p, k in VEHICLES.items() if obj.name.startswith(p))
            yaw = math.atan2(math.sin(M.to_euler().z + math.pi), math.cos(M.to_euler().z + math.pi))
            data["vehicles"].append({"name": obj.name, "kind": kind, "at": game(M.translation), "yaw": round(yaw, 4)})
            continue
        if r == "grass":
            lo, hi = box(*pw.world_bbox(obj))
            data["grass"].append({"kind": obj.get("grass", obj.name.split(".")[1]), "min": [lo[0], lo[2]], "max": [hi[0], hi[2]]})
            continue
        lo, hi = pw.world_bbox(obj)
        if r == "button":
            data["buttons"].append({"name": obj.name, "lane": int(obj.get("lane", 0)), "dir": -1 if ".near." in obj.name else 1, "min": box(lo, hi)[0], "max": box(lo, hi)[1]})
            continue
        if r == "optic":
            eye = obj.get("eye")
            data["optics"].append({"name": obj.name, "kind": "fixed" if obj.name.startswith("Scope.") else "binoculars", "zoom": float(obj.get("zoom", 7)),
                                   "at": game((lo + hi) / 2), "eye": game(Vector(eye)) if eye else None})
            continue
        if r == "carrier":
            data["carriers"].append({"name": obj.name, "min": box(lo, hi)[0], "max": box(lo, hi)[1]})
            if obj.get("stops"):
                data["stops"] = [int(v) for v in obj["stops"]]
        if r == "stand":
            top = (lo + hi) / 2
            top.z = hi.z
            data["stands"].append({"name": obj.name, "at": game(top), "yaw": 0})
        if r == "target":
            mn, mx = box(lo, hi)
            data["targets"].append({"name": obj.name, "distance": round(-(mn[2] + mx[2]) / 2 + 1), "min": mn, "max": mx})
        # one box for small things, one per loose part for big ones (walls, rails); hollow parts (a booth: two
        # sides + a table) one thin box per face, so the gap between stays open
        kind = "flesh" if "guy" in obj.name.lower() else surface(obj)
        lump = obj.name.startswith(LUMPS)
        if lump:
            # one box, shrunk a little (rocks are round, bank walls straight)
            c, h = (lo + hi) / 2, (hi - lo) / 2 * (.8 if obj.name.startswith("Rock") else 1)
            lo, hi = c - h, c + h
        for plo, phi in ([(lo, hi)] if lump else [(lo, hi)] if (hi - lo).length < 3 else part_boxes(obj)):
            if (phi - plo).length >= .05:
                mn, mx = box(plo, phi)
                data["solids"].append({"name": obj.name, "min": mn, "max": mx, "surface": kind})
    # spawn: behind the middle case, facing down the range
    xs = sorted(s["at"][0] for s in data["stands"]) or [0]
    z = max((s["at"][2] for s in data["stands"]), default=0)
    data["lights"] = lamp_lights()
    data["spawn"] = [round(xs[len(xs) // 2], 3), 0, round(z - 1.5, 3)]
    # at the flag (beside its gravel, toward the range); without a flag the `Spawn` empty
    pole = bpy.data.objects.get("Flag Flag pole")
    if pole:
        lo, hi = pw.world_bbox(pole)
        data["spawn"] = game(Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2 + 3.5, 0)))
    sp = None if pole else bpy.data.objects.get("Spawn")
    if sp:
        data["spawn"] = game(sp.matrix_world.translation)
    data["stands"].sort(key=lambda s: s["at"][0])
    return data


ASSETS = os.path.join(pw.ROOT, "assets/models")
# linked .blend -> its exported asset folder (assets/models/...), one glb per object (camp-props-export.py)
LIBRARY_ASSETS = {"camp-props": "props/camp"}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def library_objects():
    """per linked library mesh, the library object using it (its asset is named after the object)"""
    out = {}
    for lib in bpy.data.libraries:
        with bpy.data.libraries.load(lib.filepath, link=True) as (src, dst):
            dst.objects = list(src.objects)
        for o in dst.objects:
            if o and o.type == "MESH":
                out.setdefault(o.data, o.name)
    return out


def rigged(key):
    """a global asset glb with a skin (drawn one by one at runtime, rest pose)"""
    path = os.path.join(pw.ROOT, key + ".glb")
    if not os.path.exists(path):
        return False
    with open(path, "rb") as f:
        head = f.read(20)
        n = int.from_bytes(head[12:16], "little")
        return bool(json.loads(f.read(n)).get("skins"))


def flat(o):
    """turned around z only, even scale: [loc, yaw, scale], else None"""
    loc, rot, sc = o.matrix_world.decompose()
    e = rot.to_euler()
    if abs(e.x) > 1e-3 or abs(e.y) > 1e-3 or max(sc) - min(sc) > 1e-3 or min(sc) <= 0:
        return None
    return loc, e.z, sc.x


def props(owners):
    """the instanced copies { key: [[x y z yaw scale], ...] }, local meshes to export { key: mesh }, objects to drop.
    key: a global asset (assets/models/<path>, no .glb) or a mesh only this blend has (props/<key>.glb next to model.glb).
    Global: an empty with an `asset` property (e.g. vehicles/tanks/Tank), or a mesh linked from a library in
    LIBRARY_ASSETS. Local: a mesh shared by several objects (Alt+D)."""
    out, meshes, drop = {}, {}, []
    scene = bpy.context.scene.objects
    users = {}
    for o in scene:
        if o.type == "MESH":
            users[o.data] = users.get(o.data, 0) + 1
    for o in scene:
        if o.parent:
            continue
        t = flat(o)
        if o.type == "EMPTY" and o.get("asset"):
            if not t:
                print("skipped (tilted / uneven scale):", o.name)
                continue
            key = "assets/models/" + o["asset"]
        elif o.type == "MESH" and o.data.polygons and role(o.name) in ("decor", "solid") \
                and not re.search(r"earth|^berm|^ground", o.name, re.I) and not o.modifiers and t:
            lib = o.data.library and os.path.splitext(os.path.basename(o.data.library.filepath))[0]
            if lib in LIBRARY_ASSETS and o.data in owners:
                key = f"assets/models/{LIBRARY_ASSETS[lib]}/{slug(owners[o.data])}"
            elif users[o.data] > 1 and not o.data.library:
                key = slug(o.data.name)
                meshes[key] = o.data
            else:
                continue
        else:
            continue
        loc, yaw, scale = t
        out.setdefault(key, []).append([*game(loc), round(yaw, 4), round(scale, 4)])
        drop.append(o)
    return out, meshes, drop


def asset_solids():
    """a box per asset empty (its `box`: min xyz, max xyz in the asset's own space)"""
    out = []
    for o in bpy.context.scene.objects:
        if o.type == "EMPTY" and o.get("box"):
            b = list(o["box"])
            corners = [o.matrix_world @ Vector((x, y, z)) for x in (b[0], b[3]) for y in (b[1], b[4]) for z in (b[2], b[5])]
            g = [game(c) for c in corners]
            surface = "metal"
            out.append({"name": o.name, "min": [min(c[i] for c in g) for i in range(3)], "max": [max(c[i] for c in g) for i in range(3)], "surface": surface})
    return out


def export_props(meshes):
    """each local prop mesh alone, in its own space, through the same export (colours, textures)"""
    folder = os.path.join(OUT, "props")
    os.makedirs(folder, exist_ok=True)
    for f in os.listdir(folder):
        if f.endswith(".glb") and f[:-4] not in meshes:
            os.remove(os.path.join(folder, f))
    for o in list(bpy.context.scene.objects):
        bpy.data.objects.remove(o)
    for key, me in meshes.items():
        o = bpy.data.objects.new(key, me.copy())
        bpy.context.scene.collection.objects.link(o)
        exporter.export(os.path.join(folder, key + ".glb"))
        bpy.data.objects.remove(o)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    owners = library_objects()
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    colour_maps_only()
    paint()
    data = points()
    data["props"], prop_meshes, dropped = props(owners)
    data["solids"] += asset_solids()
    data["rigged"] = [k for k in data["props"] if "/" in k and rigged(k)]
    with open(os.path.join(OUT, "range.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"range.json: {len(data['ground'])} ground tris, {len(data['solids'])} solids, {len(data['stands'])} stands, {len(data['targets'])} targets")
    # grass zones and vehicles are data only
    for obj in [o for o in bpy.context.scene.objects if role(o.name) in ("grass", "vehicle")]:
        bpy.data.objects.remove(obj)
    for obj in dropped:
        bpy.data.objects.remove(obj)
    print(f"props: {len(prop_meshes)} models, {sum(len(v) for v in data['props'].values())} instances")
    decimate()
    exporter.export(os.path.join(OUT, "model.glb"))
    export_props(prop_meshes)
