/**
 * The buildings around one home, in local metres — for Sunward.
 *
 * Server-side only: a block or project page ships the few dozen footprints
 * within reach of it, never data/buildings.json. Long-tail pages render on
 * demand, so next.config.mjs INCLUDES the file for the HDB block and condo routes —
 * and must never exclude it, or Sunward silently vanishes in production.
 *
 * `m` is a height in metres or null. Null means no published height: drawn
 * flat, and never counted as blocking the sun (lib/sunlight.js). `src` says
 * where a height came from, so the page can say what it rests on.
 */
import fs from 'node:fs';
import path from 'node:path';

const CELL = 0.002;                       // ≈ 220 m
let _b;

function all() {
  if (_b !== undefined) return _b;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'buildings.json'), 'utf8')); }
  catch { return (_b = null); }
  const list = raw.b.map(([m, src, label, storeys, flat]) => {
    const ring = [];
    let lat = flat[0], lon = flat[1];
    ring.push([lat / 1e5, lon / 1e5]);
    for (let i = 2; i < flat.length; i += 2) { lat += flat[i]; lon += flat[i + 1]; ring.push([lat / 1e5, lon / 1e5]); }
    return { m, src, label, storeys, ring };
  });
  const grid = new Map();
  list.forEach((b, i) => {
    const [lat, lon] = b.ring[0];
    const k = `${Math.floor(lat / CELL)}|${Math.floor(lon / CELL)}`;
    (grid.get(k) || grid.set(k, []).get(k)).push(i);
  });
  return (_b = { meta: raw, list, grid });
}

function inside(lat, lon, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Footprints within `radius` metres of a point, in local metres around it,
 * nearest first; `own` is the footprint containing the point, or the nearest
 * one within 40 m, or -1. Null when no buildings file is loaded.
 */
export function massingAround(lat, lon, radius = 320) {
  const B = all();
  if (!B) return null;
  /* A tile the ingest could not read: buildings would be missing without the
     page knowing, so there is no answer here rather than a wrong one. */
  const pad = radius / 111000;
  if ((B.meta.missing || []).some(([s, w, n, e]) => lat + pad > s && lat - pad < n && lon + pad > w && lon - pad < e)) return null;
  const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110574;
  const reach = Math.ceil(radius / 200) + 1;
  const ci = Math.floor(lat / CELL), cj = Math.floor(lon / CELL);
  const found = [];
  for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) {
    for (const i of B.grid.get(`${ci + a}|${cj + b}`) || []) {
      const bd = B.list[i];
      const ring = bd.ring.map(([la, lo]) => [Math.round((lo - lon) * kx * 10) / 10, Math.round((la - lat) * ky * 10) / 10]);
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const dist = Math.hypot(cx, cy);
      if (dist > radius) continue;
      found.push({ m: bd.m, src: bd.src, label: bd.label, storeys: bd.storeys, ring, dist: Math.round(dist), contains: inside(lat, lon, bd.ring) });
    }
  }
  found.sort((a, b) => a.dist - b.dist);
  let own = found.findIndex(b => b.contains);
  if (own < 0) own = found.findIndex(b => b.dist <= 40);
  /* Smaller buildings the ingest counted rather than stored. */
  let small = 0;
  const sc = B.meta.small?.cell || 1 / 900;
  const r = Math.ceil(radius / 111320 / sc) + 1;
  const si = Math.floor(lat / sc), sj = Math.floor(lon / sc);
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) small += B.meta.small?.counts?.[`${si + a}|${sj + b}`] || 0;
  return {
    own,
    buildings: found.map(({ contains, ...b }) => b),
    small,
    floor: B.meta.floor,
    minArea: B.meta.minArea,
    licence: B.meta.licence,
    accessedAt: String(B.meta.accessedAt).slice(0, 10),
  };
}

/** How much of the island the model holds: tiles the ingest could not read. */
export function coverage() {
  const B = all();
  return B ? { missing: (B.meta.missing || []).length } : null;
}
