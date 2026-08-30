import table from '../../data/sources/leasehold-table.json' with { type: 'json' };

/**
 * What a lease is worth as a share of freehold — the published table, and what
 * the market actually paid.
 *
 * ── WHAT THIS IS ───────────────────────────────────────────────────────────
 * SLA's leasehold relativity table, all ninety-nine rows. It is not a market
 * forecast and not anybody's opinion: it is the schedule the State itself uses
 * to price lease renewals, differential premium and land betterment charge. A
 * fresh 99-year lease is 96% of freehold; sixty years left is 80%; thirty is
 * 60%. The decay is not linear and that is the whole point of the thing —
 * the early decades are gentle and the last ones are steep.
 *
 * ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
 * The brief this came from asked for the table plotted against "a standard 2%
 * annual inflation/appreciation line", with the crossing marked as an
 * "inflection point ... so users know exactly when their exit strategy must be
 * executed."
 *
 * Both halves are refused. The 2% line is invented — nobody publishes a
 * promised appreciation rate, and drawing one turns a published schedule into
 * a forecast. And "when your exit must be executed" is advice to sell, which
 * rule 5 forbids outright and which no amount of charting makes acceptable.
 *
 * What replaces it is better and is only possible here: the table is a
 * PREDICTION OF RELATIVE VALUE, and this site holds tens of thousands of filed
 * transactions that each carry a remaining lease. So the published factor can
 * be shown against what buyers actually paid. That is a comparison of a
 * government schedule with observed evidence — no forecast, no advice, and
 * nobody else has both halves.
 *
 * ── SOURCE ─────────────────────────────────────────────────────────────────
 * The table is SLA's. It is transcribed from Table 1 of Kwong, Goh & Ti (2025)
 * because SLA does not publish it at any URL findable on 31 Aug 2026 — their
 * own site 404s on the obvious paths and does not link it from lease policy.
 * The paper is peer-reviewed, its own source line reads "Source: Singapore
 * Land Authority", and all ninety-nine rows reconcile with the three figures
 * quoted across the industry. That chain is stated on the page rather than
 * implied: the reader is told it came via the paper.
 */

export const LEASE_TABLE = table;

/**
 * The published share of freehold value for a whole number of years left.
 *
 * Returns null outside 1–99 rather than extrapolating. A 999-year lease and a
 * lease already expired are both real things and the table covers neither;
 * inventing a row for them would be the exact failure this file exists to
 * avoid.
 */
export function relativity(yearsLeft) {
  const y = Math.round(Number(yearsLeft));
  if (!Number.isFinite(y)) return null;
  return table.years[String(y)] ?? null;
}

/**
 * What the table says one year of holding costs, at a given point in the lease.
 *
 * This is the figure people are actually surprised by, and it is a subtraction
 * rather than a projection: the table's own value this year minus its value
 * next year. At 90 years left it is about a quarter of a per cent; at 40 it is
 * three quarters; at 20 it is nearly a point and a half. Same lease, same
 * table, six times the annual erosion.
 */
export function annualDecay(yearsLeft) {
  const now = relativity(yearsLeft);
  const next = relativity(yearsLeft - 1);
  if (now == null || next == null) return null;
  return now - next;
}

/**
 * The whole curve, for drawing. Years descending, so it reads left to right as
 * a lease running down.
 */
export function curve() {
  return Object.keys(table.years)
    .map(Number)
    .sort((a, b) => b - a)
    .map(y => ({ years: y, pct: table.years[String(y)] }));
}

/** "51 years 11 months" — the shape HDB publishes — as a number of years. */
export function parseRemaining(s) {
  if (typeof s === 'number') return s;
  const t = String(s || '');
  const y = /(\d+)\s*year/.exec(t);
  const m = /(\d+)\s*month/.exec(t);
  if (!y && !m) return null;
  return (y ? Number(y[1]) : 0) + (m ? Number(m[1]) / 12 : 0);
}
