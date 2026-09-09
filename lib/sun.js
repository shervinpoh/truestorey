/**
 * Where the sun is, from a coordinate and a moment.
 *
 * ── WHY THIS IS ALLOWED TO EXIST HERE ──────────────────────────────────────
 * Every other figure on this site is read from a published dataset, because a
 * figure this site cannot source is a figure it does not print. Solar position
 * is the one exception that does not break the rule: it is not an estimate of
 * anything, it is astronomy. Given a latitude, a longitude and a timestamp the
 * answer is determined, checkable by anyone with the same formulas, and it
 * does not change when a dataset is refreshed.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 * It says where the sun IS. It says nothing about whether you can see it. A
 * shadow needs building footprints and heights, and this repo holds neither —
 * drawing one would be rule 13 exactly, geometry the data does not contain.
 * The competitor's tool draws shadows; it also holds a 3D building model.
 *
 * So the honest half is the half that needs no model: the bearing the sun
 * arrives on, and the time of year it arrives there.
 *
 * ── ACCURACY ───────────────────────────────────────────────────────────────
 * The low-precision algorithm from the Astronomical Almanac, good to about
 * 0.01° over this century — three orders of magnitude finer than anything a
 * reader could act on, and far finer than the ±23° swing the page is about.
 * Refraction near the horizon is not modelled; it lifts an apparent sunset by
 * roughly half a degree and would make the page claim a precision the subject
 * does not have.
 */

const RAD = Math.PI / 180;
const norm360 = d => ((d % 360) + 360) % 360;

/** Days since J2000.0, from a JS Date (which is UTC internally). */
function days(date) {
  return date.getTime() / 86400000 - 10957.5;
}

/**
 * Altitude above the horizon and azimuth measured clockwise from true north.
 * Negative altitude means below the horizon.
 */
export function solarPosition(lat, lon, date) {
  const n = days(date);

  // Mean longitude and mean anomaly of the sun.
  const L = norm360(280.460 + 0.9856474 * n);
  const g = norm360(357.528 + 0.9856003 * n) * RAD;

  // Ecliptic longitude, then the obliquity of the ecliptic.
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;

  // Right ascension and declination.
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));

  // Greenwich mean sidereal time, then the local hour angle.
  const gmst = norm360(280.46061837 + 360.98564736629 * n);
  const lst = (gmst + lon) * RAD;
  const ha = lst - ra;

  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));

  return {
    altitude: alt / RAD,
    azimuth: norm360(az / RAD + 180),   // atan2 form gives south-zero; +180 → north-zero
    declination: dec / RAD,
  };
}

/**
 * The bearing the sun sets on, for a given declination.
 *
 * cos(A) = sin(dec) / cos(lat), the standard sunrise/sunset azimuth. At
 * Singapore's latitude this swings between about 247° in December and 293° in
 * June — a 47° arc, which is the whole point of the feature: a facing that
 * takes the sun full-on in December may take none of it in June.
 */
export function sunsetAzimuth(lat, declination) {
  const c = Math.sin(declination * RAD) / Math.cos(lat * RAD);
  if (c < -1 || c > 1) return null;              // no sunset: not at this latitude
  return 360 - Math.acos(c) / RAD;
}

/** The extremes of that arc, which are the solstices. */
export function sunsetArc(lat) {
  const dec = 23.44;
  return { from: sunsetAzimuth(lat, -dec), to: sunsetAzimuth(lat, dec), atEquinox: sunsetAzimuth(lat, 0) };
}

/**
 * The stretch of the afternoon when the sun is low enough to come in a window
 * rather than over the roof, and the bearings it occupies while it does.
 *
 * BELOW is 15°. Near the equator the sun is overhead for most of the day, so
 * the west-facing complaint is not about noon — it is about the last hour,
 * when altitude drops far enough that a window takes the beam side-on. 15° is
 * roughly that hour; it is a threshold, and it is stated rather than hidden so
 * a reader can disagree with it.
 */
export const LOW_SUN_DEG = 15;

export function lowSunWindow(lat, lon, date, { below = LOW_SUN_DEG } = {}) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  let start = null, end = null, from = null, to = null, peak = -90;

  /* Every four minutes through the afternoon, in UTC. Singapore is UTC+8, and
     its clock runs about an hour ahead of its sun because the country sits
     16° west of the meridian its time zone is named for — so "6pm" here is
     nearer 5pm solar. Working in UTC and formatting once at the end keeps that
     out of the arithmetic. */
  for (let m = 240; m <= 900; m += 4) {          // 12:00–19:00 SGT
    const t = new Date(day.getTime() + m * 60000);
    const { altitude, azimuth } = solarPosition(lat, lon, t);
    if (altitude > peak) peak = altitude;
    if (altitude <= 0 || altitude > below) continue;
    if (!start) { start = t; from = azimuth; }
    end = t; to = azimuth;
  }
  if (!start) return null;
  return { start, end, from, to, peakAltitude: peak };
}

/** HH:MM in Singapore time, for a UTC instant. */
export const sgTime = d => d.toLocaleTimeString('en-SG', {
  hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore',
});

/** Bearing from one coordinate to another, degrees clockwise from true north. */
export function bearingTo(aLat, aLon, bLat, bLon) {
  const p1 = aLat * RAD, p2 = bLat * RAD, dl = (bLon - aLon) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(Math.atan2(y, x) / RAD);
}

/** N, NNE, NE … for a bearing. Sixteen points: eight is too coarse for a 47° arc. */
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = b => POINTS[Math.round(norm360(b) / 22.5) % 16];
