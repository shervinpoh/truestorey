"""
Walls and rooms out of a floor plan image.

    python3 scripts/render/detect-walls.py PLAN.jpg --area 90 --out spec.json
    python3 scripts/render/detect-walls.py PLAN.jpg --area 90 --debug out.png

Pillow only. No model, no service, nothing leaves the machine.

── WHY LINES AND NOT REGIONS ────────────────────────────────────────────────
The obvious approach is to threshold the image and flood-fill the white space:
each enclosed region is a room. It does not work, and the way it fails is
instructive. A doorway is a GAP IN A WALL by definition, so the flood pours
through it — on a real plan the living room, kitchen, corridor and entrance all
came back as one blob. Sealing the gaps means a morphological close wide enough
to bridge a 60px doorway, which is also wide enough to eat the partitions.
Tested at radii 0 to 16: there is no setting where rooms separate and walls
survive.

Detecting the WALL LINE instead makes the doorway irrelevant. A door is a short
break in a line that plainly continues, so the line is recovered whole and the
room boundary with it.

── AND WHY LENGTH, NOT THICKNESS ────────────────────────────────────────────
The second obvious approach is that walls are the thick ink and everything else
is thin, so an opening isolates them. Also wrong here, and measurably: on a
real HDB plan an opening at radius 3 kept 63% of the ink and what it kept was
only the structural blocks. Every partition — both bathrooms, both bedroom
walls — is drawn at the same weight as the door arcs and the lettering.

What separates a wall from an arc is not how thick it is. It is that a wall is
LONG, STRAIGHT and AXIS-ALIGNED. So this scans for runs of ink along each row
and each column and keeps the long ones. Text gives short runs. A door arc is a
curve, so its longest axis-aligned run is a few pixels. A wall gives a run the
length of the wall.

── WHAT IT DOES NOT DO ──────────────────────────────────────────────────────
WHERE IT STANDS, measured against a hand trace of the same plan
---------------------------------------------------------------
Nine rooms in the flat. Run on a real HDB plan:

  CORRECT   bedroom 2 (10.9 vs 10.6 m2), bedroom 3 (10.3 vs 12.0),
            the kitchen, and the two bathrooms found as one region
  WRONG     the main bedroom merges with the living and dining room
  NOISE     about sixteen slivers - window mullions, balcony strips

So roughly half the rooms come out usable and one bad merge has to be split by
hand. That is not a finished detector and it is not presented as one. It is a
starting point that turns "trace fourteen rectangles" into "split this region
and name them", which is the difference between fifteen minutes and two.

The remaining failure is a doorway wider than the 1.6m cutoff, or a wall the
run detector lost. Tuning it against ONE plan would be fitting to one plan;
the next real improvement needs a handful of them.

It does not name rooms. Which part of an open-plan space is "the kitchen" is a
judgement with no line on the drawing behind it, and a model does not need the
answer: two spaces with no wall between them ARE one space, and drawing them
merged is correct. Naming is left to the person, who can also fix whatever this
got wrong — which is the point of handing back a spec rather than a picture.
"""
import json
import sys
from PIL import Image, ImageDraw

MIN_RUN = 40          # px. A wall is at least this long; a glyph is not.
MERGE_PX = 12         # parallel lines closer than this are one wall
DARK = 110            # ink threshold


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def ink_runs(vals, minlen):
    """Maximal runs of True at least minlen long."""
    out, s = [], None
    for i, v in enumerate(vals):
        if v and s is None:
            s = i
        elif not v and s is not None:
            if i - s >= minlen:
                out.append([s, i])
            s = None
    if s is not None and len(vals) - s >= minlen:
        out.append([s, len(vals)])
    return out


def wall_lines(ink, W, H, horizontal):
    """Runs on consecutive rows that overlap are one wall a few pixels thick."""
    N, M = (H, W) if horizontal else (W, H)
    per = []
    for a in range(N):
        row = [ink(b, a) for b in range(M)] if horizontal else [ink(a, b) for b in range(M)]
        per.append(ink_runs(row, MIN_RUN))

    done, live = [], []
    for a in range(N):
        nxt = []
        for r in per[a]:
            hit = None
            for L in live:
                overlap = min(L['b'], r[1]) - max(L['a'], r[0])
                if overlap > 0.6 * min(L['b'] - L['a'], r[1] - r[0]):
                    hit = L
                    break
            if hit:
                hit['a'] = min(hit['a'], r[0])
                hit['b'] = max(hit['b'], r[1])
                hit['end'] = a
                nxt.append(hit)
            else:
                nxt.append({'a': r[0], 'b': r[1], 'start': a, 'end': a})
        done += [L for L in live if L not in nxt]
        live = nxt
    out = [L for L in done + live if L['b'] - L['a'] >= MIN_RUN]
    for L in out:
        L['pos'] = (L['start'] + L['end']) / 2
    return out


def merge_parallel(ls, tol=MERGE_PX):
    """A window frame draws two or three lines millimetres apart. Each is real
    ink and all of them are one wall."""
    ls = sorted(ls, key=lambda L: L['pos'])
    out = []
    for L in ls:
        if out and L['pos'] - out[-1]['pos'] <= tol:
            p = out[-1]
            p['a'] = min(p['a'], L['a'])
            p['b'] = max(p['b'], L['b'])
            p['pos'] = (p['pos'] + L['pos']) / 2
        else:
            out.append(dict(L))
    return out


def detect(path):
    im = Image.open(path).convert("L")
    W, H = im.size
    px = im.load()
    ink = lambda x, y: px[x, y] < DARK

    hz = merge_parallel([L for L in wall_lines(ink, W, H, True) if 20 < L['pos'] < H - 20])
    vt = merge_parallel([L for L in wall_lines(ink, W, H, False) if 20 < L['pos'] < W - 20])

    # ── A MARGIN RING, AND IT IS THE WHOLE DIFFERENCE ──────────────────────
    # Rooms are the parts of the grid the outside cannot reach. The first
    # version called any group touching the grid's edge "outside" — and the
    # grid's edge IS the flat's exterior wall, so the three rooms that sit
    # against it (the main bedroom, the kitchen and the living room, which is
    # to say most of the flat) were classified as outdoors.
    #
    # Adding a gridline at 0 and at the image bound puts a ring of cells
    # OUTSIDE the outermost wall. The flood starts there, the exterior wall
    # stops it, and every room is simply what it could not reach.
    # -- AND A GRIDLINE WHERE EVERY WALL ENDS ------------------------------
    # A grid built only from wall POSITIONS cannot express a T-junction, and a
    # flat is full of them. The wall between the main bedroom and bedroom 2
    # runs from the facade down to y=288 and simply stops; with no horizontal
    # gridline there, the cell either side spanned well past the wall's end,
    # the shared edge came out 46% inked against a 55% threshold, and the two
    # bedrooms merged into one room.
    #
    # Raising the threshold is the wrong fix — it would start treating a wall
    # with a door in it as no wall. The grid simply has to have a line where a
    # wall stops, so every cell edge is either fully walled or not walled.
    def near(vals, tol=10):
        out = []
        for v in sorted(vals):
            if not out or v - out[-1] > tol:
                out.append(v)
        return out

    gx = near([0] + [round(L['pos']) for L in vt] +
              [round(L['a']) for L in hz] + [round(L['b']) for L in hz] + [W])
    gy = near([0] + [round(L['pos']) for L in hz] +
              [round(L['a']) for L in vt] + [round(L['b']) for L in vt] + [H])

    # ── ASK THE IMAGE, NOT THE LINE ────────────────────────────────────────
    # The first version asked whether a DETECTED line's span covered the shared
    # edge. That over-segments badly — 24 regions on a nine-room flat — because
    # a line's span is the union of every run that merged into it, so a window
    # frame at the top of a bedroom claims the whole width of the room and then
    # splits it in half.
    #
    # Sampling the original ink along the actual edge asks the only question
    # that matters: is there something drawn between these two cells? A door
    # gap leaves most of the edge inked, so it still separates; a line that was
    # never really there leaves it clear, so it does not.
    def walled(_lines, pos, lo, hi, vertical):
        pos = int(round(pos))
        n = max(int(hi - lo), 1)
        hits = 0
        for t in range(n):
            u = int(lo + t)
            # A wall has thickness and the grid line sits at its centre, so look
            # a couple of pixels either side rather than at one exact column.
            band = range(max(pos - 2, 0), min(pos + 3, (W if vertical else H)))
            if any(ink(b, u) if vertical else ink(u, b) for b in band):
                hits += 1
        return hits > 0.55 * n

    # -- INSIDE AND OUTSIDE COME FROM THE IMAGE, NOT THE GRID --------------
    # Two versions failed here in opposite directions, and the lesson is that
    # these are two different questions needing two different tools.
    #
    # Asking the cell graph "can the outside reach this cell" needs every
    # exterior wall to register on every edge it crosses. It does not: the
    # margin cells are huge, a wall covers only part of such an edge, the test
    # falls under its threshold, and the outside floods the whole flat. Seven
    # regions survived that pass and they were window mullions.
    #
    # But flood-filling the IMAGE from its border is completely reliable for
    # this one question, because a flat's exterior envelope is continuous - the
    # only break is the front door, and a door leaf plus its frame closes it.
    # Measured on a real plan: the outside and the interior came back as two
    # separate components with no bridging at all.
    #
    # So the image flood decides inside from outside, and the ink test is left
    # to do the thing it is actually good at - telling two interior rooms apart.
    flood = bytearray(W * H)
    seeds = ([(x, 0) for x in range(0, W, 3)] + [(x, H - 1) for x in range(0, W, 3)] +
             [(0, y) for y in range(0, H, 3)] + [(W - 1, y) for y in range(0, H, 3)])
    stack = [(x, y) for x, y in seeds if not ink(x, y)]
    for x, y in stack:
        flood[y * W + x] = 1
    while stack:
        x, y = stack.pop()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not flood[ny * W + nx] and not ink(nx, ny):
                flood[ny * W + nx] = 1
                stack.append((nx, ny))

    # A cell is outdoors if most of it is in the flood. Five samples, not one,
    # so a cell whose exact centre lands on a stray glyph is not misread.
    def outdoors(i, j):
        hits = 0
        for fx, fy in ((.5, .5), (.3, .3), (.7, .7), (.3, .7), (.7, .3)):
            x = min(int(gx[i] + (gx[i + 1] - gx[i]) * fx), W - 1)
            y = min(int(gy[j] + (gy[j + 1] - gy[j]) * fy), H - 1)
            if flood[y * W + x]:
                hits += 1
        return hits >= 3

    cells = [(i, j) for j in range(len(gy) - 1) for i in range(len(gx) - 1)
             if not outdoors(i, j)]
    idx = {c: n for n, c in enumerate(cells)}
    par = list(range(len(cells)))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            par[ra] = rb

    # -- CLOSE THE DOORWAYS, WHICH IS THE WHOLE POINT ----------------------
    # A doorway is an unwalled edge, so it joins two rooms in the cell graph
    # exactly as it leaked the flood fill. Making the grid finer does not help;
    # it makes it worse, because a finer grid offers more paths through the gap.
    #
    # This is the principle this file was written around, finally applied: a
    # door is a SHORT BREAK IN A LINE THAT PLAINLY CONTINUES. So each gridline
    # is examined whole. Where a run of unwalled edges is flanked by wall on
    # both sides and is shorter than a door can be, it is a doorway and the line
    # is treated as continuous through it.
    #
    # DOOR_MAX is 1.6m. A single leaf is about 0.9m and a double up to 1.5m;
    # anything wider is an opening between two spaces that genuinely are one
    # space, and merging them is then the right answer rather than a failure.
    # A single door leaf is about 0.9m, a double up to 1.5m. Anything wider is
    # an opening between two spaces that genuinely ARE one space, and merging
    # them is the right answer rather than a failure. The pixel scale is not
    # known yet at this point - the area has not been applied - so it is
    # estimated from the image, which is fine because the threshold only has to
    # separate a door from a room-width opening.
    scale_px = max(W, H) / 14.0             # a flat is rarely over 14m across
    DOOR_MAX = 1.6 * scale_px

    def close_doors(axis_positions, other, lines, vertical):
        # Returns {(line_index, cell_index): walled?} with short gaps closed.
        out = {}
        for a in range(1, len(axis_positions) - 1):
            pos = axis_positions[a]
            flags = [walled(lines, pos, other[b], other[b + 1], vertical)
                     for b in range(len(other) - 1)]
            b = 0
            while b < len(flags):
                if flags[b]:
                    b += 1
                    continue
                c = b
                while c < len(flags) and not flags[c]:
                    c += 1
                gap = other[c] - other[b]
                flanked = b > 0 and c < len(flags)
                if flanked and gap <= DOOR_MAX:
                    for k in range(b, c):
                        flags[k] = True
                b = c
            for b, f in enumerate(flags):
                out[(a, b)] = f
        return out

    vwall = close_doors(gx, gy, vt, True)
    hwall = close_doors(gy, gx, hz, False)

    for (i, j) in cells:
        if (i + 1, j) in idx and not vwall.get((i + 1, j), False):
            union(idx[(i, j)], idx[(i + 1, j)])
        if (i, j + 1) in idx and not hwall.get((j + 1, i), False):
            union(idx[(i, j)], idx[(i, j + 1)])

    groups = {}
    for c in cells:
        groups.setdefault(find(idx[c]), []).append(c)

    rooms = []
    for key, g in groups.items():
        area = sum((gx[i + 1] - gx[i]) * (gy[j + 1] - gy[j]) for i, j in g)
        if area < 2500:                      # a sliver between two wall lines
            continue
        rooms.append({'cells': g, 'areaPx': area})
    rooms.sort(key=lambda r: -r['areaPx'])
    return {'W': W, 'H': H, 'gx': gx, 'gy': gy, 'hz': hz, 'vt': vt, 'rooms': rooms}


def to_spec(d, area_sqm):
    """A trace spec, in the shape scripts/render/trace.html emits — so the same
    renderer draws it and the same person can correct it."""
    gx, gy, H = d['gx'], d['gy'], d['H']
    rooms = []
    for n, r in enumerate(d['rooms'], 1):
        g = f"Room {n}"
        for (i, j) in r['cells']:
            rooms.append({
                'name': g, 'kind': 'living' if n == 1 else 'bedroom', 'group': g,
                'x': gx[i], 'y': H - gy[j + 1], 'w': gx[i + 1] - gx[i], 'd': gy[j + 1] - gy[j],
            })
    return {
        'id': 'detected', 'label': 'This unit', 'verified': False,
        'provenance': 'Rooms detected automatically from a floor plan image by '
                      'scripts/render/detect-walls.py. Every room is named "Room N" and typed by '
                      'guesswork — the detector does not name rooms, because which part of an open '
                      'space is the kitchen is a judgement with no line on the drawing behind it. '
                      'Open it in scripts/render/trace.html to name, retype and correct.',
        'units': 'px', 'areaSqm': area_sqm, 'ceilingM': 2.6, 'cutM': 1.3,
        'rooms': rooms, 'openings': [],
    }


def debug_image(path, d, out):
    im = Image.open(path).convert("RGB")
    dr = ImageDraw.Draw(im, 'RGBA')
    pal = [(230, 90, 80), (70, 150, 200), (120, 190, 110), (240, 180, 70), (170, 120, 200),
           (90, 200, 195), (235, 140, 180), (150, 160, 90), (200, 110, 60), (110, 130, 220),
           (190, 200, 120), (130, 90, 70)]
    gx, gy = d['gx'], d['gy']
    for n, r in enumerate(d['rooms']):
        c = pal[n % len(pal)]
        for i, j in r['cells']:
            dr.rectangle([gx[i], gy[j], gx[i + 1], gy[j + 1]], fill=(*c, 120))
    im.save(out)


if __name__ == '__main__':
    src = sys.argv[1]
    d = detect(src)
    px_per_sqm = sum(r['areaPx'] for r in d['rooms'])
    area = float(arg('--area', '0') or 0)
    print(f"{len(d['hz'])} horizontal walls, {len(d['vt'])} vertical walls")
    print(f"{len(d['rooms'])} rooms")
    for n, r in enumerate(d['rooms'], 1):
        share = r['areaPx'] / px_per_sqm
        print(f"  Room {n}: {len(r['cells']):3} cells" +
              (f"   {share * area:5.1f} m2" if area else f"   {share * 100:4.1f}% of the flat"))
    if arg('--debug'):
        debug_image(src, d, arg('--debug'))
        print(f"debug image: {arg('--debug')}")
    if arg('--out'):
        json.dump(to_spec(d, area), open(arg('--out'), 'w'), indent=2)
        print(f"spec: {arg('--out')}")
