/**
 * Distance and proximity. Pure functions — no I/O, no data files — so the
 * whole amenity join can be unit-tested without a network or a dataset.
 *
 * ONE RULE RUNS THROUGH THIS FILE: every distance here is STRAIGHT-LINE.
 * Nothing in it may be presented as a walking distance or a walking time.
 * Walking distance in Singapore runs roughly 1.2–1.5x the straight line, and
 * the multiplier depends on whether there is a canal, an expressway or a park
 * connector in the way — which we cannot know. Publishing a walk time we
 * cannot derive would be exactly the kind of estimate-dressed-as-fact the
 * MOP tracker was built to avoid.
 *
 * The one place straight-line is not an approximation is the MOE primary
 * school band. MOE measures home-to-school in a straight line, so 1km here
 * IS the rule's own measure, not a proxy for it. See band() below.
 */

const R = 6371008.8;               // IUGG mean Earth radius, metres
const rad = d => (d * Math.PI) / 180;

/** Great-circle distance in metres between two WGS84 points. */
export function haversine(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Cheap bounding-box prefilter. Singapore spans about 50km, so a naive
 * 13,000 records x 5,000 amenities haversine is 65M trig calls per layer.
 * Rejecting on latitude first cuts that by ~99% at this scale.
 */
/* These MUST be derived from the same sphere haversine() uses. Reaching for
   the WGS84 ellipsoid figures here instead (110574 / 111320) makes the box
   very slightly TOO SMALL in longitude — about 1.1m at a 1km cutoff — so a
   school due east at exactly 1000m would be filtered out before haversine
   ever measured it, and a page would say "no schools within 1km" when there
   is one on the line. The margin below is belt and braces on top. */
const DEG_M = (Math.PI * R) / 180;                 // metres per degree of latitude
const degLonM = lat => DEG_M * Math.cos(rad(lat));
const BOX_MARGIN = 1.001;                          // the box may over-include; it may never under-include

/**
 * The k nearest points to (lat, lon), nearest first.
 *
 * `points` are {lat, lon, ...}; everything else on the point is carried
 * through untouched, with `m` (metres, rounded) added.
 *
 * `within` caps the search radius in metres. A point beyond it is not
 * "far away", it is absent — a block with no station inside 2km should show
 * nothing rather than a station nobody would ever walk to.
 */
export function nearest(lat, lon, points, { k = 1, within = Infinity } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Array.isArray(points)) return [];
  const box = within === Infinity ? Infinity : within * BOX_MARGIN;
  const dLat = box === Infinity ? Infinity : box / DEG_M;
  const dLon = box === Infinity ? Infinity : box / Math.max(1, degLonM(lat));
  const out = [];
  for (const p of points) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) continue;
    if (Math.abs(p.lat - lat) > dLat) continue;
    if (Math.abs(p.lon - lon) > dLon) continue;
    const m = haversine(lat, lon, p.lat, p.lon);
    if (m > within) continue;
    out.push({ ...p, m: Math.round(m) });
  }
  out.sort((a, b) => a.m - b.m);
  return out.slice(0, k);
}

/**
 * MOE primary school registration bands.
 *
 * Phases 2A/2B/2C give priority by home-to-school distance in three bands:
 * within 1km, 1km to 2km, and beyond 2km. MOE measures this as a straight
 * line from the school to the home address, which is what haversine gives —
 * so this band is the rule's own measure.
 *
 * It is still only ONE input to a place. Priority is not a place: a
 * within-1km applicant can still be balloted out of an oversubscribed school,
 * and the school's registered address is a point, not its boundary. The UI
 * must say so; this function only classifies.
 */
export function band(metres) {
  if (!Number.isFinite(metres)) return null;
  if (metres <= 1000) return '1km';
  if (metres <= 2000) return '2km';
  return null;
}

/** Group schools into their MOE bands, nearest first inside each. */
export function schoolBands(lat, lon, schools) {
  const near = nearest(lat, lon, schools, { k: 200, within: 2000 });
  const within1 = [], within2 = [];
  for (const s of near) (band(s.m) === '1km' ? within1 : within2).push(s);
  return { within1, within2 };
}

/**
 * Distance for display. Metres under a kilometre, one decimal above it.
 * Never rounded to something friendlier than the input — 980m is 980m, not
 * "about 1km", because 1km is a threshold that decides school priority.
 */
export function fmtDistance(m) {
  if (!Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

/**
 * True when a straight-line distance sits close enough to the 1km line that
 * MOE's own measurement could land on the other side of it. Their geocoding
 * of a home address is not ours, and a block is a building, not a point.
 * Inside this margin the UI says "on the boundary" instead of asserting.
 */
export const BOUNDARY_M = 50;
export const nearBoundary = m => Number.isFinite(m) && Math.abs(m - 1000) <= BOUNDARY_M;

/**
 * Like nearest(), but at most one hit per `key`.
 *
 * Written for station exits: the LTA layer gives ~613 exits for ~170
 * stations, so a plain nearest(k=3) at a big interchange returns Bishan Exit
 * A, Exit B and Exit C — three rows saying one thing, and the second-nearest
 * station pushed off the list. Collapsing to the nearest exit per station
 * keeps the useful part (the distance is to a real entrance, not a centroid)
 * and drops the noise.
 */
export function nearestUnique(lat, lon, points, { k = 3, within = Infinity, key = 'name' } = {}) {
  // Over-fetch, because the k nearest points may all belong to one place.
  const pool = nearest(lat, lon, points, { k: Math.max(k * 12, 40), within });
  const seen = new Set();
  const out = [];
  for (const p of pool) {
    const id = String(p[key] ?? '').toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(p);
    if (out.length >= k) break;
  }
  return out;
}
