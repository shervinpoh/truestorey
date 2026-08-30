/**
 * What has been filed at a watched block since the last digest.
 *
 * WHY THIS EXISTS. The consent tick on every form reads "Email me the full
 * report and monthly updates on my block". That promise has been collected
 * since 24 Aug 2026 and nothing has ever sent an update. This is the thing
 * that was promised.
 *
 * ── THE WATERMARK, AND WHY THE OBVIOUS ONE IS WRONG ─────────────────────────
 *
 * The obvious watermark is a count: remember how many transactions the block
 * had, and anything above that is new. It is wrong here, because data/hdb.json
 * is a ROLLING WINDOW — 36 months of registrations, so an old month falls off
 * the back every time a new one arrives. A block can gain two sales and lose
 * two, and a count-based watermark would report nothing at all.
 *
 * The next obvious one is the latest month: anything newer than the last month
 * seen is new. Also wrong, and more quietly: HDB registers late. A sale agreed
 * in June can appear in the June figures weeks after June has been reported,
 * and a month-only watermark never looks back.
 *
 * So the mark is BOTH — the latest month seen, and how many rows that month
 * held when it was seen. Anything in a later month is new; anything in that
 * same month beyond the count that was recorded is new as well.
 *
 * ── WHICH ROWS ARE "THE EXTRAS" ─────────────────────────────────────────────
 *
 * HDB publishes no transaction id, so when a month goes from three rows to
 * five there is no way to know WHICH two are the new ones. The rows are sorted
 * by a fixed key and the tail is taken, which is at least deterministic and
 * reproducible: the same data produces the same answer on every run, and the
 * count is always exactly right even when the identity of a row is a guess.
 * The digest says "two more were registered for July", which is the claim the
 * data actually supports.
 *
 * ── THE FIRST RUN SENDS NOTHING ─────────────────────────────────────────────
 *
 * A new watch establishes its mark and reports no news. Otherwise subscribing
 * on a Tuesday would post three years of history as though it had all just
 * happened, which is both useless and untrue.
 */

/** Deterministic order, so "the newest two" means the same thing every run. */
const KEY = r => `${r.month}|${String(r.price).padStart(12, '0')}|${r.storeyRange || ''}|${r.flatType || ''}`;
const byKey = (a, b) => (KEY(a) < KEY(b) ? -1 : KEY(a) > KEY(b) ? 1 : 0);

/** The mark for a set of rows: the latest month, and how many rows it holds. */
export function markOf(rows) {
  if (!rows?.length) return { month: null, n: 0 };
  let month = null;
  for (const r of rows) if (!month || r.month > month) month = r.month;
  return { month, n: rows.filter(r => r.month === month).length };
}

/**
 * Returns { fresh, mark, firstRun }.
 *
 * `fresh` is newest-first, because a digest is read from the top and the most
 * recent registration is the one that answers the question.
 */
export function newSince(rows, mark) {
  const all = [...(rows || [])].sort(byKey);
  const next = markOf(all);

  if (!mark?.month) return { fresh: [], mark: next, firstRun: true };

  const later = all.filter(r => r.month > mark.month);
  const same = all.filter(r => r.month === mark.month);
  // Only ever a tail, never a re-report: if the month shrank — a revision, or
  // the window rolling — the extras are simply zero rather than negative.
  const extras = same.length > (mark.n || 0) ? same.slice(mark.n) : [];

  const fresh = [...later, ...extras].sort(byKey).reverse();
  return { fresh, mark: next, firstRun: false };
}

/**
 * The one-line summary a subject line can carry.
 *
 * States a count and a place and stops. No adjective belongs here: "3 sales
 * filed at 406 Ang Mo Kio Ave 10" is a fact, and anything warmer than that is
 * a market claim CEA PG 02-11 s3.1 would want substantiated.
 */
export function digestSubject(label, fresh) {
  const n = fresh.length;
  if (!n) return null;
  return `${n} sale${n === 1 ? '' : 's'} filed at ${label}`;
}

/**
 * Group the fresh rows by month, newest month first — the shape the email
 * renders, and the shape that lets it say "two more were registered for July"
 * rather than implying they happened this week.
 */
export function byMonth(fresh) {
  const m = new Map();
  for (const r of fresh) {
    if (!m.has(r.month)) m.set(r.month, []);
    m.get(r.month).push(r);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, rows]) => ({ month, rows }));
}
