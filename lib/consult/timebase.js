/**
 * Restating an old sale in today's money.
 *
 * ── WHY THIS IS THE FIRST THING AN AVM NEEDS ───────────────────────────────
 * `nearbyComps` widens its window to 24 months before it widens its radius,
 * and that ordering is right — the project is most of what sets the price. But
 * it then treats a sale from 24 months ago as though it happened this morning.
 * For a percentile that is survivable, because the reader can see each
 * comparable's date and discount it themselves. For an ESTIMATE it is not: the
 * whole output is one number and nobody can see which part of it is stale.
 *
 * Both indices needed to fix that are already in the repo and neither was
 * being used for it. `data/hdb-index.json` is HDB's Resale Price Index and
 * `data/ppi.json` is URA's, and they share a 1Q2009 = 100 base, which is the
 * reason ingest:ppi went via SingStat in the first place.
 *
 * ── WHAT THIS ADJUSTMENT IS NOT ────────────────────────────────────────────
 * An index is a MARKET and a home is one home. Moving a Sembawang sale by the
 * national HDB index assumes Sembawang moved with the nation, which is an
 * assumption and not a measurement. It is a far smaller assumption than
 * pretending two years did not pass, which is the alternative, but it is an
 * assumption and `describe()` below returns it in words so that every surface
 * built on this has the sentence available and no excuse for omitting it.
 *
 * This is the same reasoning /cost already publishes about applying national
 * index windows to a reader's own purchase price. Same limit, same wording.
 *
 * ── THE INDEX LAGS AND THE LAG IS NOT COSMETIC ─────────────────────────────
 * Both series are quarterly and both are published after the quarter ends. So
 * "today's money" is not today — it is the last quarter either body actually
 * published. Adjusting TO an unpublished quarter would mean extrapolating,
 * which is inventing a number. Every result carries `targetQuarter` and
 * `lagMonths` so the caller states the date its estimate is actually as of,
 * rather than implying it is current.
 */
import fs from 'node:fs';
import path from 'node:path';

/* A four-line JSON read, deliberately not imported from lib/blindspot/measure.js.
 * That file's `load` is private, and exporting it so this could borrow it would
 * make a public-site module carry an export that exists only for the consult
 * side — the coupling this directory exists to avoid. The "two implementations
 * is the bug" rule is about CALCULATIONS disagreeing; fs.readFileSync does not
 * have two opinions. */
const load = (f, fallback = null) => {
  const p = path.join(process.cwd(), 'data', f);
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
};

/** Landed and non-landed are separate URA series and move differently. The
 *  regex matches the one in nearbyComps, which widens the size band on the
 *  same test — if one is ever changed the other has to be. */
export const isLanded = fam => /terrace|semi|detached/.test(String(fam || ''));

/**
 * "2026-07" → "2026-Q3". Accepts "2026-Q3" unchanged, and a Date.
 *
 * ── THE DATE CASE IS NOT A CONVENIENCE, IT IS A BUG FIX ───────────────────
 * This took a string only. `latestQuarter(points, asOf)` is called with a
 * DATE — that is what estimate() holds — so quarterOf returned null, the cap
 * fell through, and every valuation restated its comparables to the newest
 * quarter in the file no matter what date it was asked about.
 *
 * In production that is invisible: asOf is today, and the newest published
 * quarter IS today's, so capping to it changes nothing. It is only fatal
 * looking backwards. A rolling backtest from 2019 came back with a +54%
 * median bias decaying smoothly to zero at the present — the exact shape of
 * the index rise from 2019 to 2026, because a 2018-Q4 comparable was being
 * multiplied by 1.54 to reach 2026-Q2.
 *
 * Same class as sameRecordPrice's missing upper bound, and the same lesson:
 * a guard that never fires in the environment you test in is a guard nobody
 * has tested. UTC, so a local timezone cannot drift a month-end into the
 * previous quarter.
 */
export function quarterOf(month) {
  if (month instanceof Date) {
    if (Number.isNaN(month.getTime())) return null;
    return `${month.getUTCFullYear()}-Q${Math.floor(month.getUTCMonth() / 3) + 1}`;
  }
  const s = String(month || '');
  if (/^\d{4}-Q[1-4]$/.test(s)) return s;
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return null;
  return `${m[1]}-Q${Math.floor((Number(m[2]) - 1) / 3) + 1}`;
}

/** Quarters are lexically ordered by that spelling, which is why it is used. */
const before = (a, b) => String(a) < String(b);

/**
 * The series that governs this kind of home.
 *
 * Returns null rather than a default when no series fits or the file is
 * absent. A missing index must disable the adjustment and say so, never
 * silently fall through to a factor of 1 — a factor of 1 is a CLAIM that the
 * market did not move, and it would be indistinguishable from a real one.
 */
export function seriesFor(kind, typeFamily) {
  if (kind === 'HDB') {
    const d = load('hdb-index.json');
    if (!d?.points?.length) return null;
    return {
      id: 'hdb-rpi',
      label: 'HDB Resale Price Index',
      source: d.source,
      licence: d.licence,
      base: d.base,
      points: d.points,
    };
  }
  const d = load('ppi.json');
  if (!d?.series) return null;
  const landed = isLanded(typeFamily);
  const s = landed ? d.series.landed : d.series.nonLanded;
  if (!s?.points?.length) return null;
  return {
    id: landed ? 'ura-ppi-landed' : 'ura-ppi-nonlanded',
    label: `URA Private Residential Property Price Index — ${s.label}`,
    source: d.source,
    datasource: d.datasource,
    licence: d.licence,
    base: d.base,
    points: s.points,
  };
}

/**
 * The index value at a quarter, or at the nearest EARLIER quarter.
 *
 * Earlier and never later: reading forward would let a sale be adjusted by a
 * quarter that had not been published when the sale happened, which is the
 * leak that makes a backtest report an accuracy nobody can reproduce live.
 */
export function indexAt(points, quarter) {
  if (!quarter) return null;
  let best = null;
  for (const p of points) {
    if (before(quarter, p.quarter)) continue;
    if (!best || before(best.quarter, p.quarter)) best = p;
  }
  return best;
}

/** The last quarter this series actually publishes at or before `asOf`. */
export function latestQuarter(points, asOf = null) {
  const capped = asOf ? quarterOf(asOf) : null;
  let best = null;
  for (const p of points) {
    if (capped && before(capped, p.quarter)) continue;
    if (!best || before(best.quarter, p.quarter)) best = p;
  }
  return best;
}

const monthsBetween = (fromQuarter, toDate) => {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(fromQuarter || ''));
  if (!m) return null;
  /* The quarter's LAST month — the index describes the whole quarter, so the
     lag runs from its end, not its start. */
  const end = new Date(Number(m[1]), Number(m[2]) * 3, 0);
  return Math.max(0, Math.round((toDate - end) / (1000 * 60 * 60 * 24 * 30.44)));
};

/**
 * Build a reusable adjuster for one valuation.
 *
 * Resolved once per estimate so every comparable in a cohort is moved to the
 * same target quarter by the same series. Two comparables adjusted to
 * different targets would be a cohort that does not describe one date, and the
 * median over it would describe no date at all.
 *
 * @returns null when no series is available — the caller must then report an
 *          UNADJUSTED estimate and say the adjustment did not run. Absence of
 *          evidence is not evidence that the market was flat.
 */
export function timebase(kind, typeFamily, { asOf = new Date() } = {}) {
  const series = seriesFor(kind, typeFamily);
  if (!series) return null;
  const target = latestQuarter(series.points, asOf);
  if (!target) return null;

  const applied = [];

  /** @returns { psf, factor, from, capped:false } or null when the sale
   *  predates the series entirely. */
  const adjust = (psf, month) => {
    if (!Number.isFinite(psf)) return null;
    const q = quarterOf(month);
    const at = indexAt(series.points, q);
    if (!at || !(at.index > 0)) return null;
    const factor = target.index / at.index;
    applied.push(factor);
    return { psf: psf * factor, factor, from: at.quarter };
  };

  return {
    series: { id: series.id, label: series.label, source: series.source, base: series.base },
    targetQuarter: target.quarter,
    targetIndex: target.index,
    lagMonths: monthsBetween(target.quarter, asOf instanceof Date ? asOf : new Date(asOf)),
    adjust,
    /** What the adjustment actually did, for the caller to print. An estimate
     *  whose comparables all moved 14% is a different claim from one where
     *  they moved 1%, and the reader cannot tell without this. */
    summary() {
      if (!applied.length) return { n: 0, min: null, max: null, median: null };
      const s = [...applied].sort((a, b) => a - b);
      return {
        n: s.length,
        min: s[0],
        max: s.at(-1),
        median: s[(s.length - 1) >> 1],
      };
    },
    describe() {
      return `Comparables restated to ${target.quarter} using the ${series.label} `
           + `(${series.base}). An index measures a market and this is one home: `
           + `the adjustment assumes this address moved with the index, which is an `
           + `assumption, not a measurement.`;
    },
  };
}
