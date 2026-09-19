/**
 * A view of the data as it stood before a given month.
 *
 * ── THE LEAK THIS EXISTS TO CLOSE ──────────────────────────────────────────
 * `sameRecordPrice` and `nearbyComps` filter comparables with
 * `month >= cutoff` and NO UPPER BOUND. That is correct for the live site,
 * where `now` is always today and there are no later sales to see. It is not a
 * bug there and this file does not fix one.
 *
 * It is fatal to a backtest. Passing a past `now` moves the lower cutoff back
 * and leaves every sale AFTER that date in the cohort — including, in the
 * worst case, the very sale being predicted. A backtest run that way reports
 * an accuracy that cannot be reproduced on a live lookup, which is the most
 * expensive kind of wrong number: it is confident, it is reproducible, and it
 * is measuring the answer key.
 *
 * So the truncation happens on the data rather than in the engine, and the
 * engine is left alone.
 *
 * ── STRICTLY BEFORE, NOT UP TO ─────────────────────────────────────────────
 * `month < asOf`, exclusive. HDB and URA both register by month with a lag, so
 * a sale in the SAME month as the subject would not have been visible when the
 * subject transacted even though it shares a date stamp. Including the month
 * would leak the most informative sales of all — the ones closest in time.
 */

/** @param asOf "YYYY-MM". Months sort lexically in that spelling. */
export function asOfRecord(rec, asOf) {
  if (!rec) return rec;
  return { ...rec, recent: (rec.recent || []).filter(s => String(s.month) < asOf) };
}

/**
 * Truncate the whole comparables index.
 *
 * Costly — 13,168 records — so a caller running many trials should build one
 * view per distinct month rather than one per trial. `buildViews` does that.
 *
 * Records left with no sales are DROPPED rather than kept empty, because
 * `nearbyComps` counts `places.size` to report how many addresses contributed,
 * and an address contributing nothing would inflate that count.
 */
export function asOfIndex(index, asOf) {
  const out = {};
  for (const [href, r] of Object.entries(index?.records || {})) {
    const sales = (r.sales || []).filter(s => String(s[0]) < asOf);
    if (!sales.length) continue;
    out[href] = { ...r, sales };
  }
  return { ...index, records: out };
}

/** One truncated index per distinct month, built once and shared. */
export function buildViews(index, months) {
  const views = new Map();
  for (const m of new Set(months)) views.set(m, asOfIndex(index, m));
  return views;
}
