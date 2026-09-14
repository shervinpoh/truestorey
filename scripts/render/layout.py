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

── A TYPOLOGY IS NOT A LAYOUT, AND THE FIRST VERSION OF THIS NOTE SAID IT WAS ─
This file was committed claiming that flatType x model "identifies a standard
layout" and that 15 of them cover 92.7% of filed resales. The second half is
true and the first half is not, which made the whole thing misleading. Shervin
said floor plans differ even inside one model. He is right, and the data this
repo already held said so:

  4 ROOM Model A, 22,772 filed resales:  44 DISTINCT AREAS.
  The commonest single area, 93 sqm, is 31.4% of them. Clearly bimodal — one
  cluster at 90-94 and another at 100-106.

Era explains most of that split, and tightens it a great deal:

  1980s  n=3,770  median 104 sqm   p10 103 - p90 108
  1990s  n=4,956  median 103 sqm   p10 100 - p90 108
  2000s  n=2,680  median  90 sqm   p10  86 - p90  96
  2010s  n=8,916  median  93 sqm   p10  92 - p90  93
  2020s  n=2,450  median  93 sqm   p10  92 - p90  94

And a block is mostly uniform: of 2,265 blocks with four or more sales of this
type, 53.5% have exactly one area and 82% have at most two.

BUT EQUAL AREA IS NOT EQUAL SHAPE. Two 93 sqm flats can be mirrored across a
stairwell core, or be a corner unit against a middle one, or come from two
precincts whose architects adapted the type differently. Area is necessary and
nowhere near sufficient, so even the tight 2010s cohort is not provably one
plan. No amount of arithmetic on this dataset can establish a layout, because
the dataset holds no geometry.

So a library keyed on the typology can only ever be REPRESENTATIVE — "a typical
4-room Model A from the 2010s" — and must say so. It cannot be "your flat".

── HENCE: THE SPEC COMES FROM A PLAN, NOT FROM A KEY ─────────────────────────
The accurate input is the floor plan of the actual unit, which the buyer of a
specific unit already has. One engine, and what differs is only where a spec
was traced from and how honestly it is labelled:

  PER UNIT      traced from that unit's own plan. Accurate. Says "this unit".
  REPRESENTATIVE traced from one real plan of a type. Says "a typical X", never
                "yours", and carries the spread above so a reader knows the
                type varies.

Nothing here knows which it is. `label` in the spec is what the page prints.

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

# ── SCALE FROM THE STATED AREA, SO A PLAN NEEDS NO DIMENSIONS ───────────────
# Most floor plans in this market print no dimensions at all. They are still
# drawn to a uniform scale, which is the only property the method needs: trace
# the rooms in ANY unit — screen pixels off the image is easiest — and the one
# figure that IS always published, the flat's area, recovers the scale.
#
#     s = sqrt(stated_area / traced_area)        metres per traced unit
#
# The square root is the whole trick. Area scales with the square of length, so
# a 4% error in the area becomes a 2% error in every dimension, and the error is
# SYSTEMATIC — one scale factor for the whole plan. Proportions between rooms
# stay exact no matter what: if a bedroom traces 1.64 times the width of a
# queen bed, it is 1.64 times the width of a queen bed.
#
# ROOMS MUST BE TRACED TO WALL CENTRELINES, not to the inner faces. Traced to
# centrelines the rectangles tile the footprint with no gaps, so their sum IS
# the area the scale is solved against, and the walls this script draws straddle
# the shared edges exactly as they do on the plan. Traced to inner faces the sum
# omits every partition and the scale comes out too large.
#
# `includeInArea: false` marks a room the published figure does NOT count — a
# balcony, an aircon ledge, a void. Getting that wrong is the largest error
# available here: on a 110 sqm flat a 5 sqm ledge wrongly included is 4.5% of
# area and 2.2% of every length.
def rescale(spec):
    if spec.get("units", "m") == "m":
        return
    area = spec.get("areaSqm")
    if not area:
        raise SystemExit("units is not metres and areaSqm is missing — "
                         "there is nothing to solve the scale against")
    traced = sum(r["w"] * r["d"] for r in spec["rooms"]
                 if r.get("includeInArea", True))
    if traced <= 0:
        raise SystemExit("traced area is zero")
    s = math.sqrt(area / traced)
    for r in spec["rooms"]:
        for k in ("x", "y", "w", "d"):
            r[k] *= s
    for o in spec.get("openings", []):
        for k in ("x", "y", "w"):
            o[k] *= s
        if o.get("sillM_traced"):
            o["sillM"] = o["sillM_traced"] * s
    spec["_scale"] = s
    spec["_tracedUnits"] = spec.get("units")
    print(f"[layout] scale {s:.5f} m per {spec.get('units')} "
          f"(traced {traced:.0f} -> stated {area} sqm)")

    # ── A FREE SECOND OPINION, AND IT IS WORTH TAKING ──────────────────────
    # The plan contains objects whose real size is fixed by regulation and
    # habit: a bedroom door leaf is about 0.85m and a bathroom door about
    # 0.70m. Scaling them with the area-derived factor and checking what comes
    # out is an independent test of the scale that costs nothing. If the doors
    # land far off, the area basis is wrong — almost always a balcony or ledge
    # counted on the wrong side — and that is worth knowing BEFORE the render
    # looks plausible and wrong.
    # Tested on the SMALLEST door. The narrowest door in a flat is essentially
    # always a bathroom at about 0.70m, which makes it the most standard thing
    # on a plan; the widest may legitimately be a 1.0m+ main entrance, so a cap
    # on the maximum catches almost nothing. A first version flagged only
    # outside 0.50-1.25m and passed a 60 sqm flat with 90 typed against it —
    # a 50% area error reported as fine.
    #
    # And it is a check on GROSS error only. A 2% scale error — a balcony
    # counted on the wrong side — yields 0.83m doors and is indistinguishable
    # from correct. Nothing here can catch that except knowing what the
    # published figure measures.
    doors = [o["w"] for o in spec.get("openings", []) if o.get("kind") == "door"]
    if doors:
        lo, hi = min(doors), max(doors)
        implied = area * (0.70 / lo) ** 2
        off = (implied / area - 1) * 100
        print(f"[layout] door check: {len(doors)} doors, {lo:.2f}m to {hi:.2f}m")
        print(f"[layout]   if the narrowest is a 0.70m bathroom door, the area "
              f"would be {implied:.1f} sqm ({off:+.0f}%)")
        if abs(off) > 8:
            print("[layout] WARNING: that disagrees with the stated area. Check "
                  "areaSqm and check includeInArea on balconies, ledges and voids.")

rescale(S)

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
# ── AN L-SHAPED ROOM IS SEVERAL RECTANGLES THAT MUST NOT BE WALLED APART ────
# Real rooms are not rectangles. A master bedroom with a wardrobe recess, or a
# living room that wraps a corner, has to be traced as two or three boxes
# because a box is what a tracer can draw — and then the wall derivation sees
# an edge covered by two rooms, calls it a partition, and builds a wall through
# the middle of somebody's bedroom. The render looks entirely convincing and
# the flat it shows does not exist.
#
# `group` is how a spec says "these boxes are one room". An edge covered twice
# by the SAME group is interior to a single space and gets no wall at all.
# Rooms with no group are their own group, so nothing changes for simple ones.
def group_of(r):
    return r.get("group") or r["name"]


EPS = 1e-6
lines = {}
for r in rooms:
    x, y, w, d = r["x"], r["y"], r["w"], r["d"]
    g = group_of(r)
    for o, c, a, b in (("h", y, x, x + w), ("h", y + d, x, x + w),
                       ("v", x, y, y + d), ("v", x + w, y, y + d)):
        lines.setdefault((o, round(c, 3)), []).append((round(a, 3), round(b, 3), g))

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
    cuts = sorted({v for a, b, _ in intervals for v in (a, b)})
    for k in range(len(cuts) - 1):
        lo, hi = cuts[k], cuts[k + 1]
        if hi - lo < 0.02:
            continue
        mid = (lo + hi) / 2
        covering = [g for a, b, g in intervals if a < mid < b]
        if not covering:
            continue
        # Two boxes of one room meeting: interior to a single space, no wall.
        if len(covering) > 1 and len(set(covering)) == 1:
            continue
        thick = WALL_INT if len(covering) > 1 else WALL_EXT

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


# Once per ROOM, in its largest box. Placing per box would put a bed in the
# wardrobe recess as well as in the bedroom.
by_group = {}
for r in rooms:
    g = group_of(r)
    if g not in by_group or r["w"] * r["d"] > by_group[g]["w"] * by_group[g]["d"]:
        by_group[g] = r
for r in by_group.values():
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

# A traced spec carries a `label`, not flatType/model — those exist only on the
# representative HDB ones. Assuming them crashed on the first real trace, after
# the frames had already been written, which is the most annoying place to fail.
name = S.get("label") or " · ".join(
    x for x in (S.get("flatType"), S.get("model")) if x) or S.get("id", "layout")
groups = len({r.get("group") or r["name"] for r in rooms})
print(f"[layout] {name} — {len(rooms)} boxes in {groups} rooms, "
      f"{FRAMES} frames, verified={bool(S.get('verified'))}")
