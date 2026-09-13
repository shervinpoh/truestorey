"""
The island, as a relief of what was filed in it.

    blender -b -P scripts/render/island.py -- --out public/editorial/island-a.png

── WHAT THIS IS, AND WHY IT IS NOT AN ILLUSTRATION ──────────────────────────
The first pass at Blender for this site asked for safe abstract objects to
replace stock photographs, and it produced a grey octagon on a pole that the
alt text had to call "an unbranded spade" because nothing else would read it
that way. A 3D key is something anybody can render.

This is not that. Every polygon here is URA's own Master Plan planning area
boundary — the same file /map draws — and every height is that town's filed
median psf, the figure this site already publishes on the town's own page.
Nothing is invented, which is rule 13, and nothing can be copied by a
competitor without the same data and the same pipeline.

── THE BANDING IS NOT DONE HERE ─────────────────────────────────────────────
Blender ships its own Python and cannot import this repo's ES modules, so
computing quantiles in here would mean a second copy of lib/ramp.js. The
export step does it with the same function the homepage and the record-page
locator use, and this receives polygons that already know their colour. Two
implementations of one ramp is how a site stops being one atlas, and nothing
would go red.

── sRGB IS NOT LINEAR ───────────────────────────────────────────────────────
The ramp is written in the stylesheet as sRGB hex. Blender's shader nodes work
in linear light. Feeding hex straight in renders every band too bright and the
picture stops matching the page it sits on — which is the one thing the whole
exercise is for.
"""
import bpy
import bmesh
import json
import math
import os
import sys

# ── arguments ───────────────────────────────────────────────────────────────
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = arg("--data", os.path.join(ROOT, "data", "render", "island.json"))
OUT = arg("--out", os.path.join(ROOT, "public", "editorial", "island-a.png"))
SAMPLES = int(arg("--samples", "96"))
RES = int(arg("--width", "2400"))
DARK = "--dark" in argv

with open(DATA) as fh:
    D = json.load(fh)

# ── ONE GROUND, DELIBERATELY MID ────────────────────────────────────────────
# Not the page's. docs/VISUAL_ASSET_BRIEF.md sets the rule and the first
# version of this script broke it: a --dark variant matching #15181B rendered
# the whole shadow side into near-black, because the ramp's dark end on a dark
# ground with one hard key has nowhere to go.
#
# The brief's answer is the right one. The site has two grounds and a reader
# chooses between them, so an image that matches either one clashes with the
# other. Hold the value in the middle — this is the neutral ramp's midpoint,
# about 48% luminance, inside the 25–70 band the brief asks for — and let it
# read as an image sitting on a page rather than as part of it.
GROUND = (0x7B, 0x83, 0x7F)
UNPRICED = (0x9A, 0xA0, 0x9C)


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb, alpha=1.0):
    return (*[srgb_to_linear(v) for v in rgb], alpha)


def hex_to_lin(h):
    h = h.lstrip("#")
    return lin(tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)))


# ── the scene, from scratch ─────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ── projection ──────────────────────────────────────────────────────────────
# A degree of longitude is shorter than a degree of latitude by cos(lat). At
# 1.35°N that is 0.99972, which is invisible — but writing it down costs
# nothing and the alternative is a map that is silently 0.03% wrong in one
# axis, which is the kind of thing nobody ever goes back and checks.
lats = [p[1] for s in D["shapes"] for r in s["rings"] for p in r]
lons = [p[0] for s in D["shapes"] for r in s["rings"] for p in r]
lat0 = (min(lats) + max(lats)) / 2
kx = math.cos(math.radians(lat0))
SPAN = max((max(lons) - min(lons)) * kx, max(lats) - min(lats))
SCALE = 10.0 / SPAN                      # the island is ten Blender units wide
cx = (min(lons) + max(lons)) / 2
cy = (min(lats) + max(lats)) / 2

# ── height ──────────────────────────────────────────────────────────────────
# PROPORTIONAL TO THE FIGURE, FROM ZERO. Not to its position in the range.
#
# The first version mapped lo..hi onto the full bar, so Queenstown at 859 psf
# stood 25 times taller than the cheapest town at 501 — a ratio of 1.7 drawn as
# a ratio of 25. It looked spectacular and it was a chart lying about its axis,
# which is the thing this site refuses on every other page. A reader cannot
# unsee a skyline, and the skyline was not in the data.
#
# Zero-based costs the drama and keeps the claim. The relief is gentler because
# Singapore's town medians genuinely are within a factor of two of each other,
# and that IS the finding: the expensive parts are not a different world, they
# are two thirds dearer.
#
# BASE is what an unpriced area gets: a plate, not a hole. An unexplained gap
# reads as missing data and this is not missing — the Central Water Catchment
# has no filed resale because nobody lives in it.
lo, hi = D["lo"], D["hi"]
BASE, TALL = 0.05, 1.25
HAIRPIN = math.radians(150)


def height(psf):
    if psf is None or not hi:
        return BASE
    return (psf / hi) * TALL


def project(lon, lat):
    return ((lon - cx) * kx * SCALE, (lat - cy) * SCALE)


# ── materials ───────────────────────────────────────────────────────────────
def material(name, rgba, rough=0.62):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    return m


mats = {c: material(f"band-{i}", hex_to_lin(c)) for i, c in enumerate(D["ramp"])}
mat_unpriced = material("unpriced", lin(UNPRICED), rough=0.8)

# ── the land ────────────────────────────────────────────────────────────────
built = 0
for s in D["shapes"]:
    z = height(s["psf"])
    for ri, ring in enumerate(s["rings"]):
        pts = [project(lon, lat) for lon, lat in ring]
        # A ring that closes on itself duplicates its first point; a duplicate
        # vertex makes a degenerate edge and bmesh refuses the face.
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue

        mesh = bpy.data.meshes.new(f"{s['slug']}-{ri}")
        obj = bpy.data.objects.new(f"{s['slug']}-{ri}", mesh)
        scene.collection.objects.link(obj)

        bm = bmesh.new()
        verts = [bm.verts.new((x, y, 0.0)) for x, y in pts]
        try:
            face = bm.faces.new(verts)
        except ValueError:
            # Self-intersecting ring. Skip the face rather than render a
            # scrambled one: a wrong shape is worse than a missing one, and
            # the count below reports it.
            bm.free()
            bpy.data.objects.remove(obj)
            continue
        # ── TRANSLATE WHAT THE EXTRUDE RETURNED ────────────────────────
        # Not "every vertex touching fewer than three faces", which was the
        # first attempt and moved nothing: the new cap sat exactly on top of
        # the original, so every face had a coincident twin and the two
        # shadowed each other. The render came out a solid black silhouette of
        # Singapore — correct in outline, and carrying none of the figures it
        # was built to carry. extrude_face_region hands back its own geometry;
        # that is what moves.
        ext = bmesh.ops.extrude_face_region(bm, geom=[face])
        new_verts = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=(0, 0, z), verts=new_verts)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

        # ── SMOOTH THE CURTAIN, KEEP THE TOP EDGE ──────────────────────────
        # Flat shading corrugated every wall. A planning-area boundary follows
        # roads, canals and rail, so it zig-zags hard: the median turn between
        # consecutive segments is 38.7 degrees and a third of them exceed 60.
        # Every one of those became its own facet with its own tone, and the
        # south walls read as corrugated iron — an artefact, over a boundary
        # that is entirely real.
        #
        # SIMPLIFYING IS THE WRONG FIX AND THE NUMBERS SAY SO. Douglas-Peucker
        # keeps the extremes of a zig-zag and drops what lies between, so it
        # sharpens what is left: at a 223m tolerance the vertex count falls
        # from 4,110 to 942 and the median turn RISES from 38.7 to 74.9
        # degrees. Fewer facets, each a harder crease. It would also move a
        # published boundary by up to 223 metres to make a picture look
        # better, which is not a trade this site makes.
        #
        # So the geometry is untouched and the SHADING changes. Interpolating
        # normals across a wall joint costs nothing true: the silhouette, which
        # is the only part a reader reads as a boundary, stays exactly where
        # URA put it.
        #
        # THE TEST IS CAP-OR-WALL, NOT AN ANGLE. A plain 80-degree threshold
        # was tried first, on the reasoning that it sits below the 90 a top
        # face meets its wall at. It cleaned up two thirds of the joints and
        # left the rest striped, because a quarter of this boundary turns by
        # more than 80 degrees and those are ordinary corners, not hairpins.
        # Raising the threshold toward 90 to catch them would have started
        # rounding the top edge, which is the one crease that must survive:
        # it is what makes a town read as a plate with a thickness rather than
        # as a tint.
        #
        # Whether an edge is a top edge is not a question about angles. A cap
        # faces up, a wall faces sideways, and the two are told apart by the
        # z of their normals with enormous margin. So: every wall-to-wall joint
        # smooths regardless of how hard it turns, every cap-to-wall edge stays
        # sharp, and the 150-degree cap catches the genuine hairpins where a
        # boundary doubles back on itself and an averaged normal would point
        # along the wall instead of out of it.
        for e in bm.edges:
            if len(e.link_faces) != 2:
                e.smooth = False
                continue
            f1, f2 = e.link_faces
            both_walls = abs(f1.normal.z) < 0.5 and abs(f2.normal.z) < 0.5
            try:
                hairpin = e.calc_face_angle() > HAIRPIN
            except ValueError:
                hairpin = True
            e.smooth = both_walls and not hairpin

        bm.to_mesh(mesh)
        bm.free()

        mesh.materials.append(mats[s["colour"]] if s["colour"] else mat_unpriced)
        mesh.shade_smooth()
        built += 1

print(f"[island] built {built} polygons from {len(D['shapes'])} areas")

# ── the ground it sits on ───────────────────────────────────────────────────
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.02))
bpy.context.object.data.materials.append(material("ground", lin(GROUND), rough=0.95))

# ── LIGHT THE WALLS THE CAMERA CAN ACTUALLY SEE ─────────────────────────────
# The first version used one key "low and from the west", because that is the
# light this site has a whole feature about. It rendered the four most
# expensive towns on the island as a black mass.
#
# The camera stands to the south-east, so every vertical wall it can see faces
# south-east. A key from the west-north-west lights the far side of all of
# them. Queenstown at 859 psf, Bukit Timah at 793, Bukit Merah at 792 and
# Bishan at 733 are tall, dark-banded and clustered, so their own height put
# them in each other's shadow as well: the top of the entire distribution, and
# the single thing the picture exists to show, arrived unreadable.
#
# The key now comes from the east-south-east at 42 degrees, about 35 degrees
# off the camera's own azimuth. Off-axis rather than dead-on, so the walls
# still fall away from the tops and the relief keeps its form; on the camera's
# side rather than behind the subject, so the form is legible.
#
# Thematic accuracy lost nothing here. This is not the sun study — no claim is
# made about where light falls on a real building — so the sun's bearing is a
# compositional choice, and a bearing that hides the subject is the wrong one.
sun = bpy.data.lights.new("key", type="SUN")
sun.energy = 2.6
sun.angle = math.radians(2.5)
sun_obj = bpy.data.objects.new("key", sun)
sun_obj.rotation_euler = (math.radians(48), 0, math.radians(70))
scene.collection.objects.link(sun_obj)

# A fill from behind and opposite, at a quarter of the key. Not to flatten the
# relief — the shadows are what make it read — but so that a wall in shadow is
# still a COLOUR. The ramp's dark end is #164F52, which is already low in
# value; unlit and in cast shadow it goes to near-black, and a band that
# cannot be told from its own shadow has stopped encoding a price.
fill = bpy.data.lights.new("fill", type="SUN")
fill.energy = 0.65
fill.angle = math.radians(35)
fill_obj = bpy.data.objects.new("fill", fill)
fill_obj.rotation_euler = (math.radians(62), 0, math.radians(-125))
scene.collection.objects.link(fill_obj)

world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = lin(GROUND)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.35

# ── camera ──────────────────────────────────────────────────────────────────
# Orthographic, not perspective. A perspective camera makes the near towns
# taller than the far ones, which would be a picture that misreports the
# figures it was built from.
cam = bpy.data.cameras.new("cam")
cam.type = "ORTHO"
cam.ortho_scale = 10.6
cam_obj = bpy.data.objects.new("cam", cam)
cam_obj.location = (8.4, -8.4, 11.0)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

# ── AIMED, NOT ANGLED ───────────────────────────────────────────────────────
# Hand-tuned Euler angles put the island in the top-left corner of the first
# render with a third of the frame empty, and every attempt to correct it by
# eye moves two things at once. A Track To constraint on an empty at the
# island's centre means the camera can be moved anywhere and stays pointed at
# the subject — so the only thing left to tune is where you stand.
target = bpy.data.objects.new("target", None)
target.location = (0, 0, 0.35)     # a little above the plate, not the ground
scene.collection.objects.link(target)
track = cam_obj.constraints.new("TRACK_TO")
track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"

# ── render ──────────────────────────────────────────────────────────────────
scene.render.engine = "CYCLES"
try:
    scene.cycles.device = "GPU"
except Exception:
    pass
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.render.resolution_x = RES
# 2:1, not 16:9. Singapore is a lozenge drawn on a tilt, so the corners of a
# frame are empty whatever you do — but a 16:9 frame left a band of bare ground
# across the top and bottom as well, and the island only reached 77% of the
# height. Trimming the bands is free; widening the island is not, because
# ortho_scale is the only thing standing between this and a crop.
scene.render.resolution_y = int(RES / 2)
scene.render.film_transparent = False

# ── AVIF AND WEBP, FROM ONE RENDER ──────────────────────────────────────────
# Blender writes both itself, so the brief's delivery format costs no new tool
# and the three-dependency rule is untouched. A PNG of this at 2400px is 3.3MB
# and the brief asks for under 120KB, because it sits above the fold.
#
# Rendered once and saved twice. Rendering per format would be two minutes of
# Cycles for one picture, and the two could drift if anything between them
# touched the scene.
base = os.path.splitext(OUT)[0]
os.makedirs(os.path.dirname(OUT), exist_ok=True)

bpy.ops.render.render(write_still=False)
result = bpy.data.images["Render Result"]
for fmt, ext, q in (("WEBP", ".webp", 82), ("AVIF", ".avif", 60)):
    scene.render.image_settings.file_format = fmt
    scene.render.image_settings.quality = q
    path = base + ext
    result.save_render(filepath=path, scene=scene)
    print(f"[island] wrote {path} ({os.path.getsize(path) // 1024}KB)")
