"""
A flat, as a doll's house you can walk around.

    blender -b -P scripts/render/layout.py -- \
        --spec data/layouts/4-room-model-a.json \
        --out public/layouts/4-room-model-a \
        --frames 16

── WHAT PROBLEM THIS IS FOR ──────────────────────────────────────────────────
A buyer cannot read a floor plan. That is not a failure of attention: a plan is
an orthographic section at 1.2m drawn in a convention nobody is taught, and the
thing a buyer is trying to answer — will my life fit in here — is volumetric.
Every listing photograph answers it with somebody else's furniture, which is
worse than nothing, because taste is the loudest thing in the frame and the
buyer ends up judging a sofa.

A cutaway from above, furnished at real dimensions, answers it directly. The
walls stop at 1.3m so you can see in; the furniture is the actual size of a
queen bed and a three-seat sofa, so the room either holds them or does not.

── THE GEOMETRY IS DATA, NOT DRAWING ─────────────────────────────────────────
Same architecture as island.py. Blender receives a spec that already knows
every dimension; this script owns no measurements of its own. A layout is a
JSON file and adding one is authoring data, not editing a renderer.

That split matters more here than it did for the island, because the specs come
from two different places and must not diverge in treatment:

  HDB      a published typology. flatType x model identifies a standard layout,
           and 15 of them cover 92.7% of every filed resale. Built once, they
           serve every block page on the site.
  CONDO    no typology exists. 2,974 projects, and one of them (Normanton Park)
           has 48 distinct unit areas on its own. So a condo spec is authored
           per project, from the developer's or the agent's own plan, for the
           projects actually being marketed.

One engine, two ways of feeding it. Nothing here knows which it is.

── NOTHING UNVERIFIED IS ALLOWED OUT ─────────────────────────────────────────
A spec carries `verified`. If it is not true, this still renders — you have to
be able to look at a layout while you are authoring it — but the filename is
stamped PROVISIONAL and the site's own component refuses to publish it.

The reason is the sharpest failure available here. A wrong layout does not look
wrong. It looks like a flat. Reconstructing "4 ROOM Model A" from general
knowledge would produce a plausible, confident, subtly incorrect flat, and
every agent and half the buyers in Singapore would know at a glance — which
costs more credibility than having no 3D at all. Real dimensions come from a
real plan or the layout does not ship.
"""
import bpy
import json
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPEC = arg("--spec")
OUT = arg("--out")
FRAMES = int(arg("--frames", "16"))
SAMPLES = int(arg("--samples", "48"))
RES = int(arg("--width", "1400"))

with open(SPEC) as fh:
    S = json.load(fh)

CUT = float(S.get("cutM", 1.30))          # doll's-house wall height
CEIL = float(S.get("ceilingM", 2.60))
WALL_EXT = 0.20                            # exterior wall thickness, metres
WALL_INT = 0.10                            # partition thickness

# ── palette ─────────────────────────────────────────────────────────────────
# Deliberately quiet. On the island render colour ENCODED a price, so it earned
# the site's six-step ramp. Here colour encodes nothing — every room is the same
# flat — so a palette would be decoration competing with the only thing that
# matters, which is where the walls are and what fits between them. Warm
# neutrals, one darker tone for furniture so it separates from the floor.
FLOOR = (0xE8, 0xE3, 0xDA)
WALL = (0xD3, 0xCE, 0xC5)
WET = (0xDA, 0xD9, 0xD6)                   # bath, kitchen, yard — a shade cooler
FURN = (0x9A, 0x93, 0x88)
SOFT = (0x7F, 0x86, 0x83)
GROUND = (0xF6, 0xF5, 0xF2)

WET_KINDS = {"bath", "kitchen", "yard", "shelter", "wc"}


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb, a=1.0):
    return (*[srgb_to_linear(v) for v in rgb], a)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(name, rgb, rough=0.75):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(rgb)
    b.inputs["Roughness"].default_value = rough
    return m


MAT = {
    "floor": material("floor", FLOOR),
    "wet": material("wet", WET),
    "wall": material("wall", WALL),
    "furn": material("furn", FURN, 0.62),
    "soft": material("soft", SOFT, 0.85),
    "ground": material("ground", GROUND, 0.95),
}


def box(name, cx, cy, cz, sx, sy, sz, mat):
    """A box by its CENTRE and its FULL extents, because every dimension in a
    spec is a room width or a bed length — a real measurement someone can check
    against a plan. Halving them here keeps that arithmetic out of the data."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, cz))
    o = bpy.context.object
    o.name = name
    o.scale = (sx, sy, sz)
    o.data.materials.append(MAT[mat])
    return o


rooms = S["rooms"]

# ── the flat's own extents, so everything else can be centred on it ─────────
xs = [r["x"] for r in rooms] + [r["x"] + r["w"] for r in rooms]
ys = [r["y"] for r in rooms] + [r["y"] + r["d"] for r in rooms]
X0, X1, Y0, Y1 = min(xs), max(xs), min(ys), max(ys)
CX, CY = (X0 + X1) / 2, (Y0 + Y1) / 2
SPAN = max(X1 - X0, Y1 - Y0)

# ── floors ──────────────────────────────────────────────────────────────────
for r in rooms:
    box(f"floor-{r['name']}", r["x"] + r["w"] / 2 - CX, r["y"] + r["d"] / 2 - CY,
        -0.05, r["w"], r["d"], 0.10,
        "wet" if r.get("kind") in WET_KINDS else "floor")

# ── walls, derived from the rooms rather than listed ────────────────────────
# Every room contributes four edges, and a wall is drawn once per span of an
# edge line rather than once per room edge.
#
# THE OBVIOUS VERSION IS WRONG AND RENDERS BLACK. Keying each edge whole and
# counting duplicates only dedupes edges that match EXACTLY. Rooms rarely line
# up that way: on this layout the line y=4.0 carries the living room's back
# wall over 0.0-4.4, the kitchen's over 0.0-3.2, the bath's over 3.2-5.0 and
# four more, all different keys, all drawn in full, all overlapping. 15
# overlapping pairs out of 41 edges — every one a pair of coincident faces
# fighting for the same pixels, which Cycles resolves as solid black. Exactly
# the failure that made the first island render a black silhouette.
#
# So each edge LINE is split at every endpoint that lands on it, and coverage
# is counted per elementary span. Covered twice means a partition between two
# rooms, drawn thin and once. Covered once means it faces outside, drawn thick.
# Nothing can overlap because the spans tile the line by construction.
EPS = 1e-6
lines = {}
for r in rooms:
    x, y, w, d = r["x"], r["y"], r["w"], r["d"]
    for o, c, a, b in (("h", y, x, x + w), ("h", y + d, x, x + w),
                       ("v", x, y, y + d), ("v", x + w, y, y + d)):
        lines.setdefault((o, round(c, 3)), []).append((round(a, 3), round(b, 3)))

openings = S.get("openings", [])


def spans_on(orient, coord, lo, hi):
    """Opening spans falling on this wall line, as (from, to, kind, sill)."""
    out = []
    for o in openings:
        on = o["y"] if orient == "h" else o["x"]
        if abs(on - coord) > 0.05:
            continue
        a = o["x"] if orient == "h" else o["y"]
        if a + o["w"] <= lo + EPS or a >= hi - EPS:
            continue
        out.append((max(a, lo), min(a + o["w"], hi),
                    o.get("kind", "door"), o.get("sillM", 0.0)))
    return sorted(out)


for (orient, coord), intervals in lines.items():
    cuts = sorted({v for iv in intervals for v in iv})
    for k in range(len(cuts) - 1):
        lo, hi = cuts[k], cuts[k + 1]
        if hi - lo < 0.02:
            continue
        mid = (lo + hi) / 2
        cover = sum(1 for a, b in intervals if a < mid < b)
        if cover == 0:
            continue
        thick = WALL_INT if cover > 1 else WALL_EXT

        # An opening is a span with no wall below the cut. A door reaches the
        # floor; a window keeps its sill, so at a 1.3m cut it reads as a window
        # rather than as a hole somebody walks through.
        pieces, cursor = [], lo
        for a, b, kind, sill in spans_on(orient, coord, lo, hi):
            if a > cursor:
                pieces.append((cursor, a, CUT))
            if kind == "window" and sill > 0:
                pieces.append((a, b, min(sill, CUT)))
            cursor = max(cursor, b)
        if cursor < hi:
            pieces.append((cursor, hi, CUT))

        for a, b, h in pieces:
            if b - a < 0.02 or h < 0.02:
                continue
            m = (a + b) / 2
            if orient == "h":
                box("w", m - CX, coord - CY, h / 2, b - a, thick, h, "wall")
            else:
                box("w", coord - CX, m - CY, h / 2, thick, b - a, h, "wall")

# ── furniture, at the size the thing actually is ────────────────────────────
# This is the entire point of rendering rather than drawing. A plan tells you a
# bedroom is 3.0 by 2.7; it does not tell you that a queen bed and a wardrobe
# leave 600mm to walk. The dimensions below are ordinary retail sizes, and they
# are in the renderer rather than the spec because they are the same in every
# flat in Singapore — a spec should carry what differs.
FURNITURE = {
    "living": [("sofa", 2.20, 0.90, 0.75, "soft", "S"),
               ("coffee", 1.10, 0.60, 0.40, "furn", "C"),
               ("tv", 1.80, 0.40, 0.50, "furn", "N")],
    "dining": [("table", 1.40, 0.85, 0.75, "furn", "C")],
    "master": [("bed", 1.83, 2.03, 0.55, "soft", "C"),      # queen, 60x80in
               ("wardrobe", 1.80, 0.60, CUT, "furn", "N")],
    "bedroom": [("bed", 1.22, 1.90, 0.50, "soft", "C"),     # super single
                ("wardrobe", 1.20, 0.60, CUT, "furn", "N")],
    "kitchen": [("counter", 0.60, 0.60, 0.90, "furn", "RUN")],
    "bath": [("basin", 0.55, 0.45, 0.85, "furn", "N")],
}


def place(r):
    kind = r.get("kind")
    items = FURNITURE.get(kind)
    if not items:
        return
    x, y, w, d = r["x"] - CX, r["y"] - CY, r["w"], r["d"]
    for name, fw, fd, fh, mat, anchor in items:
        if r.get("rotate"):
            fw, fd = fd, fw
        if fw > w - 0.15 or fd > d - 0.15:
            continue                       # it does not fit, so it is not drawn
        if anchor == "C":
            cx, cy = x + w / 2, y + d / 2
        elif anchor == "N":
            cx, cy = x + w / 2, y + d - fd / 2 - 0.05
        elif anchor == "S":
            cx, cy = x + w / 2, y + fd / 2 + 0.05
        else:                              # RUN — a counter down the long wall
            cx, cy = x + fw / 2 + 0.05, y + d / 2
            fd = min(d - 0.2, 2.4)
        box(f"{name}-{r['name']}", cx, cy, fh / 2, fw, fd, fh, mat)


for r in rooms:
    place(r)

# ── ground, light, camera ───────────────────────────────────────────────────
bpy.ops.mesh.primitive_plane_add(size=SPAN * 6, location=(0, 0, -0.12))
bpy.context.object.data.materials.append(MAT["ground"])

# Soft and from high, not a hard key. The island wanted long shadows because
# relief WAS the message; here a shadow across a bedroom floor hides the floor,
# and the floor is what is being measured. One sun for shape, a bright world
# for fill.
sun = bpy.data.lights.new("key", type="SUN")
sun.energy = 2.2
sun.angle = math.radians(18)
sun_obj = bpy.data.objects.new("key", sun)
sun_obj.rotation_euler = (math.radians(34), 0, math.radians(55))
scene.collection.objects.link(sun_obj)

world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = lin((0xFF, 0xFD, 0xF8))
world.node_tree.nodes["Background"].inputs[1].default_value = 1.9

cam = bpy.data.cameras.new("cam")
cam.type = "ORTHO"
cam.ortho_scale = SPAN * 1.32
cam_obj = bpy.data.objects.new("cam", cam)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

target = bpy.data.objects.new("target", None)
target.location = (0, 0, CUT * 0.35)
scene.collection.objects.link(target)
track = cam_obj.constraints.new("TRACK_TO")
track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"

scene.render.engine = "CYCLES"
try:
    scene.cycles.device = "GPU"
except Exception:
    pass
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.render.resolution_x = RES
scene.render.resolution_y = RES
scene.render.film_transparent = False

# ── the turntable ───────────────────────────────────────────────────────────
# Frames a reader steps through, not a video. A <video> is weight and a control
# surface for something that wants to be scrubbed, and stepped frames degrade
# correctly: with no JS the first frame is simply a picture of the flat. It is
# also the pattern already on this site for the construction stages.
#
# 45 degrees of elevation is the doll's-house angle — high enough to read the
# plan, low enough that the walls still say which way is up.
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
tag = "" if S.get("verified") else "-PROVISIONAL"
R = SPAN * 1.5
for i in range(FRAMES):
    a = 2 * math.pi * i / FRAMES
    cam_obj.location = (math.sin(a) * R, -math.cos(a) * R, R * 0.85)
    bpy.ops.render.render(write_still=False)
    result = bpy.data.images["Render Result"]
    for fmt, ext, q in (("WEBP", ".webp", 80), ("AVIF", ".avif", 58)):
        scene.render.image_settings.file_format = fmt
        scene.render.image_settings.quality = q
        result.save_render(filepath=f"{OUT}{tag}-{i:02d}{ext}", scene=scene)
    print(f"[layout] frame {i + 1}/{FRAMES}")

print(f"[layout] {S['flatType']} · {S['model']} — {len(rooms)} rooms, "
      f"{FRAMES} frames, verified={bool(S.get('verified'))}")
