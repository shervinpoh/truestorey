/**
 * Sun on one window: the geometry, with the buildings in the way.
 *
 * ── THE QUESTION ───────────────────────────────────────────────────────────
 * "How much sun does this unit get?" is asked of a window, not a building:
 * a floor, a facing, and whatever stands between it and the sun. This answers
 * it month by month and hour by hour, from where the sun is (lib/sun.js,
 * astronomy) and the footprints and heights around it (lib/massing.js, from
 * HDB and OpenStreetMap). A building with no published height never blocks
 * anything here, and the result says how many such buildings were in the way.
 *
 * ── WHAT IT LEAVES OUT ─────────────────────────────────────────────────────
 * Trees, balconies, ledges, overhangs and the unit's own window reveal —
 * none is in any dataset. It is DIRECT sun on the facade plane, which is what
 * heats a room and what a buyer means by "west sun". Near the equator the sun
 * is high for most of the day, so a facade sees it mainly in the first and
 * last hours; that is a finding, not a flaw.
 *
 * Pure, and small enough to run in the browser on every change of floor or
 * facing. Coordinates are local metres: x east, y north, z up.
 */
import { solarPosition } from './sun.js';

const RAD = Math.PI / 180;
export const HOURS = [7, 19];          // Singapore time; the sun is below the horizon outside it
export const STEP_MIN = 10;
export const FACINGS = [
  { key: 'N', deg: 0 }, { key: 'NE', deg: 45 }, { key: 'E', deg: 90 }, { key: 'SE', deg: 135 },
  { key: 'S', deg: 180 }, { key: 'SW', deg: 225 }, { key: 'W', deg: 270 }, { key: 'NW', deg: 315 },
];

/** Degrees between two bearings, 0–180. */
export const offBy = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };

/** A Date for Singapore time on a given day. SGT is UTC+8 all year. */
export const sgt = (year, month, day, hour, minute = 0) => new Date(Date.UTC(year, month, day, hour - 8, minute));

/** Sun position with the horizontal unit vector it shines FROM. */
export function sunAt(lat, lon, date) {
  const p = solarPosition(lat, lon, date);
  return { ...p, dx: Math.sin(p.azimuth * RAD), dy: Math.cos(p.azimuth * RAD) };
}

/**
 * Distance along a ray (origin o, unit direction d) to where it first crosses
 * into polygon `ring`. 0 when it starts inside, Infinity when it never enters.
 */
export function rayEntry(o, d, ring) {
  let best = Infinity, inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j], [x2, y2] = ring[i];
    if ((y2 > o[1]) !== (y1 > o[1]) && o[0] < ((x1 - x2) * (o[1] - y2)) / (y1 - y2) + x2) inside = !inside;
    const ex = x2 - x1, ey = y2 - y1;
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((x1 - o[0]) * ey - (y1 - o[1]) * ex) / den;
    const u = ((x1 - o[0]) * d[1] - (y1 - o[1]) * d[0]) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return inside ? 0 : best;
}

/**
 * A point on the building's facade facing `facing`: out from the footprint's
 * centre along that bearing to the wall, then half a metre beyond it, at
 * height z.
 */
export function windowOn(ring, facing, z) {
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length;
  const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  const d = [Math.sin(facing * RAD), Math.cos(facing * RAD)];
  let t = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j], [x2, y2] = ring[i];
    const ex = x2 - x1, ey = y2 - y1, den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const tt = ((x1 - cx) * ey - (y1 - cy) * ex) / den;
    const u = ((x1 - cx) * d[1] - (y1 - cy) * d[0]) / den;
    if (tt > 0 && u >= 0 && u <= 1 && tt > t) t = tt;
  }
  return { x: cx + d[0] * (t + 0.5), y: cy + d[1] * (t + 0.5), z };
}

/**
 * Is the window in direct sun at this moment, and if not, why.
 * Returns { lit, why: 'night' | 'behind' | 'blocked' | 'lit', by, unknown }.
 */
export function litAt(win, facing, sun, buildings, ownIndex = -1) {
  if (sun.altitude <= 0) return { lit: false, why: 'night' };
  if (offBy(sun.azimuth, facing) >= 90) return { lit: false, why: 'behind' };
  const tan = Math.tan(sun.altitude * RAD);
  const o = [win.x, win.y], d = [sun.dx, sun.dy];
  let unknown = 0;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (i === ownIndex && b.m !== null) {
      // The home's own building can still shade its own window on an L or a U.
      const t = rayEntry(o, d, b.ring);
      if (t < Infinity && t > 0.1 && win.z + t * tan < b.m) return { lit: false, why: 'blocked', by: i };
      continue;
    }
    const t = rayEntry(o, d, b.ring);
    if (t === Infinity) continue;
    if (b.m === null) { unknown++; continue; }
    if (win.z + t * tan < b.m) return { lit: false, why: 'blocked', by: i, unknown };
  }
  return { lit: true, why: 'lit', unknown };
}

/**
 * Minutes of direct sun on the window, for the 15th of each month, in each
 * hour from 07:00 to 19:00 Singapore time, sampled every STEP_MIN minutes.
 */
export function sunOnWindow({ lat, lon, win, facing, buildings, ownIndex = -1, year = new Date().getUTCFullYear() }) {
  const grid = [], totals = [], blockers = new Map();
  let unknownMinutes = 0, afternoon = 0;
  for (let mo = 0; mo < 12; mo++) {
    const row = new Array(HOURS[1] - HOURS[0]).fill(0);
    for (let h = HOURS[0]; h < HOURS[1]; h++) {
      for (let m = 0; m < 60; m += STEP_MIN) {
        const sun = sunAt(lat, lon, sgt(year, mo, 15, h, m + STEP_MIN / 2));
        const r = litAt(win, facing, sun, buildings, ownIndex);
        if (r.lit) {
          row[h - HOURS[0]] += STEP_MIN;
          if (h >= 15) afternoon += STEP_MIN;
          if (r.unknown) unknownMinutes += STEP_MIN;
        } else if (r.why === 'blocked') {
          blockers.set(r.by, (blockers.get(r.by) || 0) + STEP_MIN);
        }
      }
    }
    grid.push(row);
    totals.push(row.reduce((a, b) => a + b, 0));
  }
  return {
    grid, totals, afternoonMinutesPerYear: afternoon,
    blockers: [...blockers].sort((a, b) => b[1] - a[1]).map(([i, min]) => ({ index: i, minutes: min })),
    unknownMinutes,
  };
}

/**
 * A building's shadow on the ground: its footprint swept away from the sun
 * by height / tan(altitude), as the hull of the footprint and its shifted
 * copy. Null when the sun is down or the height is not known.
 */
export function groundShadow(ring, height, sun) {
  if (height === null || sun.altitude <= 0.5) return null;
  const len = Math.min(height / Math.tan(sun.altitude * RAD), 600);
  const sx = -sun.dx * len, sy = -sun.dy * len;
  return hull([...ring, ...ring.map(([x, y]) => [x + sx, y + sy])]);
}

function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
