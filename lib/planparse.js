/**
 * Walls and rooms out of a floor plan, in the browser.
 *
 * A port of scripts/render/detect-walls.py, which is where the reasoning for
 * every step is written down at length. The short version, because the wrong
 * approaches are more useful than the right one:
 *
 *   FLOOD-FILL THE WHITE SPACE — fails. A doorway is a gap in a wall by
 *   definition, so the flood pours through it and half the flat comes back as
 *   one blob. Closing gaps wide enough to bridge a 60px door also eats the
 *   partitions; measured at radii 0 to 16, there is no setting that works.
 *
 *   WALLS ARE THE THICK INK — fails. On a real HDB plan an opening at radius 3
 *   kept 63% of the ink and what survived was only the structural blocks. Both
 *   bathrooms and both bedroom partitions are drawn at the same weight as the
 *   door arcs and the lettering.
 *
 *   WALLS ARE LONG, STRAIGHT AND AXIS-ALIGNED — works. A curve's longest
 *   axis-aligned run is a few pixels; a wall's is the length of the wall.
 *
 * ── WHY THIS IS A LIB AND NOT INSIDE THE COMPONENT ─────────────────────────
 * Every function here is pure: pixels in, geometry out, no DOM. So it runs in
 * node:test without a browser or a transform, which is the only way anything
 * on this site gets tested. The component does the canvas and the pointers.
 *
 * ── AND WHY IT RUNS ON THE READER'S MACHINE ────────────────────────────────
 * /floorplan promises the image is discarded and never stored. Detecting in
 * the browser is not an optimisation, it is that promise being true: the plan
 * is decoded into a canvas, read, and never sent anywhere. It also means no
 * server, which is what killed the idea when the renderer was Blender.
 */

export const DARK = 110;        // ink threshold, 0-255
export const MIN_RUN = 40;      // px. A wall is at least this long; a glyph is not.
export const MERGE_PX = 12;     // parallel lines closer than this are one wall

/** ImageData → 1 byte per pixel, 1 where there is ink. */
export function inkMask(data, w, h, dark = DARK) {
  const m = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < m.length; i++, p += 4) {
    /* Luminance rather than a channel: a plan scanned or photographed off a
       phone carries a colour cast, and the green channel alone reads a warm
       page as ink. */
    const l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    m[i] = l < dark ? 1 : 0;
  }
  return m;
}

function runsOf(read, n, minlen) {
  const out = [];
  let s = null;
  for (let i = 0; i < n; i++) {
    const v = read(i);
    if (v && s === null) s = i;
    else if (!v && s !== null) {
      if (i - s >= minlen) out.push([s, i]);
      s = null;
    }
  }
  if (s !== null && n - s >= minlen) out.push([s, n]);
  return out;
}

/** Runs on consecutive rows that overlap are one wall a few pixels thick. */
export function wallLines(mask, w, h, horizontal, minRun = MIN_RUN) {
  const N = horizontal ? h : w;
  const M = horizontal ? w : h;
  const done = [];
  let live = [];
  for (let a = 0; a < N; a++) {
    const read = horizontal ? b => mask[a * w + b] : b => mask[b * w + a];
    const rs = runsOf(read, M, minRun);
    const nxt = [];
    for (const r of rs) {
      let hit = null;
      for (const L of live) {
        const ov = Math.min(L.b, r[1]) - Math.max(L.a, r[0]);
        if (ov > 0.6 * Math.min(L.b - L.a, r[1] - r[0])) { hit = L; break; }
      }
      if (hit) {
        hit.a = Math.min(hit.a, r[0]);
        hit.b = Math.max(hit.b, r[1]);
        hit.end = a;
        nxt.push(hit);
      } else nxt.push({ a: r[0], b: r[1], start: a, end: a });
    }
    for (const L of live) if (!nxt.includes(L)) done.push(L);
    live = nxt;
  }
  return done.concat(live)
    .filter(L => L.b - L.a >= minRun)
    .map(L => ({ ...L, pos: (L.start + L.end) / 2 }));
}

/** A window frame draws two or three lines millimetres apart. One wall. */
export function mergeParallel(lines, tol = MERGE_PX) {
  const out = [];
  for (const L of [...lines].sort((p, q) => p.pos - q.pos)) {
    const p = out[out.length - 1];
    if (p && L.pos - p.pos <= tol) {
      p.a = Math.min(p.a, L.a);
      p.b = Math.max(p.b, L.b);
      p.pos = (p.pos + L.pos) / 2;
    } else out.push({ ...L });
  }
  return out;
}

/** Pixels reachable from the image border without crossing ink. */
export function floodOutside(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (!mask[i] && !seen[i]) { seen[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return seen;
}

const near = (vals, tol = 10) => {
  const out = [];
  for (const v of [...vals].sort((a, b) => a - b)) {
    if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  }
  return out;
};

/**
 * Rooms, from wall lines and the image behind them.
 *
 * THE GRID CARRIES A LINE WHERE EVERY WALL ENDS, not only where one sits. A
 * grid of wall positions alone cannot express a T-junction, and a flat is full
 * of them: on a real plan the wall between the main bedroom and bedroom 2 ran
 * down to y=288 and stopped, the cell either side spanned past its end, the
 * shared edge came out 46% inked against a 55% threshold, and two bedrooms
 * became one room.
 */
export function findRooms({ mask, w, h, hz, vt, minAreaPx = 2500 }) {
  const gx = near([0, ...vt.map(L => Math.round(L.pos)),
    ...hz.map(L => Math.round(L.a)), ...hz.map(L => Math.round(L.b)), w]);
  const gy = near([0, ...hz.map(L => Math.round(L.pos)),
    ...vt.map(L => Math.round(L.a)), ...vt.map(L => Math.round(L.b)), h]);

  /* Ask the IMAGE whether something is drawn between two cells, not whether a
     detected line's span happens to cover the edge. A line's span is the union
     of every run that merged into it, so a window frame at the top of a bedroom
     claims the room's whole width and then splits it in half. */
  const inked = (pos, lo, hi, vertical) => {
    const p = Math.round(pos);
    const n = Math.max(Math.round(hi - lo), 1);
    let hits = 0;
    for (let t = 0; t < n; t++) {
      const u = Math.round(lo) + t;
      for (let d = -2; d <= 2; d++) {
        const q = p + d;
        if (q < 0 || q >= (vertical ? w : h)) continue;
        if (vertical ? mask[u * w + q] : mask[q * w + u]) { hits++; break; }
      }
    }
    return hits > 0.55 * n;
  };

  /* A door is a SHORT BREAK IN A LINE THAT PLAINLY CONTINUES. Without this the
     doorway joins two rooms in the cell graph exactly as it leaked the flood
     fill, and a finer grid makes it worse by offering more paths through the
     gap. Over 1.6m is not a door, it is an opening between two spaces that
     genuinely are one space — and merging those is right, not a failure. */
  const doorMax = 1.6 * (Math.max(w, h) / 14);
  const closeDoors = (axis, other, vertical) => {
    const map = new Map();
    for (let a = 1; a < axis.length - 1; a++) {
      const flags = [];
      for (let b = 0; b < other.length - 1; b++) {
        flags.push(inked(axis[a], other[b], other[b + 1], vertical));
      }
      let b = 0;
      while (b < flags.length) {
        if (flags[b]) { b++; continue; }
        let c = b;
        while (c < flags.length && !flags[c]) c++;
        if (b > 0 && c < flags.length && other[c] - other[b] <= doorMax) {
          for (let k = b; k < c; k++) flags[k] = true;
        }
        b = c;
      }
      flags.forEach((f, b2) => map.set(`${a},${b2}`, f));
    }
    return map;
  };
  const vwall = closeDoors(gx, gy, true);
  const hwall = closeDoors(gy, gx, false);

  const out = floodOutside(mask, w, h);
  const outdoors = (i, j) => {
    let hits = 0;
    for (const [fx, fy] of [[.5, .5], [.3, .3], [.7, .7], [.3, .7], [.7, .3]]) {
      const x = Math.min(Math.round(gx[i] + (gx[i + 1] - gx[i]) * fx), w - 1);
      const y = Math.min(Math.round(gy[j] + (gy[j + 1] - gy[j]) * fy), h - 1);
      if (out[y * w + x]) hits++;
    }
    return hits >= 3;
  };

  const cells = [];
  const idx = new Map();
  for (let j = 0; j < gy.length - 1; j++) {
    for (let i = 0; i < gx.length - 1; i++) {
      if (outdoors(i, j)) continue;
      idx.set(`${i},${j}`, cells.length);
      cells.push([i, j]);
    }
  }
  const par = cells.map((_, n) => n);
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) par[ra] = rb; };

  for (const [i, j] of cells) {
    const me = idx.get(`${i},${j}`);
    const right = idx.get(`${i + 1},${j}`);
    if (right !== undefined && !vwall.get(`${i + 1},${j}`)) union(me, right);
    const down = idx.get(`${i},${j + 1}`);
    if (down !== undefined && !hwall.get(`${j + 1},${i}`)) union(me, down);
  }

  const groups = new Map();
  for (const [i, j] of cells) {
    const k = find(idx.get(`${i},${j}`));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push([i, j]);
  }
  const rooms = [];
  for (const g of groups.values()) {
    const areaPx = g.reduce((t, [i, j]) => t + (gx[i + 1] - gx[i]) * (gy[j + 1] - gy[j]), 0);
    if (areaPx < minAreaPx) continue;
    rooms.push({ cells: g, areaPx });
  }
  rooms.sort((a, b) => b.areaPx - a.areaPx);
  return { gx, gy, rooms };
}

/** Everything, from one ImageData. */
export function parsePlan(data, w, h, extraWalls = []) {
  const mask = inkMask(data, w, h);
  const hz = mergeParallel([
    ...wallLines(mask, w, h, true).filter(L => L.pos > 20 && L.pos < h - 20),
    ...extraWalls.filter(e => e.horizontal).map(e => ({ a: e.a, b: e.b, pos: e.pos, start: e.pos, end: e.pos })),
  ]);
  const vt = mergeParallel([
    ...wallLines(mask, w, h, false).filter(L => L.pos > 20 && L.pos < w - 20),
    ...extraWalls.filter(e => !e.horizontal).map(e => ({ a: e.a, b: e.b, pos: e.pos, start: e.pos, end: e.pos })),
  ]);
  /* A wall the reader drew is a wall, so it is painted into the mask as well
     as added to the line list — otherwise the ink test, which asks the image
     rather than the lines, would not see it and the rooms would not split. */
  for (const e of extraWalls) {
    for (let t = Math.round(e.a); t < Math.round(e.b); t++) {
      for (let d = -2; d <= 2; d++) {
        const p = Math.round(e.pos) + d;
        if (e.horizontal) { if (p >= 0 && p < h) mask[p * w + t] = 1; }
        else if (p >= 0 && p < w) mask[t * w + p] = 1;
      }
    }
  }
  return { mask, hz, vt, ...findRooms({ mask, w, h, hz, vt }) };
}

/** Rooms → the spec shape scripts/render/trace.html emits, so one renderer
 *  draws both and one person can correct either. */
export function toSpec({ gx, gy, rooms, h, areaSqm, kinds = {} }) {
  const out = [];
  rooms.forEach((r, n) => {
    const name = kinds[n]?.name || `Room ${n + 1}`;
    const kind = kinds[n]?.kind || 'living';
    for (const [i, j] of r.cells) {
      out.push({
        name, kind, group: name,
        x: gx[i], y: h - gy[j + 1], w: gx[i + 1] - gx[i], d: gy[j + 1] - gy[j],
        ...(kinds[n]?.exclude ? { includeInArea: false } : {}),
      });
    }
  });
  return {
    id: 'detected', label: 'This unit', verified: false,
    provenance: 'Detected from a floor plan image in the reader’s own browser. '
      + 'The image was never uploaded. Room names and types are the reader’s; '
      + 'the detector does not name rooms.',
    units: 'px', areaSqm, ceilingM: 2.6, cutM: 1.3, rooms: out, openings: [],
  };
}

/**
 * The stated area becomes a scale, and near-miss edges become shared lines.
 *
 * Both steps exist in scripts/render/layout.py too, and that duplication is
 * real: Blender ships its own Python and cannot import this file. It is
 * tolerated ONLY because the two are checked against each other — the JS port
 * of the detector was run against the Python on the same plan and returned the
 * same 17 horizontal walls, 27 vertical walls and 21 rooms with identical
 * areas. If either side changes, that comparison is the thing to re-run.
 *
 * A hand trace cannot click the same pixel twice, and a detector lands edges on
 * whichever pixel the ink happened to start. Either way, edges that are plainly
 * one wall arrive a few pixels apart, and two walls a few pixels apart are
 * coincident faces — which is how three separate renders came out black.
 */
export function scaleAndSnap(spec, snapM = 0.15) {
  const R = spec.rooms.map(r => ({ ...r }));
  const O = (spec.openings || []).map(o => ({ ...o }));
  let scale = 1;
  if (spec.units && spec.units !== 'm') {
    const traced = R.filter(r => r.includeInArea !== false)
      .reduce((t, r) => t + r.w * r.d, 0);
    if (!traced || !spec.areaSqm) return { rooms: R, openings: O, scale: null };
    scale = Math.sqrt(spec.areaSqm / traced);
    for (const r of R) { r.x *= scale; r.y *= scale; r.w *= scale; r.d *= scale; }
    for (const o of O) { o.x *= scale; o.y *= scale; o.w *= scale; }
  }
  for (const [key, size] of [['x', 'w'], ['y', 'd']]) {
    const edges = [...new Set(R.flatMap(r => [+r[key].toFixed(4), +(r[key] + r[size]).toFixed(4)]))]
      .sort((a, b) => a - b);
    const groups = [];
    let cur = [edges[0]];
    for (let i = 1; i < edges.length; i++) {
      if (edges[i] - cur[cur.length - 1] <= snapM) cur.push(edges[i]);
      else { groups.push(cur); cur = [edges[i]]; }
    }
    groups.push(cur);
    const table = new Map();
    for (const g of groups) {
      const c = g.reduce((a, b) => a + b, 0) / g.length;
      for (const v of g) table.set(v, c);
    }
    for (const r of R) {
      const a = table.get(+r[key].toFixed(4));
      const b = table.get(+(r[key] + r[size]).toFixed(4));
      r[key] = a;
      r[size] = Math.max(b - a, 0.05);
    }
  }
  return { rooms: R, openings: O, scale };
}

/* Palette and furniture, as a measured value ladder about ten points a rung.
   The first version of the Blender render pitched everything between 81% and
   96% luminance and half the frame came back within 0.4 points of itself. Walls
   are brightest because walls are what define a layout; the ground sits mid so
   the flat reads as an object standing on a surface. */
export const PAL = {
  floor: [174, 166, 154], wet: [210, 210, 206], wall: [237, 234, 227],
  furn: [97, 91, 82], soft: [126, 131, 127], ground: [145, 142, 135],
};
const WET = new Set(['bath', 'kitchen', 'yard', 'shelter', 'wc']);
/* Real retail sizes, and nothing is drawn in a room it does not fit in —
   "a queen does not go in here" is the answer a plan is bad at giving. */
const FURNITURE = {
  living: [[2.20, 0.90, 0.75, 'soft', 'S'], [1.80, 0.40, 0.50, 'furn', 'N']],
  dining: [[1.40, 0.85, 0.75, 'furn', 'C']],
  master: [[1.83, 2.03, 0.55, 'soft', 'C'], [1.80, 0.60, 1.30, 'furn', 'N']],
  bedroom: [[1.22, 1.90, 0.50, 'soft', 'C'], [1.20, 0.60, 1.30, 'furn', 'N']],
  kitchen: [[0.60, 2.40, 0.90, 'furn', 'RUN']],
  bath: [[0.55, 0.45, 0.85, 'furn', 'N']],
};

/** A spec → axis-aligned boxes, centred on the flat. Same three wall rules as
 *  scripts/render/layout.py: split every edge line at its breakpoints, count
 *  coverage, and skip a seam interior to one group. */
export function buildBoxes(spec, { cut = 1.3, extWall = 0.2, intWall = 0.1 } = {}) {
  const { rooms: R, openings: O } = scaleAndSnap(spec);
  const xs = R.flatMap(r => [r.x, r.x + r.w]);
  const ys = R.flatMap(r => [r.y, r.y + r.d]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const out = [];
  const B = (x, y, z, sx, sy, sz, c) => out.push({ x: x - cx, y: y - cy, z, sx, sy, sz, c });

  for (const r of R) {
    B(r.x + r.w / 2, r.y + r.d / 2, -0.05, r.w, r.d, 0.1,
      WET.has(r.kind) ? PAL.wet : PAL.floor);
  }

  const gid = r => r.group || r.name;
  const lines = new Map();
  for (const r of R) {
    for (const [o, c, a, b] of [['h', r.y, r.x, r.x + r.w], ['h', r.y + r.d, r.x, r.x + r.w],
      ['v', r.x, r.y, r.y + r.d], ['v', r.x + r.w, r.y, r.y + r.d]]) {
      const k = `${o}:${c.toFixed(3)}`;
      if (!lines.has(k)) lines.set(k, { o, c, iv: [] });
      lines.get(k).iv.push([a, b, gid(r)]);
    }
  }
  for (const { o, c, iv } of lines.values()) {
    const cuts = [...new Set(iv.flatMap(([a, b]) => [a, b]))].sort((p, q) => p - q);
    for (let i = 0; i < cuts.length - 1; i++) {
      const lo = cuts[i], hi = cuts[i + 1], mid = (lo + hi) / 2;
      if (hi - lo < 0.02) continue;
      const cov = iv.filter(([a, b]) => a < mid && mid < b).map(v => v[2]);
      if (!cov.length) continue;
      if (cov.length > 1 && new Set(cov).size === 1) continue;   // one room's own seam
      const th = cov.length > 1 ? intWall : extWall;
      const ops = O.filter(op => Math.abs((o === 'h' ? op.y : op.x) - c) <= 0.05)
        .map(op => { const a = o === 'h' ? op.x : op.y; return [a, a + op.w, op.kind, op.sillM || 0]; })
        .filter(([a, b]) => !(b <= lo || a >= hi))
        .map(([a, b, k, s]) => [Math.max(a, lo), Math.min(b, hi), k, s])
        .sort((p, q) => p[0] - q[0]);
      const pieces = [];
      let cur = lo;
      for (const [a, b, kind, sill] of ops) {
        if (a > cur) pieces.push([cur, a, cut]);
        if (kind === 'window' && sill > 0) pieces.push([a, b, Math.min(sill, cut)]);
        cur = Math.max(cur, b);
      }
      if (cur < hi) pieces.push([cur, hi, cut]);
      for (const [a, b, hgt] of pieces) {
        if (b - a < 0.02 || hgt < 0.02) continue;
        const m = (a + b) / 2;
        if (o === 'h') B(m, c, hgt / 2, b - a, th, hgt, PAL.wall);
        else B(c, m, hgt / 2, th, b - a, hgt, PAL.wall);
      }
    }
  }

  const byGroup = new Map();
  for (const r of R) {
    const g = gid(r);
    const p = byGroup.get(g);
    if (!p || r.w * r.d > p.w * p.d) byGroup.set(g, r);
  }
  for (const r of byGroup.values()) {
    for (const [fw0, fd0, fh, mat, anchor] of (FURNITURE[r.kind] || [])) {
      let fw = fw0, fd = fd0;
      if (fw > r.w - 0.15 || fd > r.d - 0.15) continue;
      let bx, by;
      if (anchor === 'C') { bx = r.x + r.w / 2; by = r.y + r.d / 2; }
      else if (anchor === 'N') { bx = r.x + r.w / 2; by = r.y + r.d - fd / 2 - 0.05; }
      else if (anchor === 'S') { bx = r.x + r.w / 2; by = r.y + fd / 2 + 0.05; }
      else { bx = r.x + fw / 2 + 0.05; by = r.y + r.d / 2; fd = Math.min(r.d - 0.2, 2.4); }
      B(bx, by, fh / 2, fw, fd, fh, PAL[mat]);
    }
  }
  return { boxes: out, span };
}
