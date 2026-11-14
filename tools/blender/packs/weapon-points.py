"""Guesses gun / scope points from the mesh (gun frame: muzzle +Y, up +Z, right +X) into weapon.json / scope.json.

  blender -b -P tools/blender/packs/weapon-points.py -- <gun or scope folder> [...] [--force]

Points are written in glTF model space (x right, y up, muzzle -z), metres. Existing keys are kept (hand edits win)
unless --force. Check guns with grid-shot.py (red dots). Rigged guns (gun.blend next to model.blend) read gun.blend.
Long guns:
- trigger: 33 cm in front of the butt (length of pull), just above the guard bottom
- front: highest point in the front 12 % near the centre plane (the front sight tip)
- rear: what the eye sees over from the front sight: the point with the steepest line to it (rear sight top)
- notch: the aim point, 4 mm under `rear`, raised until nothing between the eye and it stands over the sight line
- all on the bore's x (centre of the front 3 %); muzzle: bore centre at the front end; eject: right side of the receiver top; mount: receiver top (scope rings)
- grip: firing hand (middle of the wrist 6 cm behind the trigger); fore: support hand, under the fore end
Scopes (folders under attachments/):
- eyepiece: back end on the tube axis; objective: front end; mount: under the rings (lowest point)
"""
import bpy, json, os, sys

a = sys.argv[sys.argv.index("--") + 1:]
force = "--force" in a
folders = [x for x in a if not x.startswith("--")]
PULL = .33
DROP, CHEEK = .004, .12  # keep in step with @polywar/player holds.ts


def gltf(p):
    return [round(p[0], 4), round(p[2], 4), round(-p[1], 4)]


def save(f, file, points):
    path = os.path.join(f, file)
    data = json.load(open(path)) if os.path.exists(path) else {}
    pts = data.setdefault("points", {})
    for k, v in points.items():
        if force or k not in pts:
            pts[k] = gltf(v)
    json.dump(data, open(path, "w"), indent=2)
    print("points", os.path.basename(f.rstrip("/")))


def scope(f, vs):
    y0, y1 = min(v.y for v in vs), max(v.y for v in vs)
    back = [v for v in vs if v.y < y0 + .005]
    z = (min(v.z for v in back) + max(v.z for v in back)) / 2
    low = min(v.z for v in vs)
    feet = [v for v in vs if v.z < low + .003]
    save(f, "scope.json", dict(eyepiece=(0, y0, z), objective=(0, y1, z), mount=(0, sum(v.y for v in feet) / len(feet), low)))


def gun(f, vs, edges):
    y0, y1 = min(v.y for v in vs), max(v.y for v in vs)
    tip = [v.x for v in vs if v.y > y1 - (y1 - y0) * .03]
    bx = (min(tip) + max(tip)) / 2  # the bore's x (rigged guns are centred on their box, not the bore)
    mid = [v for v in vs if abs(v.x - bx) < .015]
    L = y1 - y0

    def cut(y, centre=False):
        """points where the mesh crosses the plane at y (centre: only near x = 0, falls back to all)"""
        ps = [p.lerp(q, (y - p.y) / (q.y - p.y)) for p, q in edges if (p.y - y) * (q.y - y) <= 0 and p.y != q.y]
        mids = [p for p in ps if abs(p.x - bx) < .015]
        return (mids if centre and mids else ps) or vs

    def top(y):
        return max(p.z for p in cut(y, True))

    def span(y):  # whole cross-section (stock sides too)
        ps = cut(y)
        return min(p.z for p in ps), max(p.z for p in ps)

    yt = y0 + PULL
    trigger = (bx, yt, span(yt)[0] + .025)
    front = max([p for p in mid if p.y > y1 - L * .12] or [p for p in vs if p.y > y1 - L * .12], key=lambda p: p.z)
    nz = sorted(p.z for p in vs if p.y > y1 - .006)
    muzzle = (bx, y1, nz[len(nz) // 2])
    cand = [p for p in mid if yt - .08 < p.y < front.y - .25]
    rear = max(cand, key=lambda p: (p.z - front.z) / (front.y - p.y))
    # notch: the aim point a little under the rear sight's top, raised until nothing nearer the eye
    # (receiver, bolt shroud; the eye is CHEEK behind the trigger) stands over the line to the front sight
    ey, nz_ = yt - CHEEK, rear.z - DROP
    for _ in range(2):
        over = [v.z - (nz_ + (front.z - nz_) * (v.y - rear.y) / (front.y - rear.y)) for v in mid if ey < v.y < rear.y - .015]
        nz_ += max(0, max(over, default=0) + .001)
    notch = (bx, rear.y, nz_)
    ye = yt + .07
    yg = yt - .06
    lo, hi = span(yg)
    yf = yt + .27
    save(f, "weapon.json", dict(muzzle=muzzle, front=(bx, front.y, front.z), rear=(bx, rear.y, rear.z), notch=notch, trigger=trigger,
                                grip=(bx, yg, (lo + hi) / 2), fore=(bx, yf, span(yf)[0]), eject=(bx + .012, ye, top(ye)), mount=(bx, ye, top(ye))))


for f in folders:
    # rigged guns keep the mesh in gun.blend (same frame), model.blend only links it
    blend = os.path.join(f, "gun.blend") if os.path.exists(os.path.join(f, "gun.blend")) else os.path.join(f, "model.blend")
    with bpy.data.libraries.load(blend) as (src, dst):
        dst.meshes = list(src.meshes)
    vs = [v.co.copy() for m in dst.meshes for v in m.vertices]
    if "attachments" in f:
        scope(f, vs)
    else:
        gun(f, vs, [(m.vertices[e.vertices[0]].co.copy(), m.vertices[e.vertices[1]].co.copy()) for m in dst.meshes for e in m.edges])
