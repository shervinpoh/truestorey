import fs from 'node:fs';
import path from 'node:path';
import { haversine } from '../geo.js';

/**
 * The measurements the rubric scores.
 *
 * Everything here is arithmetic over files already in the repo. No model is
 * involved and none is needed — a percentile and a radius search are not
 * things worth asking a language model to do, and asking one would make the
 * answer non-reproducible for no gain.
 *
 * Each function returns null rather than a guess when it has nothing to work
 * with. The rubric treats null as "did not run" and says so on the page.
 */

const dataPath = f => path.join(process.cwd(), 'data', f);
const load = (f, fallback = null) => {
  const p = dataPath(f);
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
};

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ── the flat index of every HDB block with a coordinate and a unit count ──
 * Built once and cached. 10,796 blocks is small enough to scan linearly for a
 * radius query — a spatial index would be faster and would also be the first
 * thing to rot, because nothing else in this repo needs one. */
let _blocks = null;
export function hdbBlocks() {
  if (_blocks) return _blocks;
  const mop = load('mop.json');
  const geo = load('geo.json');
  if (!mop?.towns || !geo?.records) { _blocks = []; return _blocks; }

  const out = [];
  for (const town of Object.values(mop.towns)) {
    for (const year of Object.values(town.byYear || {})) {
      for (const b of year.list || []) {
        const href = `/hdb/${slug(b.town)}/${slug(`${b.block} ${b.street}`)}`;
        const g = geo.records[href];
        if (!g) continue;                       // ~12% have no filed resale, so no geocode
        out.push({
          href, lat: g.lat, lon: g.lon,
          units: Number(b.units) || 0,
          earliestMop: Number(b.earliestMop) || null,
        });
      }
    }
  }
  _blocks = out;
  return _blocks;
}

/**
 * How much of the MOP register we can actually place on a map.
 *
 * This exists because the check below was silently broken. The geocoder walks
 * data/records/, which only contains blocks that have already sold — and a
 * block reaching its fifth year for the FIRST time has never sold. So 94% of
 * the blocks the supply check is about had no coordinate, the radius search
 * found almost none of them, and every property came back with near-zero
 * supply risk. Confidently wrong, in the reassuring direction.
 *
 * `npm run geocode` now includes the MOP register and fixes it. Until it has
 * been run, this returns a low number and the check falls back to the town,
 * where the data is complete.
 */
let _coverage = null;
export function mopCoverage({ years = 5, from = new Date() } = {}) {
  if (_coverage) return _coverage;
  const mop = load('mop.json');
  const geo = load('geo.json');
  if (!mop?.towns || !geo?.records) return (_coverage = { total: 0, placed: 0, ratio: 0 });

  const thisYear = from.getFullYear(), until = thisYear + years;
  let total = 0, placed = 0;
  for (const town of Object.values(mop.towns)) {
    for (const year of Object.values(town.byYear || {})) {
      for (const b of year.list || []) {
        if (!(b.earliestMop >= thisYear && b.earliestMop <= until)) continue;
        total++;
        const href = `/hdb/${slug(b.town)}/${slug(`${b.block} ${b.street}`)}`;
        if (geo.records[href]) placed++;
      }
    }
  }
  return (_coverage = { total, placed, ratio: total ? placed / total : 0 });
}

/** Below this, a radius search is measuring the geocoder rather than the market. */
const COVERAGE_FLOOR = 0.6;

/** The same question at town level, where the register is complete. */
export function supplyInTown(townName, { years = 5, from = new Date() } = {}) {
  const mop = load('mop.json');
  const town = mop?.towns?.[String(townName || '').toUpperCase()];
  if (!town?.byYear) return null;

  const thisYear = from.getFullYear(), until = thisYear + years;
  let upcomingUnits = 0, upcomingBlocks = 0;
  for (const year of Object.values(town.byYear)) {
    for (const b of year.list || []) {
      if (b.earliestMop >= thisYear && b.earliestMop <= until) {
        upcomingUnits += Number(b.units) || 0;
        upcomingBlocks++;
      }
    }
  }
  if (!town.units) return null;
  return {
    basis: 'town', town: town.town, years,
    totalUnits: town.units, upcomingUnits, upcomingBlocks,
    ratio: upcomingUnits / town.units,
  };
}

/**
 * Flats reaching their fifth year nearby, as a share of the stock around them.
 *
 * The share matters more than the count: two thousand units reaching MOP is a
 * different problem in Tampines than on Sentosa, and only the ratio says which
 * one you are in.
 *
 * Measured over a 2km radius when the MOP register is well enough geocoded to
 * support one, and over the town when it is not. The basis is returned either
 * way, because "12% within 2km" and "12% across Tampines" are different claims
 * and the page has to be able to say which it is showing.
 */
export function supplyWithin(lat, lon, { km = 2, years = 5, town = null, from = new Date() } = {}) {
  const coverage = mopCoverage({ years, from });
  if (coverage.ratio < COVERAGE_FLOOR) {
    const t = supplyInTown(town, { years, from });
    return t ? { ...t, coverage, fellBack: true } : null;
  }

  const blocks = hdbBlocks();
  if (!blocks.length || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const thisYear = from.getFullYear(), until = thisYear + years;
  let totalUnits = 0, upcomingUnits = 0, upcomingBlocks = 0, near = 0;

  for (const b of blocks) {
    if (haversine(lat, lon, b.lat, b.lon) > km * 1000) continue;
    near++;
    totalUnits += b.units;
    if (b.earliestMop && b.earliestMop >= thisYear && b.earliestMop <= until) {
      upcomingUnits += b.units;
      upcomingBlocks++;
    }
  }
  // A handful of blocks in radius is not a market. Below this the ratio swings
  // wildly on one block and would be a number pretending to be a measurement.
  if (near < 20 || totalUnits < 1000) return supplyInTown(town, { years, from });

  return {
    basis: 'radius', km, years, blocksInRadius: near,
    totalUnits, upcomingUnits, upcomingBlocks,
    ratio: upcomingUnits / totalUnits,
    coverage,
  };
}

/**
 * Where an asking psf sits among what has actually transacted at this address.
 *
 * Deliberately the SAME BUILDING and nothing wider. Comparing against the town
 * would smuggle in the estate, which is the mistake Tower View exists to avoid
 * and the same mistake would be worse here, where the output is about one unit.
 *
 * `recent` holds up to 20 filed sales. The sample size is returned so the page
 * can print it — a percentile off five sales is a different claim from one off
 * twenty, and the reader is entitled to know which they are looking at.
 */
export function pricePercentile(rec, askingPsf, { months = 12, min = 5, now = new Date() } = {}) {
  if (!rec?.recent?.length || !Number.isFinite(askingPsf) || askingPsf <= 0) return null;

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  const key = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  const psf = rec.recent
    .filter(s => String(s.month) >= key && Number.isFinite(s.psf))
    .map(s => s.psf)
    .sort((a, b) => a - b);

  if (psf.length < min) return null;

  const below = psf.filter(v => v < askingPsf).length;
  return {
    percentile: below / psf.length,
    sample: psf.length,
    months,
    low: Math.round(psf[0]),
    median: Math.round(psf[(psf.length - 1) >> 1]),
    high: Math.round(psf[psf.length - 1]),
    asking: Math.round(askingPsf),
  };
}

/* ── the two that need an ingest ──────────────────────────────────────────
 * Both return null until their dataset exists, which the rubric renders as
 * "did not run" rather than as a clean bill of health. */

export function glsWithin(lat, lon, { km = 1 } = {}) {
  const gls = load('gls.json');
  if (!gls?.sites?.length || !Number.isFinite(lat)) return null;
  let units = 0; const sites = [];
  for (const s of gls.sites) {
    if (!Number.isFinite(s.lat) || haversine(lat, lon, s.lat, s.lon) > km * 1000) continue;
    units += Number(s.units) || 0;
    sites.push(s);
  }
  // `programme` is carried so the finding can name which half-year it covers.
  // "No GLS site within 1km" is not a claim anyone can check; "none in the
  // 2026 H2 programme" is, and it is the honest width of what this knows.
  return {
    km, units, sites,
    programme: gls.programme || null,
    source: gls.source,
    sourceUrl: gls.sourceUrl || null,
    accessedAt: gls.accessedAt,
  };
}

/**
 * The highest plot ratio the Master Plan permits within `m` metres.
 *
 * THIS DOES NOT KNOW WHAT IS BUILT. The layer carries zoning, and zoning is a
 * permission, not an observation — see the header of scripts/ingest-zoning.mjs
 * for why `undeveloped` is not produced and cannot be inferred from it. An
 * earlier version of this function filtered on `p.undeveloped`, which no ingest
 * ever set, so it skipped every parcel and returned a confident zero.
 *
 * `noFixedRatio` is the number of nearby parcels the Master Plan leaves open —
 * landed, subject to evaluation, subject to detailed planning. They are not
 * low, they are unmeasured, and the caller has to be able to say so. Counting
 * them as zero is how "nothing nearby is zoned tall" gets published over a
 * parcel that could be approved at anything.
 */
export function plotRatioWithin(lat, lon, { m = 300 } = {}) {
  const zoning = load('zoning.json');
  if (!zoning?.parcels?.length || !Number.isFinite(lat)) return null;
  let highest = 0, parcel = null, near = 0, noFixedRatio = 0;
  for (const p of zoning.parcels) {
    if (!Number.isFinite(p.lat)) continue;
    if (haversine(lat, lon, p.lat, p.lon) > m) continue;
    near++;
    const r = Number(p.plotRatio);
    if (!Number.isFinite(r) || r <= 0) { noFixedRatio++; continue; }
    if (r > highest) { highest = r; parcel = p; }
  }
  return {
    m,
    plotRatio: highest,
    parcel,
    parcelsInRadius: near,
    noFixedRatio,
    source: zoning.source,
    accessedAt: zoning.accessedAt,
  };
}
