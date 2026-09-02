import fs from 'node:fs';
import path from 'node:path';
import { haversine } from '../geo.js';
import { hdbHref } from '../name.js';
import { relativity, annualDecay, parseRemaining, LEASE_TABLE } from '../calc/lease.js';

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
const AREA_TOLERANCE = 0.10;
const LEASE_TOLERANCE_YEARS = 5;

/*
 * How far to look, in order. HDB blocks sit in dense towns and a neighbour
 * 500m away is genuinely the same market; private projects are sparser, so the
 * ladder runs further before giving up. Every rung is printed on the page —
 * a comparable 1.4km away is a different claim from one next door and the
 * reader is entitled to see which they are looking at.
 */
const RADII_KM = { HDB: [0.5, 0.75, 1], PRIVATE: [0.5, 1, 1.5] };

/**
 * Which sales are the same PRODUCT as this one.
 *
 * URA and HDB name categories differently and neither vocabulary maps onto
 * what a buyer is choosing between. These families are the smallest grouping
 * that is defensible:
 *
 *  - Apartment and Condominium go together. URA separates them on facilities
 *    and scale; nobody shopping for a two-bedroom in a district prices them as
 *    different products, and the two labels are applied inconsistently across
 *    older projects.
 *  - An Executive Condominium does NOT join them. It is a different product
 *    with an income ceiling, a minimum occupation period and a privatisation
 *    date, and it trades at a discount that has nothing to do with the home.
 *  - Strata landed stays apart from landed. Shared facilities and a strata
 *    title are the whole price difference between them.
 *  - HDB flat types match exactly. A 4-room and a 5-room are not comparable
 *    however close their floor areas happen to fall.
 */
const TYPE_FAMILY = {
  Apartment: 'strata', Condominium: 'strata',
  'Executive Condominium': 'ec',
  Terrace: 'terrace', 'Strata Terrace': 'strata-terrace',
  'Semi-detached': 'semi', 'Strata Semi-detached': 'strata-semi',
  Detached: 'detached', 'Strata Detached': 'strata-detached',
};
export const typeFamily = t => TYPE_FAMILY[t] || (t ? `hdb:${t}` : null);

/**
 * How many years of lease are left, which is the only thing about tenure that
 * reaches a price.
 *
 * ── WHY NOT MATCH ON THE TENURE STRING ─────────────────────────────────────
 * An earlier version grouped by the nominal term — "99 yrs", "999 yrs" — and
 * it starved the cohort. URA's field is free text and the terms are not a
 * short list: this dataset holds 103-year leases, 946-year leases and
 * 999-year leases from 1875. Each became its own family matching almost
 * nothing, and projects like 8 @ Mount Sophia (103 years from 2002) found
 * zero comparables inside 1.5km while sitting among hundreds of similar
 * leasehold flats.
 *
 * Years remaining is the honest quantity. A 103-year lease from 2002 has 79
 * left; a 99-year lease from 2026 has 99; the first is comparable to other
 * flats with about 79 years left, whatever the paperwork says. Freehold
 * returns Infinity, and so does anything with more than five centuries to run,
 * because a 946-year lease does not decay in any way a buyer will experience.
 */
export const FREEHOLD_EQUIVALENT_YEARS = 500;

/** What freehold is worth in years, for a check that must transport a number.
 *  Above every real lease and, unlike Infinity, still a number after JSON. */
export const FREEHOLD_YEARS = 9999;

export function leaseYearsLeft(tenure, now = new Date()) {
  const t = String(tenure || '');
  if (/freehold/i.test(t)) return Infinity;
  const m = /(\d{2,4})\s*yrs?\s*lease\s*commencing\s*from\s*(\d{4})/i.exec(t);
  if (!m) return null;
  const left = Number(m[1]) - (now.getFullYear() - Number(m[2]));
  return left >= FREEHOLD_EQUIVALENT_YEARS ? Infinity : left;
}

/** The family two tenures must share to be comparable at all. */
export function tenureKey(tenure, now = new Date()) {
  const left = leaseYearsLeft(tenure, now);
  if (left === Infinity) return { family: 'freehold', left: Infinity };
  if (left === null) return { family: String(tenure || '') ? 'other' : null, left: null };
  return { family: 'leasehold', left };
}

function monthKey(now, months) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
}

function publicComparable(s, extra = {}) {
  return {
    month: s.month,
    price: s.price ?? null,
    psf: Math.round(s.psf),
    areaSqm: s.areaSqm || null,
    storey: s.storey || s.floor || null,
    flatType: s.flatType || s.propertyType || s.type || null,
    ...extra,
  };
}

/**
 * Restate every comparable on the reader's floor, when a floor was given and a
 * curve exists. `psfFiled` keeps the number as filed so the table can show
 * both — an adjusted figure that hides what it started from is not evidence.
 */
function applyFloor(rows, floorTo, curve) {
  if (!Number.isFinite(floorTo) || !curve) return { rows, adjusted: null };
  let moved = 0, capped = 0;
  const out = rows.map(r => {
    const a = adjustForFloor(r.psf, r.storey, floorTo, curve);
    if (!a) return r;
    if (a.capped) capped++; else if (a.psf !== r.psf) moved++;
    return { ...r, psfFiled: r.psf, psf: a.psf, floorFrom: a.from };
  });
  return { rows: out, adjusted: { to: floorTo, scope: curve.scope, where: curve.where, moved, capped, of: rows.length } };
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

/**
 * Which category this unit is, worked out from the record rather than asked
 * for. The reader supplies a price and a floor area; making them also identify
 * URA's property-type vocabulary would lose more people than it helps.
 */
function inferredType(rec, targetAreaSqm) {
  const candidates = (rec?.recent || [])
    .filter(s => (s.flatType || s.propertyType) && Number.isFinite(s.areaSqm));
  if (candidates.length && Number.isFinite(targetAreaSqm)) {
    const best = [...candidates].sort((a, b) =>
      Math.abs(a.areaSqm - targetAreaSqm) - Math.abs(b.areaSqm - targetAreaSqm))[0];
    return best.flatType || best.propertyType;
  }
  if (rec?.flatTypes?.length === 1) return rec.flatTypes[0];
  if (rec?.propertyTypes?.length === 1) return rec.propertyTypes[0];
  return null;
}

function sameRecordPrice(rec, askingPsf, type, { months, min, now, areaSqm = null, floorTo = null, curve = null }) {
  const cutoff = monthKey(now, months);
  const fam = typeFamily(type);
  const lo = Number.isFinite(areaSqm) ? areaSqm * (1 - AREA_TOLERANCE) : null;
  const hi = Number.isFinite(areaSqm) ? areaSqm * (1 + AREA_TOLERANCE) : null;
  const rows = (rec?.recent || [])
    .filter(s => String(s.month) >= cutoff && Number.isFinite(s.psf))
    .filter(s => !fam || typeFamily(s.flatType || s.propertyType) === fam)
    // Size is a filter WITHIN a project too. A 4,000 sq ft penthouse and a
    // 700 sq ft one-bedroom in the same block do not price alike, and the
    // percentile was previously computed across both.
    .filter(s => lo === null || !Number.isFinite(s.areaSqm) || (s.areaSqm >= lo && s.areaSqm <= hi))
    .map(s => publicComparable(s, { href: rec.href, label: rec.label, distanceM: 0 }));
  const { rows: on, adjusted } = applyFloor(rows, floorTo, curve);
  return priceSummary(on, askingPsf, {
    basis: 'block', months, min, cutoff, flatType: type,
    blocks: on.length ? 1 : 0, adjusted,
  });
}

/**
 * How much lease is left, from whichever field the vendor happens to publish.
 *
 * ── WHY THIS IS A CHECK AT ALL ─────────────────────────────────────────────
 * It is the largest thing a Singapore buyer routinely does not price. A flat
 * with sixty years left reads as "ages" and is already losing about half a
 * percentage point of its freehold value every year, accelerating — by forty
 * years left it is 0.8, by twenty it is 1.4. Nothing on a listing says that,
 * and the arithmetic is published by the State.
 *
 * Freehold returns Infinity, which SCORES ZERO and still runs. That matters:
 * a check that simply vanished on freehold would leave the reader unable to
 * tell "no lease risk here" from "we did not look".
 */
export function leaseRemaining(rec, now = new Date()) {
  if (!rec) return null;
  // HDB publishes it directly and it is the most precise source available.
  const stated = parseRemaining(rec.remainingLease);
  if (Number.isFinite(stated)) return stated;
  // Otherwise derive it: an HDB flat is a 99-year lease from its commencement.
  if (rec.kind === 'HDB' && Number.isFinite(rec.leaseCommence)) {
    return 99 - (now.getFullYear() - rec.leaseCommence);
  }
  const left = leaseYearsLeft(rec.tenure, now);
  return left === null ? null : left;
}

/**
 * How often anything at this address actually changes hands.
 *
 * ── THE QUESTION NOBODY ASKS ───────────────────────────────────────────────
 * Every buyer asks what a home costs. Almost none asks whether they will be
 * able to sell it, and the answer is knowable in advance: an address where two
 * units a year trade is a different proposition from one where twenty do, in
 * how long a sale takes, how much a buyer can push on price, and how much
 * evidence exists about what it is worth at all.
 *
 * It is also the honest explanation for a thin price check. A report that says
 * "only three comparable sales" and a report that says "units here trade about
 * twice a year, which is the quietest tenth of the market" are the same fact,
 * and only the second one is useful.
 *
 * ── MEASURED AGAINST THE MARKET, NOT AGAINST A NUMBER I LIKED ──────────────
 * "Few sales" means nothing on its own, and the two markets are not the same
 * shape. The percentiles come from scripts/build-comps.mjs, over the same data
 * this reads, and move when the data does — so "the quietest tenth" is a fact
 * about this dataset rather than a threshold somebody once chose.
 *
 * Rate is sales at this address over the months they span, so a project whose
 * twenty held sales all fall in six months reads as forty a year and one whose
 * twenty span five years reads as four. The cap on how many sales are held
 * bites only at the busy end, and the risk is at the quiet one.
 */
export function liquidityFinding(rec, { index = null } = {}) {
  if (!rec?.href) return null;
  const all = index || comps();
  const self = all.records?.[rec.href];
  const band = all.liquidity?.[rec.kind];
  if (!self || !Number.isFinite(self.rate) || !band) return null;
  const quieter = self.rate <= band.p10 ? 'p10' : self.rate <= band.p25 ? 'p25' : null;
  return {
    rate: self.rate,
    sales: self.sales.length,
    kind: rec.kind,
    // URA files landed by STREET, not by project, and the record is the
    // street. Calling it a project in the finding would misname the thing
    // being counted — the same error that had a freehold condominium
    // reporting "7 HDB blocks".
    landed: Boolean(rec.landed),
    p10: band.p10, p25: band.p25, median: band.median, of: band.n,
    quieter,
    source: 'HDB via data.gov.sg · URA Data Service',
  };
}

/**
 * The lease finding: years left, what the State's own table says that is worth
 * against freehold, and what one more year costs at this point on the curve.
 *
 * Every figure comes from data/sources/leasehold-table.json. Nothing here
 * projects a future price, and nothing here is a valuation — it is the
 * published relativity for a number of years, printed beside the number of
 * years this home actually has.
 */
export function leaseFinding(rec, now = new Date()) {
  const years = leaseRemaining(rec, now);
  if (years === null) return null;
  if (years === Infinity) {
    // NOT Infinity. This value crosses a JSON boundary on its way to the
    // report, and JSON.stringify turns Infinity into null — so a check that
    // RAN and scored zero arrived at the client indistinguishable from one
    // that never ran, which is the single distinction this rubric exists to
    // preserve. A finite sentinel above every real lease survives the trip.
    return { years: FREEHOLD_YEARS, freehold: true, relativity: null, decay: null,
             source: 'Tenure as filed with URA', kind: rec.kind };
  }
  const y = Math.round(years);
  return {
    years: Math.round(years * 10) / 10,
    freehold: false,
    // Outside 1–99 the table has no row and this stays null rather than
    // extrapolating — see lib/calc/lease.js.
    relativity: relativity(y),
    decay: annualDecay(y),
    source: LEASE_TABLE.source || 'SLA leasehold relativity table',
    kind: rec.kind,
  };
}

/* ── adjusting a comparable for the floor it was on ────────────────────────── */

/**
 * The middle floor of a band, from either vendor's way of writing one.
 * HDB ships "10 TO 12", URA ships "11-15". Both are kept verbatim in the
 * index and normalised here, because rewriting a vendor's own band on the way
 * in is how a band quietly becomes the wrong one.
 */
export function floorMid(label) {
  const m = String(label || '').match(/(\d+)\s*(?:TO|-|–)\s*(\d+)/i);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const one = String(label || '').match(/^\s*(\d+)\s*$/);
  return one ? Number(one[1]) : null;
}

let _storey;
function storeyData() {
  if (_storey === undefined) _storey = load('storey.json', null);
  return _storey;
}

/**
 * The floor curve to judge this home against, most local first.
 *
 * Town or district before national, because what a floor is worth is a fact
 * about a building's outlook and its market, not about the country. The
 * per-RECORD scope is deliberately not used: HDB stores it as a low/high pair
 * rather than a curve, and a two-point curve cannot place a floor between
 * them without inventing the shape.
 *
 * Returns null rather than a flat line when there is nothing usable. The
 * caller then does not adjust and SAYS it did not, which is the same rule
 * every other check here follows.
 */
export function storeyCurve(rec, type) {
  const d = storeyData();
  if (!d || !type) return null;
  const side = rec?.kind === 'HDB' ? d.hdb : d.private;
  if (!side) return null;
  const key = rec?.kind === 'HDB' ? rec.town : rec.district;
  /* LOCAL ONLY. The national curve is not a floor premium: it runs S$1,848 psf
   * across floors 1–5 to S$2,811 across 26–30, and most of that gap is that
   * tall buildings stand in expensive districts. Adjusting a Bishan
   * comparable by a spread that is really District 9 would move it by nearly
   * 40% for a reason that has nothing to do with height. Within one town or
   * district location is far better controlled, so that is the only scope
   * used — and where it will not serve, nothing is adjusted. */
  for (const [scope, holder] of [['local', side.groups?.[key]]]) {
    const bands = holder?.[type]?.bands;
    if (!Array.isArray(bands) || bands.length < 3) continue;
    const points = bands
      .map(([label, mid, psf, n]) => ({ mid: Number.isFinite(mid) ? mid : floorMid(label), psf, n, label }))
      .filter(p => Number.isFinite(p.mid) && Number.isFinite(p.psf) && p.psf > 0)
      .sort((a, b) => a.mid - b.mid);
    /* THE CURVE MUST ACTUALLY RISE. Fifteen of the sixty private district
     * curves do not — District 05 reads S$2,104 psf across floors 1–5 and
     * S$2,046 across 16–20, which is a thin sample and not a market where
     * height is worth less. Adjusting a comparable DOWNWARD for being higher
     * would put that artefact into the reader's percentile as though it were
     * a fact about their home. Where the local curve does not rise the
     * national one is used, and where neither does, nothing is adjusted and
     * the page says the comparables are as filed. */
    if (points.length >= 3 && points.at(-1).psf > points[0].psf)
      return { points, scope, where: scope === 'local' ? key : 'Singapore', type };
  }
  return null;
}

/** The curve read at one floor, linearly between the two bands around it and
 *  flat outside them — an extrapolated tower is a guess, and the ends of this
 *  curve are where the sample is thinnest. */
export function curveAt(curve, floor) {
  const p = curve?.points;
  if (!p?.length || !Number.isFinite(floor)) return null;
  if (floor <= p[0].mid) return p[0].psf;
  if (floor >= p.at(-1).mid) return p.at(-1).psf;
  for (let i = 1; i < p.length; i++) {
    if (floor <= p[i].mid) {
      const a = p[i - 1], b = p[i];
      return a.psf + (b.psf - a.psf) * ((floor - a.mid) / (b.mid - a.mid));
    }
  }
  return null;
}

/**
 * A comparable's rate, restated as though it had been on the reader's floor.
 *
 * ── WHY THIS MATTERS MORE THAN IT SOUNDS ───────────────────────────────────
 * The national private curve runs from about S$1,557 psf across floors 1–5 to
 * S$2,016 across 16–20 — a 29% spread inside the same market. The price check
 * ranked an asking rate against comparables from any floor and printed "not
 * adjusted for storey" underneath, which is a disclosure standing in for a
 * calculation the data supports.
 *
 * Capped at ±35%. Beyond that the curve is being read at its thin ends or the
 * bands disagree, and a comparable that had to move by half to be comparable
 * is not one. A capped adjustment is reported as capped rather than applied
 * quietly.
 */
export const FLOOR_ADJUST_CAP = 0.35;

export function adjustForFloor(psf, fromLabel, toFloor, curve) {
  const from = floorMid(fromLabel);
  if (!curve || !Number.isFinite(psf) || !Number.isFinite(from) || !Number.isFinite(toFloor)) return null;
  const a = curveAt(curve, from), b = curveAt(curve, toFloor);
  if (!a || !b) return null;
  const factor = b / a;
  if (Math.abs(factor - 1) > FLOOR_ADJUST_CAP) return { psf: Math.round(psf), factor: 1, capped: true, from };
  return { psf: Math.round(psf * factor), factor, capped: false, from };
}

let _comps = null;
/** The comparables index, built by scripts/build-comps.mjs. */
export function comps() {
  if (_comps === null) _comps = load('comps.json', { records: {} });
  return _comps;
}

/**
 * Comparable sales near this one, from other addresses.
 *
 * ── ONE IMPLEMENTATION, TWO VOCABULARIES ───────────────────────────────────
 * This used to be HDB-only, and the consequence was measurable: an audit over
 * 250 private projects found the price check ran on 30% of them, against 95%
 * for HDB. Writing a second private-only version would have made two matchers
 * that could drift apart — this repo has a note about exactly that failure
 * ("Two implementations is the bug"). So the ladder is shared and only the
 * MATCH PREDICATE differs:
 *
 *   HDB      same flat type · floor area within 10% · lease commencing within
 *            five years, because two blocks of the same age in the same town
 *            are the same product
 *   private  same type family · floor area within 10% · same tenure family,
 *            and for a leasehold, a lease commencing within ten years
 *
 * Tenure is not optional for private. A freehold and a 99-year unit of the
 * same size in the same street are different products at different prices, and
 * mixing them would put the difference into the percentile as though it were
 * about this home.
 *
 * The radius widens only until `min` comparables exist, then stops. Every
 * filter and the radius that was actually needed are returned so the page can
 * print them, because a percentile from five sales within 500m and one from
 * five within 1.5km are different claims.
 */
export function nearbyComps(rec, askingPsf, targetAreaSqm, type, {
  months = 12, min = 5, now = new Date(), index = null, floorTo = null, curve = null,
} = {}) {
  if (!rec?.href || !Number.isFinite(targetAreaSqm) || !type) return null;
  const all = (index || comps()).records || {};
  const self = all[rec.href];
  if (!self) return null;

  const hdb = rec.kind === 'HDB';
  const fam = typeFamily(type);
  const cutoff = monthKey(now, months);
  /* Landed gets a wider size band. A 10% band on a 6,500 sq ft plot excludes
   * essentially every neighbour, and land is the product being priced — plot
   * size moves the total far more than it moves the rate. Braddell Heights
   * found zero comparables inside 1.5km under the strata rule. */
  const landed = /terrace|semi|detached/.test(String(fam));
  const tol = landed ? 0.25 : AREA_TOLERANCE;
  const areaFrom = targetAreaSqm * (1 - tol);
  const areaTo = targetAreaSqm * (1 + tol);
  const myTenure = hdb ? null : tenureKey(self.tenure, now);
  // Fifteen years of lease either way. Tighter than that and a leasehold
  // cohort starves for the same reason the tenure-string match did; wider and
  // it stops being the same product.
  const leaseTol = hdb ? LEASE_TOLERANCE_YEARS : 15;


  /** Is this OTHER record the same kind of home as the subject? */
  const recordMatches = (o) => {
    if (o.kind !== rec.kind) return false;
    if (hdb) {
      if (!Number.isFinite(self.leaseCommence) || !Number.isFinite(o.leaseCommence)) return true;
      return Math.abs(o.leaseCommence - self.leaseCommence) <= leaseTol;
    }
    const t = tenureKey(o.tenure, now);
    if (t.family !== myTenure.family) return false;
    // Both freehold, or both leasehold with a similar amount left to run. A
    // flat with 60 years left and one with 90 are not the same product even
    // though both are "99-year leasehold".
    if (myTenure.left === Infinity) return true;
    if (!Number.isFinite(t.left) || !Number.isFinite(myTenure.left)) return false;
    return Math.abs(t.left - myTenure.left) <= leaseTol;
  };

  let result = null;
  for (const radiusKm of (RADII_KM[hdb ? 'HDB' : 'PRIVATE'])) {
    const rows = [];
    const places = new Set();
    for (const [href, o] of Object.entries(all)) {
      if (href === rec.href) continue;
      const distanceM = haversine(self.lat, self.lon, o.lat, o.lon);
      if (distanceM > radiusKm * 1000) continue;
      if (!recordMatches(o)) continue;
      for (const [month, psf, areaSqm, t, floor] of o.sales) {
        if (month < cutoff) continue;
        if (typeFamily(t) !== fam) continue;
        if (areaSqm < areaFrom || areaSqm > areaTo) continue;
        rows.push(publicComparable({ month, psf, areaSqm, type: t, storey: floor },
          { href, label: o.label, distanceM: Math.round(distanceM) }));
        places.add(href);
      }
    }
    const { rows: on, adjusted } = applyFloor(rows, floorTo, curve);
    result = priceSummary(on, askingPsf, {
      adjusted,
      basis: 'nearby', months, min, cutoff, flatType: type,
      radiusKm, blocks: places.size,
      areaFromSqm: Math.round(areaFrom), areaToSqm: Math.round(areaTo),
      tenure: hdb ? null : myTenure.family,
      leaseFrom: hdb && Number.isFinite(self.leaseCommence) ? self.leaseCommence - leaseTol : null,
      leaseTo: hdb && Number.isFinite(self.leaseCommence) ? self.leaseCommence + leaseTol : null,
      storeyAdjusted: false,
    });
    if (result.sufficient) break;
  }
  return result;
}

/** Kept under its old name; the HDB path is now the shared one. */
export const nearbyHdbPrice = (rec, askingPsf, area, flatType, opts) =>
  nearbyComps(rec, askingPsf, area, flatType, opts);

/**
 * Complete price evidence for the report.
 *
 * ── THE LADDER, AND WHY IT IS IN THIS ORDER ────────────────────────────────
 *   1. this address, last 12 months
 *   2. this address, last 24 months
 *   3. nearby addresses, last 12 months, widening radius
 *
 * Widening TIME before widening GEOGRAPHY is deliberate and it is the opposite
 * of what most comparables tools do. A sale in this very building eighteen
 * months ago tells you more about this building than a sale next door last
 * month, because the project is most of what sets the price — its age, its
 * facilities, its tenure, its position. The window that was actually used is
 * printed, so a reader can discount an older comparable for themselves; a
 * neighbouring project's sale cannot be discounted the same way, because
 * nothing on the page says how alike the two buildings are.
 *
 * `observed` is never scored. It is every sale held for this address at any
 * date, shown even when too thin to score — the thin evidence that used to
 * disappear, taking the headline's meaning with it.
 */
export function priceAnalysis(rec, askingPsf, {
  areaSqft = null, floor = null, months = 12, min = 5, now = new Date(), index = null,
} = {}) {
  if (!rec?.recent?.length || !Number.isFinite(askingPsf) || askingPsf <= 0) return null;
  const targetAreaSqm = Number(areaSqft) > 0 ? Number(areaSqft) / SQFT_PER_SQM : null;
  const type = inferredType(rec, targetAreaSqm);
  const observed = observedAtRecord(rec, askingPsf);

  /* Resolved once and shared by every rung of the ladder, so a cohort cannot
     be adjusted against one curve and described against another. */
  const floorTo = Number(floor) > 0 ? Number(floor) : null;
  const curve = floorTo ? storeyCurve(rec, type) : null;
  const opts = { months, min, now, areaSqm: targetAreaSqm, floorTo, curve };

  const here = sameRecordPrice(rec, askingPsf, type, opts);
  const wider = here.sufficient ? null
    : sameRecordPrice(rec, askingPsf, type, { ...opts, months: 24 });
  const nearby = (here.sufficient || wider?.sufficient) ? null
    : nearbyComps(rec, askingPsf, targetAreaSqm, type, { months, min, now, index, floorTo, curve });

  const scored = here.sufficient ? here
    : wider?.sufficient ? wider
    : nearby?.sufficient ? nearby
    : null;
  const widest = nearby || wider || here;

  return {
    asking: Math.round(askingPsf),
    source: rec.source || null,
    period: rec.period || null,
    months,
    min,
    flatType: type,
    floor: floorTo,
    /** Null when no floor was given, or when no curve was usable — the page
     *  then says the comparables are as filed, which is what it always said. */
    floorCurve: curve ? { scope: curve.scope, where: curve.where, points: curve.points.length } : null,
    flatTypeBasis: type
      ? (rec.flatTypes?.length === 1 || rec.propertyTypes?.length === 1)
        ? 'the only type filed at this address'
        : 'the closest filed floor area at this address'
      : null,
    targetAreaSqm: Number.isFinite(targetAreaSqm) ? Math.round(targetAreaSqm) : null,
    observed,
    same: here,
    wider,
    nearby,
    scored,
    unavailable: scored ? null
      : `At least ${min} comparable sales are needed. This address filed ${here.sample} in the last `
        + `${months} months and ${wider?.sample ?? here.sample} in the last 24; the widest nearby `
        + `cohort found ${nearby?.sample ?? 0}.`,
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
