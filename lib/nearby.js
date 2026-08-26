/**
 * The amenity join itself, kept pure and out of the build script so it can be
 * tested without a dataset, a network or a filesystem. scripts/build-nearby.mjs
 * is then only a loop over shards and a file writer.
 */
import { nearest, nearestUnique, schoolBands } from './geo.js';

/** How many of each layer a record keeps. Beyond this it is a directory, not context. */
export const KEEP = { rail: 3, hawker: 3, parks: 3, childcare: 6, malls: 3, schools: 4 };

/**
 * Everything around one point.
 *
 * `layers` is the map from data/amenities.json: { rail: {points, within}, … }.
 * Schools are split out of the generic path because only PRIMARY schools carry
 * MOE's band rule — and the split is made on MOE's own level column, never
 * inferred from a school's name, which would misfile every "Primary" that is
 * really a secondary campus.
 */
export function nearFor({ lat, lon, match }, layers = {}, { order = [], keep = KEEP } = {}) {
  const near = { at: { lat, lon, match } };
  let any = false;

  for (const key of order) {
    if (key === 'schools') continue;
    const L = layers[key];
    if (!L?.points?.length) continue;
    // `dedupe` marks a layer whose points are not one-per-place — station
    // exits, currently. Without it a single interchange fills the list.
    const pick = L.dedupe ? nearestUnique : nearest;
    const hits = pick(lat, lon, L.points, { k: keep[key] ?? 3, within: L.within ?? 1500 });
    if (hits.length) { near[key] = hits; any = true; }
  }

  const all = layers.schools?.points || [];
  const primaries = all.filter(isPrimary);
  const others = all.filter(s => !isPrimary(s));

  if (primaries.length) {
    const { within1, within2 } = schoolBands(lat, lon, primaries);
    if (within1.length || within2.length) { near.primary = { within1, within2 }; any = true; }
  }
  if (others.length) {
    const hits = nearest(lat, lon, others, { k: keep.schools ?? 4, within: layers.schools?.within ?? 2000 });
    if (hits.length) { near.schools = hits; any = true; }
  }

  return any ? near : null;
}

/**
 * Does this school take a Primary 1 intake — and therefore fall under MOE's
 * 1km registration rule?
 *
 * Read from MOE's own mainlevel_code, never from the name. The code is usually
 * "PRIMARY", but three through-train schools are coded "MIXED LEVEL (P1-S4)":
 * Catholic High, CHIJ St Nicholas Girls', and Maris Stella High. They register
 * a P1 cohort like any other primary school, and they are among the schools
 * people most want the 1km answer for — so testing for the word "PRIMARY"
 * alone silently dropped the three that matter most.
 *
 * "MIXED LEVEL (S1-JC2)" and friends must NOT match: no P1 intake, no band.
 */
export const isPrimary = s => /PRIMARY|\bP1\b/i.test(s?.level || '');
