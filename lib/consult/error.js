/**
 * How wrong this particular estimate is likely to be.
 *
 * ── WHY A LOOKUP NEEDS ITS OWN ERROR AND NOT THE NATIONAL ONE ──────────────
 * The backtest says the median absolute error is about 3.4%. Quoting that
 * figure on every lookup would be quoting an average as though it were a
 * measurement of the case in hand. Measured over 9,759 held-out sales, the
 * eighteen bins run from 1.95% to 6.69% at the median and from 5.52% to
 * 27.85% at the 90th percentile — a threefold spread at the middle and
 * fivefold in the tail, all of which the single national figure hides.
 *
 * That spread IS the question in front of a listing. "6% below comparable
 * evidence" is a finding on a tight cohort in one's own block and is noise on
 * a scattered one, and without this the difference is a matter of feel.
 *
 * ── THE THREE CONFIDENCE WORDS ARE NOT THE POINT, THE PERCENTAGES ARE ──────
 * Competitors print "medium confidence" next to a valuation with no stated
 * basis: three buckets, no measured error, no way to check. A word is not a
 * measurement. `band()` below does return one, because a word travels in
 * conversation — but it is DERIVED from the measured p90 rather than chosen,
 * every surface that prints it prints the percentage beside it, and the number
 * is what is meant.
 *
 * ── STALENESS IS A REAL FAILURE MODE ──────────────────────────────────────
 * The table describes the estimator that produced it. Change the weights, the
 * cohort rules or the floor curve and it describes a method that no longer
 * exists — while still returning confident-looking numbers. `staleFor()`
 * compares the recorded estimator version and says so.
 */
import fs from 'node:fs';
import path from 'node:path';

let _table;
function table() {
  if (_table === undefined) {
    const p = path.join(process.cwd(), 'data', 'avm-error.json');
    try { _table = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
    catch { _table = null; }
  }
  return _table;
}

const binOf = (v, cuts) => (v <= cuts[0] ? 0 : v <= cuts[1] ? 1 : 2);

/**
 * Words for the measured p90, so the number can be said out loud. The
 * thresholds are published here rather than chosen per-lookup.
 *
 * Deliberately pessimistic wording at the top: "wide" rather than "low
 * confidence", because the failure being guarded against is a reader hearing
 * a hedge and rounding it to a number anyway.
 */
export const BANDS = [
  { at: 0.09, word: 'tight' },
  { at: 0.15, word: 'workable' },
  { at: Infinity, word: 'wide' },
];
export const bandFor = p90 => BANDS.find(b => p90 <= b.at).word;

/**
 * @param evidence  { kind, bandPct, effN } — all knowable before the answer.
 * @returns null when no table has been built. The caller must then say the
 *          error is unmeasured, NOT that it is small. Absence of evidence is
 *          the failure this whole repo is organised against.
 */
export function errorFor({ kind, bandPct, effN } = {}) {
  const t = table();
  if (!t) return null;
  if (!Number.isFinite(bandPct) || !Number.isFinite(effN)) return null;

  const key = `${kind}|b${binOf(bandPct, t.cuts.bandPct)}|n${binOf(effN, t.cuts.effN)}`;
  const bin = t.bins[key];
  /* A thin bin falls back to its kind, and says which it used. A bin of nine
     trials would produce a 90th percentile that is really its largest value. */
  const hit = bin || t.byKind?.[kind] || t.overall;
  if (!hit) return null;

  return {
    bin: bin ? key : null,
    basis: bin ? 'bin' : (t.byKind?.[kind] ? `all ${kind} lookups` : 'all lookups'),
    trials: hit.n,
    medianPct: hit.median,
    p90Pct: hit.p90,
    band: bandFor(hit.p90),
    builtAt: t.builtAt,
    calibration: t.calibration,
    note: bin
      ? `Half of lookups that looked like this one came in within ${(100 * hit.median).toFixed(1)}%, `
        + `nine in ten within ${(100 * hit.p90).toFixed(1)}%, over ${hit.n} held-out sales.`
      : `No bin met the trial floor for this shape of lookup, so this is the figure for `
        + `${hit.n} ${kind || ''} lookups of every shape. Treat it as a floor on the error, not a measure of this one.`,
  };
}

/** The table was built by a named estimator version. If that has moved on, the
 *  numbers describe a method that is no longer running. */
export function staleFor(estimatorVersion) {
  const t = table();
  if (!t) return null;
  return t.estimator && t.estimator !== estimatorVersion
    ? { was: t.estimator, now: estimatorVersion }
    : null;
}
