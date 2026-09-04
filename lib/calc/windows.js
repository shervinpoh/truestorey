/**
 * Every holding period that actually happened.
 *
 * ── THE QUESTION ───────────────────────────────────────────────────────────
 * Every calculator in this market models the upside. Ask one what a home is
 * worth in five years and it will pick a growth rate — 3%, 4%, whatever reads
 * well — and compound it. Nobody is shown the other tail, and the other tail
 * is where the decision actually lives: HDB's index took from 1997 to 2010 to
 * recover its previous peak, and URA's took from 1996 to 2010. A buyer in
 * either of those years was not unlucky in a way that needed forecasting. They
 * were in a window that the published record already contains.
 *
 * So this does not forecast. It reads a published index and returns EVERY
 * window of the reader's own holding length that has ever run: the worst, the
 * middle one, the best, how many finished below where they started, and — the
 * figure the whole feature exists for — how many finished below the rise a
 * particular sale needs just to return the reader's own money.
 *
 * ── WHY A COUNT AND NOT A PROBABILITY ──────────────────────────────────────
 * "31 of 202 five-year stretches since 1975 ended lower" is a fact about the
 * record. "A 15% chance of a loss" is a claim about the future, and it is the
 * same claim dressed as arithmetic. Overlapping windows are not independent
 * samples and nothing here pretends they are: they are read as history, which
 * is what they are.
 *
 * ── WHAT THIS CANNOT DO ────────────────────────────────────────────────────
 * An index is a market. A home is one home. Applying a national series to a
 * single address says what the MARKET did, not what that address did, and the
 * gap between them is exactly what /blindspot exists to measure. The page
 * carrying these figures has to say so, and it does.
 */

/** Quarters since year 0, so windows are arithmetic rather than date parsing. */
export const qNum = q => {
  const mt = /^(\d{4})-Q([1-4])$/.exec(String(q));
  if (!mt) return null;
  return Number(mt[1]) * 4 + Number(mt[2]) - 1;
};
export const qLabel = n => `${Math.floor(n / 4)}-Q${(n % 4) + 1}`;

/**
 * A compact series: a first quarter and an array of values. Both index files
 * are contiguous quarterly runs with no gaps — asserted in the ingests and in
 * test/windows.test.js — which is what lets the labels be arithmetic instead
 * of being shipped with every point. It halves what /cost sends to the client.
 */
export function compact(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const first = qNum(points[0].quarter);
  if (first === null) return null;
  for (let i = 1; i < points.length; i++) {
    if (qNum(points[i].quarter) !== first + i) return null;   // a gap: refuse
  }
  return { from: points[0].quarter, values: points.map(p => p.index) };
}

/** Every window of `quarters` length, oldest first. */
export function windowsOf(series, quarters) {
  const n = Math.round(quarters);
  const v = series?.values;
  if (!Array.isArray(v) || !(n > 0) || v.length <= n) return [];
  const base = qNum(series.from);
  const out = [];
  for (let i = 0; i + n < v.length; i++) {
    out.push({
      from: qLabel(base + i),
      to: qLabel(base + i + n),
      change: v[i + n] / v[i] - 1,
    });
  }
  return out;
}

/**
 * The distribution of those windows.
 *
 * `middle` is a real dated window and not an interpolated median, because
 * every figure on the page has to be something that happened. On an even
 * count that is the upper of the two central windows; the difference is
 * immaterial and a date that exists is not.
 *
 * Returns null rather than a shape full of nulls when the series is too short
 * for the holding period asked for — a 30-year window against HDB's 36 years
 * of quarters leaves 25 samples, and against 10 years of data it leaves none.
 * A check that cannot run scores nothing and says so.
 */
export function distribution(series, years) {
  const quarters = Math.round((Number(years) || 0) * 4);
  const all = windowsOf(series, quarters);
  if (all.length < 4) return null;

  const sorted = [...all].sort((a, b) => a.change - b.change);
  const negative = sorted.filter(w => w.change < 0).length;

  return {
    years: quarters / 4,
    quarters,
    n: all.length,
    /** The span the windows are drawn from, for the provenance line. */
    from: all[0].from,
    to: all.at(-1).to,
    worst: sorted[0],
    best: sorted.at(-1),
    middle: sorted[Math.floor(sorted.length / 2)],
    negative,
    negativeShare: negative / sorted.length,
    /** Sorted ascending, kept so a caller can count without re-sorting. */
    sorted,
  };
}

/**
 * How many of those windows finished at or below a given change.
 *
 * This is the one that turns a break-even percentage into something a reader
 * can weigh: a sale needing +8.4% just to return the money that went in is an
 * abstraction until you are told that 61 of the 202 five-year stretches on
 * record did not manage it.
 */
export function countAtOrBelow(dist, change) {
  if (!dist || !Number.isFinite(change)) return null;
  let lo = 0, hi = dist.sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dist.sorted[mid].change <= change) lo = mid + 1; else hi = mid;
  }
  return { count: lo, of: dist.sorted.length, share: lo / dist.sorted.length };
}
