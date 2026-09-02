import fs from 'node:fs';
import path from 'node:path';
import { haversine } from '../geo.js';
import { hdbHref } from '../name.js';

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
        const href = hdbHref(b.town, b.block, b.street);
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
        const href = hdbHref(b.town, b.block, b.street);
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
 * The price check has two layers, and keeping them separate is the point.
 *
 *   1. Every sale held for the searched block/project is evidence and is shown,
 *      even when it is too thin to score.
 *   2. For a thin HDB block only, nearby similar flats can supply the scored
 *      gauge. They are never blended into the first list or described as sales
 *      "here".
 *
 * A previous version returned null as soon as the same-address sample fell
 * below five. Blk 242 Bishan St 22 then produced the same reassuring 0/7 for a
 * S$1.2m ask and a S$6.47m ask: the three-point price check had disappeared,
 * while the headline still said "Little flagged". Thin evidence must remain
 * visible, and a nearby fallback must name exactly how it was assembled.
 */
const SQFT_PER_SQM = 10.7639;
const PRICE_RADII_KM = [0.5, 0.75, 1];
const AREA_TOLERANCE = 0.10;
const LEASE_TOLERANCE_YEARS = 5;

function monthKey(now, months) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
}

function publicComparable(s, extra = {}) {
  return {
    month: s.month,
    price: s.price,
    psf: Math.round(s.psf),
    areaSqm: s.areaSqm || null,
    storey: s.storey || null,
    flatType: s.flatType || null,
    ...extra,
  };
}

function priceSummary(rows, askingPsf, { months, min, ...context }) {
  const sorted = [...rows].sort((a, b) => a.psf - b.psf);
  const psf = sorted.map(s => s.psf);
  if (!psf.length) return {
    ...context, months, min, sample: 0, sufficient: false, percentile: null,
    asking: Math.round(askingPsf), comparisons: [],
  };
  const sufficient = psf.length >= min;
  const below = psf.filter(v => v < askingPsf).length;
  const high = Math.round(psf.at(-1));
  return {
    ...context,
    months,
    min,
    sample: psf.length,
    sufficient,
    percentile: sufficient ? below / psf.length : null,
    low: Math.round(psf[0]),
    median: Math.round(psf[(psf.length - 1) >> 1]),
    high,
    asking: Math.round(askingPsf),
    aboveHighPct: askingPsf > high ? ((askingPsf / high) - 1) * 100 : null,
    comparisons: sorted,
  };
}

function observedAtRecord(rec, askingPsf) {
  const rows = (rec?.recent || [])
    .filter(s => Number.isFinite(s.psf))
    .map(s => publicComparable(s, { href: rec.href, label: rec.label, distanceM: 0 }))
    .sort((a, b) => String(b.month).localeCompare(String(a.month)));
  if (!rows.length) return null;
  const psf = rows.map(s => s.psf).sort((a, b) => a - b);
  const high = psf.at(-1);
  const months = rows.map(s => s.month).filter(Boolean).sort();
  return {
    sample: rows.length,
    low: psf[0],
    high,
    asking: Math.round(askingPsf),
    aboveHighPct: askingPsf > high ? ((askingPsf / high) - 1) * 100 : null,
    from: months[0] || null,
    to: months.at(-1) || null,
    comparisons: rows,
  };
}

function inferredFlatType(rec, targetAreaSqm) {
  const candidates = (rec?.recent || [])
    .filter(s => s.flatType && Number.isFinite(s.areaSqm));
  if (candidates.length && Number.isFinite(targetAreaSqm)) {
    return [...candidates].sort((a, b) =>
      Math.abs(a.areaSqm - targetAreaSqm) - Math.abs(b.areaSqm - targetAreaSqm))[0].flatType;
  }
  return rec?.flatTypes?.length === 1 ? rec.flatTypes[0] : null;
}

function sameRecordPrice(rec, askingPsf, flatType, { months, min, now }) {
  const cutoff = monthKey(now, months);
  const rows = (rec?.recent || [])
    .filter(s => String(s.month) >= cutoff && Number.isFinite(s.psf))
    .filter(s => !flatType || s.flatType === flatType)
    .map(s => publicComparable(s, { href: rec.href, label: rec.label, distanceM: 0 }));
  return priceSummary(rows, askingPsf, {
    basis: 'block', months, min, cutoff, flatType,
    blocks: rows.length ? 1 : 0,
  });
}

export function nearbyHdbPrice(rec, askingPsf, targetAreaSqm, flatType, {
  months = 12, min = 5, now = new Date(), geoRecords = null, records = null,
} = {}) {
  if (rec?.kind !== 'HDB' || !rec.shard || !flatType || !Number.isFinite(targetAreaSqm)) return null;
  const geo = geoRecords || load('geo.json', { records: {} }).records || {};
  const at = geo[rec.href];
  const shard = records || load(`records/${rec.shard}.json`, {});
  if (!Number.isFinite(at?.lat) || !Number.isFinite(at?.lon) || !Object.keys(shard).length) return null;

  const cutoff = monthKey(now, months);
  const areaFrom = targetAreaSqm * (1 - AREA_TOLERANCE);
  const areaTo = targetAreaSqm * (1 + AREA_TOLERANCE);
  const leaseFrom = Number.isFinite(rec.leaseCommence) ? rec.leaseCommence - LEASE_TOLERANCE_YEARS : null;
  const leaseTo = Number.isFinite(rec.leaseCommence) ? rec.leaseCommence + LEASE_TOLERANCE_YEARS : null;
  let result = null;

  for (const radiusKm of PRICE_RADII_KM) {
    const rows = [];
    const blocks = new Set();
    for (const candidate of Object.values(shard)) {
      const g = geo[candidate.href];
      if (!Number.isFinite(g?.lat) || !Number.isFinite(g?.lon)) continue;
      const distanceM = haversine(at.lat, at.lon, g.lat, g.lon);
      if (distanceM > radiusKm * 1000) continue;
      if (leaseFrom !== null && (!Number.isFinite(candidate.leaseCommence)
          || candidate.leaseCommence < leaseFrom || candidate.leaseCommence > leaseTo)) continue;

      for (const sale of candidate.recent || []) {
        if (String(sale.month) < cutoff || sale.flatType !== flatType || !Number.isFinite(sale.psf)) continue;
        if (!Number.isFinite(sale.areaSqm) || sale.areaSqm < areaFrom || sale.areaSqm > areaTo) continue;
        rows.push(publicComparable(sale, {
          href: candidate.href,
          label: candidate.label,
          distanceM: Math.round(distanceM),
        }));
        blocks.add(candidate.href);
      }
    }

    result = priceSummary(rows, askingPsf, {
      basis: 'nearby', months, min, cutoff, flatType,
      radiusKm, blocks: blocks.size,
      areaFromSqm: Math.round(areaFrom), areaToSqm: Math.round(areaTo),
      leaseFrom, leaseTo,
      storeyAdjusted: false,
    });
    if (result.sufficient) break;
  }
  return result;
}

/**
 * Complete price evidence for the report. The score uses the same-address
 * cohort when it has five sales; only then does an HDB report fall back to the
 * nearby cohort. `observed` is never scored — it is the honest thin evidence
 * that used to disappear.
 */
export function priceAnalysis(rec, askingPsf, {
  areaSqft = null, months = 12, min = 5, now = new Date(),
} = {}) {
  if (!rec?.recent?.length || !Number.isFinite(askingPsf) || askingPsf <= 0) return null;
  const targetAreaSqm = Number(areaSqft) > 0 ? Number(areaSqft) / SQFT_PER_SQM : null;
  const flatType = rec.kind === 'HDB' ? inferredFlatType(rec, targetAreaSqm) : null;
  const observed = observedAtRecord(rec, askingPsf);
  const same = sameRecordPrice(rec, askingPsf, flatType, { months, min, now });
  const nearby = same.sufficient ? null
    : nearbyHdbPrice(rec, askingPsf, targetAreaSqm, flatType, { months, min, now });
  const scored = same.sufficient ? same : nearby?.sufficient ? nearby : null;
  const available = nearby || same;
  return {
    asking: Math.round(askingPsf),
    source: rec.source || null,
    period: rec.period || null,
    months,
    min,
    flatType,
    flatTypeBasis: flatType
      ? rec.flatTypes?.length === 1
        ? 'the only flat type filed at this block'
        : 'the closest filed floor area at this block'
      : null,
    targetAreaSqm: Number.isFinite(targetAreaSqm) ? Math.round(targetAreaSqm) : null,
    observed,
    same,
    nearby,
    scored,
    unavailable: scored ? null
      : `At least ${min} comparable sales in the last ${months} months are needed; ${available?.sample || 0} were available in the widest eligible cohort.`,
  };
}

/** Kept as the small arithmetic API used outside the assembled report. */
export function pricePercentile(rec, askingPsf, { months = 12, min = 5, now = new Date() } = {}) {
  const same = sameRecordPrice(rec, askingPsf, null, { months, min, now });
  return same.sufficient ? same : null;
}

/* ── the two that need an ingest ──────────────────────────────────────────
 * Both return null until their dataset exists, which the rubric renders as
 * "did not run" rather than as a clean bill of health. */

/**
 * Government Land Sales sites near a property.
 *
 * ZERO SITES AND ZERO PUBLISHED YIELDS ARE DIFFERENT ANSWERS, and conflating
 * them is how this check would lie. URA's Schedule of Confirmed and Reserve
 * List Sites gives site area and gross plot ratio; it does NOT give unit
 * yields. Summing a list of nulls gives 0, and 0 renders as "No GLS site
 * within 1km" — which, standing next to a site that is genuinely there, is
 * false in the reassuring direction.
 *
 * So `units` comes back null when sites are nearby but none carries a
 * published yield. null means the check does not run and the page says why,
 * which is the honest state. It is only 0 when the radius is genuinely empty.
 *
 * `gfaSqm` is site area x plot ratio, arithmetic on two published figures. It
 * is reported for context and is not converted into a unit count — that would
 * need an assumed average unit size, which is this repo inventing a number.
 */
export function glsWithin(lat, lon, { km = 1 } = {}) {
  const gls = load('gls.json');
  if (!gls?.sites?.length || !Number.isFinite(lat)) return null;

  const sites = [];
  let units = 0, withUnits = 0, gfa = 0;
  for (const s of gls.sites) {
    if (!Number.isFinite(s.lat) || haversine(lat, lon, s.lat, s.lon) > km * 1000) continue;
    sites.push(s);
    if (Number.isFinite(s.units) && s.units > 0) { units += s.units; withUnits++; }
    if (Number.isFinite(s.gfaSqm)) gfa += s.gfaSqm;
  }

  return {
    km,
    // The distinction the whole comment above is about.
    units: sites.length && !withUnits ? null : units,
    sitesWithPublishedUnits: withUnits,
    gfaSqm: gfa || null,
    sites,
    programme: gls.programme || null,
    source: gls.source,
    sourceUrl: gls.sourceUrl || null,
    accessedAt: gls.accessedAt,
  };
}

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

/**
 * What has actually been approved near a property.
 *
 * This replaced plot ratio as the basis of the `view` check. Zoning says what
 * the Master Plan permits and has often said so for a decade; a written
 * permission is a decision someone applied for and URA granted, with a date
 * and an address. Within 300m of Parc Clematis that is the difference between
 * "zoned to 2.1" and "two blocks of 39-storey residential, permitted 3 Jul
 * 2026".
 *
 * Scored on the TALLEST thing approved, because the question is what changes
 * the outlook. A 2-storey terrace reconstruction and a 39-storey block are
 * both "new erection" and only one of them is worth flagging — 2,842 of the
 * 4,689 decisions held here are three storeys or fewer.
 *
 * Storeys come from URA's own description text, which carries them 81% of the
 * time. `unparsed` counts the rest so the caveat can admit them; they are not
 * treated as low buildings.
 */
export function approvalsWithin(lat, lon, { m = 300, years = 3, from = new Date() } = {}) {
  const data = load('planning.json');
  if (!data?.decisions?.length || !Number.isFinite(lat)) return null;

  const cutoff = new Date(from);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const since = cutoff.toISOString().slice(0, 10);

  let tallest = 0, tallestOf = null, permitted = 0, refused = 0, unparsed = 0;
  const near = [];
  for (const d of data.decisions) {
    if (!Number.isFinite(d.lat)) continue;
    if (d.date && d.date < since) continue;
    if (haversine(lat, lon, d.lat, d.lon) > m) continue;

    near.push(d);
    // A refusal is counted separately and never scored. Someone proposing a
    // tower and being turned down is worth telling a reader about; it is not
    // evidence that a tower is coming.
    if (!d.permitted) { refused++; continue; }
    permitted++;

    const hits = [...String(d.what || '').matchAll(/(\d+)\s*-?\s*STOREY/gi)]
      .map(x => Number(x[1]))
      .filter(n => n > 0 && n < 100);
    if (!hits.length) { unparsed++; continue; }
    const max = Math.max(...hits);
    if (max > tallest) { tallest = max; tallestOf = d; }
  }

  return {
    m, years, since,
    storeys: tallest,
    tallest: tallestOf,
    permitted, refused, unparsed,
    inRadius: near.length,
    source: data.source,
    accessedAt: data.accessedAt,
  };
}
