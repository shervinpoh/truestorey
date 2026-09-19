/**
 * Whether this is a good buy — answered without forecasting a price.
 *
 * ── WHY THERE IS NO PREDICTED PRICE IN THIS FILE ───────────────────────────
 * The request behind it was "predict the price five to ten years out". Nobody
 * can do that for one home, and a tool that printed a number would be believed
 * — said out loud in a living room, under a CEA registration number — long
 * before it was ever checked. `lib/calc/windows.js` refuses the same thing in
 * its own header: every calculator in this market picks a growth rate that
 * reads well and compounds it, and nobody is shown the other tail.
 *
 * The refusal is not the interesting part, because MOST OF WHAT DECIDES THIS
 * IS ALREADY ON A CALENDAR:
 *
 *   · Lease decay is published arithmetic. SLA's table says what 66 years left
 *     is worth against a fresh lease, and what 56 will be worth — and the
 *     second number is knowable today, not forecast.
 *   · Supply is a schedule. Blocks reach MOP on dates already fixed.
 *   · Transaction costs are a published rate card.
 *   · And the market's own record says how often a hold of this length has
 *     cleared a hurdle of this size.
 *
 * So this separates WHAT IS SCHEDULED from WHAT IS UNKNOWN, and never averages
 * the two into one number. The output carries no verdict and no adjective.
 *
 * ── THE SUBTLETY THAT MAKES IT HONEST ──────────────────────────────────────
 * An index is a BASKET whose age composition stays roughly constant — older
 * stock leaves it, newer stock enters. A single flat does not: it ages a year
 * every year. So applying index growth to one leasehold home OVERSTATES that
 * home's growth by roughly its own lease decay, and the decay therefore
 * belongs INSIDE the hurdle rather than beside it. Adding it is not
 * double-counting. Omitting it is the error, and it is the error that every
 * "what will my flat be worth" calculator in this market makes.
 */
import { distribution, countAtOrBelow, compact, cagrFromTotal, qNum } from '../calc/windows.js';
import { relativity, annualDecay } from '../calc/lease.js';
import { bsd, absd } from '../calc/stampDuty.js';
import { GST_RATE } from '../calc/constants.js';
import { leaseRemaining, supplyWithin, glsWithin, comps } from '../blindspot/measure.js';
import { seriesFor } from './timebase.js';
import { estimate } from './avm.js';

export const VERSION = '2026-09-outlook-v1';

/**
 * ── COSTS THAT ARE CONVENTIONS, NOT PUBLISHED RATES ────────────────────────
 * BSD and ABSD come from lib/calc/constants.js, which is the single source of
 * truth for every statutory rate in this repo. These two are NOT statutory —
 * nobody publishes them and they are negotiated — so they live here as stated
 * assumptions rather than being smuggled into the constants file beside rates
 * that carry a source and a review date. Both are overridable per call, and
 * every surface prints them.
 */
export const FRICTION = {
  /** Seller's commission. 2% is the common HDB figure; private varies more. */
  agentRate: 0.02,
  /** Conveyancing, each side. Order-of-magnitude, not a quote. */
  legal: 3_000,
};

/**
 * @param rec        the record
 * @param areaSqft   required — the AVM cannot price an address
 * @param years      holding period. 5 and 10 are the ones people mean.
 * @param price      what they would pay. Defaults to the AVM's estimate.
 * @param profile    'SC' | 'PR' | 'FOREIGNER' for ABSD
 * @param count      which property this is for them, for ABSD
 */
/**
 * ── WHY THE EXTREMES ARE NOT THE HEADLINE ─────────────────────────────────
 * The first version of this led with "worst −24.1%, best +305.8%". Both are
 * true and the second is useless, in two separate ways.
 *
 * It is a BAD STATISTIC. A maximum over 118 OVERLAPPING windows is a single
 * observation, and the least stable number in the block — change the series by
 * one quarter and it can move by tens of points. Percentiles over the same
 * windows say the same thing without resting on one reading.
 *
 * It is also a DIFFERENT MARKET. That window is 1990-Q1 → 1997-Q1: before
 * ABSD (2011), before the current SSD regime (2010), before TDSR (2013), and
 * off an index reading 24.3 against today's 202.8. Forty of the 118 seven-year
 * windows start before 2000 and they occupy essentially the whole upper tail —
 * which is why even the p90 reads +165.9%.
 *
 * Deleting the upside would be its own dishonesty, so the extremes stay. They
 * are demoted, dated, and the regime is named beside them. `since` lets a
 * caller cut the record at a quarter and see the answer without them — and
 * where that leaves too few independent readings, it refuses, which for a
 * seven-year hold after TDSR it does.
 */
const PRE_MODERN = '2000-Q1';

const pctlOf = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]?.change ?? null;

/** Restrict a compacted series so its windows START at or after `since`. */
function sliceFrom(series, since) {
  if (!series || !since) return series;
  const i = qNum(since) - qNum(series.from);
  if (!Number.isFinite(i) || i <= 0) return series;
  if (i >= series.values.length - 1) return null;
  return { from: since, values: series.values.slice(i) };
}

export function outlook(rec, {
  areaSqft, floor = null, years = 10, price = null, profile = 'SC', count = 1,
  now = new Date(), agentRate = FRICTION.agentRate, legal = FRICTION.legal,
  /** Cut the record at a quarter, e.g. '2013-Q3' for post-TDSR only. */
  since = null,
} = {}) {
  if (!rec) return { ok: false, reason: 'No record.' };

  /* ── 1. WHERE IT STANDS TODAY ─────────────────────────────────────────── */
  const est = estimate(rec, { areaSqft, floor, asOf: now });
  const paying = Number(price) > 0 ? Number(price) : (est.ok ? est.price : null);
  if (!paying) return { ok: false, reason: est.ok ? 'No price.' : est.reason, estimate: est };

  /* ── 2. LEASE: SCHEDULED, NOT FORECAST ────────────────────────────────── */
  const rem = leaseRemaining(rec, now);
  const leftNow = Number.isFinite(rem?.years) ? rem.years : (Number.isFinite(rem) ? rem : null);
  let lease;
  if (!Number.isFinite(leftNow)) {
    lease = { ran: false, why: 'The tenure held for this record could not be read as a number of years.' };
  } else if (leftNow > 99) {
    /* Freehold, or the 500/999-year equivalents. relativity() returns null
       outside 1–99 rather than extrapolating, and that refusal is correct —
       so this says "no scheduled decay", which is a different claim from
       "the decay is zero because we could not look". */
    lease = { ran: true, freehold: true, leftNow, dropPct: 0,
              note: 'Freehold or equivalent. No scheduled lease decay.' };
  } else {
    const leftThen = leftNow - years;
    const a = relativity(Math.round(leftNow));
    const b = relativity(Math.round(leftThen));
    lease = (a && b)
      ? { ran: true, freehold: false, leftNow: Math.round(leftNow), leftThen: Math.round(leftThen),
          relativityNow: a, relativityThen: b,
          /* Relative to freehold, which is what the table measures. */
          dropPct: b / a - 1,
          /**
           * ── WHY THIS IS AN AVERAGE AND NOT annualDecay() AT A POINT ──────
           * The table is published to one decimal place, so the difference
           * between two ADJACENT years is quantised: it reads 0.6, 0.6, 0.6,
           * 0.5, 0.5 across 66 years left down to 58. Printing the endpoints
           * of that — "0.60 a year now, 0.50 by the end" — says the decay is
           * SLOWING, which is the exact opposite of the truth and is the kind
           * of wrong that gets repeated out loud. Averaged over the horizon
           * the noise cancels.
           */
          avgPerYear: (a - b) / years,
          /**
           * Where it actually goes. This is the finding people are surprised
           * by and it is invisible at a single point in the lease: roughly
           * flat around 0.6 a year through the fifties and sixties, then
           * 0.78 at forty years left, 1.08 at thirty, 1.60 at twenty. Same
           * lease, same table, nearly three times the erosion.
           */
          ladder: [60, 50, 40, 30, 20]
            .filter(y => y < leftNow)
            .map(y => ({ at: y, perYear: (relativity(y) - relativity(y - 5)) / 5 })),
          annualPointNow: annualDecay(Math.round(leftNow)),
          source: "SLA leasehold relativity table" }
      : { ran: false, why: `The table covers 1–99 years; this lease reads ${Math.round(leftNow)} now `
          + `and ${Math.round(leftThen)} in ${years} years.` };
  }

  /* ── 3. FRICTION: A PUBLISHED RATE CARD ───────────────────────────────── */
  const buyDuty = bsd(paying).total + (absd(paying, profile, count)?.total || 0);
  const sellCost = paying * agentRate * (1 + GST_RATE) + legal;
  /* SSD is deliberately absent: it runs out at three years and every horizon
     this tool is for is longer. Said rather than silently omitted. */
  const friction = {
    buyDuty, buyLegal: legal, sellCost,
    totalPct: (buyDuty + legal + sellCost) / paying,
    agentRate, legal, gst: GST_RATE,
    note: 'Duties are statutory. Commission and conveyancing are conventions, not published rates. '
        + 'SSD is zero at every horizon here — it expires at three years. Financing is excluded: '
        + 'interest depends on the loan, and lib/calc/plan.js is the tool for it.',
  };

  /* ── 4. THE HURDLE ────────────────────────────────────────────────────── */
  const leaseDrag = lease.ran && !lease.freehold ? -lease.dropPct : 0;
  const hurdleTotal = friction.totalPct + leaseDrag;
  const hurdle = {
    totalPct: hurdleTotal,
    cagr: cagrFromTotal(hurdleTotal, years),
    parts: { friction: friction.totalPct, lease: leaseDrag },
    means: `The market has to rise ${(100 * hurdleTotal).toFixed(1)}% over ${years} years for this `
         + `to return the money that went into it — before any interest.`,
  };

  /* ── 5. WHAT THE RECORD ACTUALLY DID ──────────────────────────────────── */
  const fam = est.ok ? est.evidence.flatType : null;
  const s = seriesFor(rec.kind, fam);
  const series = s ? compact(s.points) : null;
  const dist = series ? distribution(series, years) : null;
  const cleared = dist ? countAtOrBelow(dist, hurdleTotal) : null;
  let record = dist ? {
    ran: true,
    index: { id: s.id, label: s.label, base: s.base },
    years, n: dist.n, independent: dist.independent, from: dist.from, to: dist.to,
    /** The headline. Robust across 118 overlapping windows in a way a minimum
     *  or a maximum is not — see the note above PRE_MODERN. */
    percentiles: {
      p10: pctlOf(dist.sorted, 0.10), p25: pctlOf(dist.sorted, 0.25),
      median: dist.middle.change,
      p75: pctlOf(dist.sorted, 0.75), p90: pctlOf(dist.sorted, 0.90),
    },
    /** Kept, dated, and demoted. Deleting the upside would be its own
     *  dishonesty; leading with it was the mistake. */
    extremes: { worst: dist.worst, best: dist.best },
    /** How much of this record predates the modern policy regime. */
    regime: (() => {
      const pre = dist.sorted.filter(w => w.from < PRE_MODERN).length;
      return {
        preModern: pre, of: dist.n, cutoff: PRE_MODERN,
        note: pre
          ? `${pre} of ${dist.n} windows start before ${PRE_MODERN} — before ABSD (2011), the `
            + `current SSD regime (2010) and TDSR (2013), and off an index a fraction of today's. `
            + `They sit almost entirely in the upper tail, so every figure above the median here `
            + `is lifted by a market that no longer exists.`
          : `No window starts before ${PRE_MODERN}.`,
      };
    })(),
    worst: dist.worst, middle: dist.middle, best: dist.best,
    negative: dist.negative,
    /** THE FIGURE THIS WHOLE MODULE EXISTS FOR. Not a probability — the
     *  windows overlap and are not independent trials. A count of what
     *  happened. */
    belowHurdle: cleared,
    /** The same question asked of a shorter, more recent record. Null when
     *  not requested; a refusal object when there is not enough of it. */
    since: (() => {
      if (!since) return null;
      const cut = sliceFrom(series, since);
      const d2 = cut ? distribution(cut, years) : null;
      if (!d2) {
        return { ran: false, since,
          why: `Cutting the record at ${since} leaves too few NON-OVERLAPPING ${years}-year `
             + `stretches to read. Four is the floor. This is the honest answer rather than a `
             + `thin one: there is not enough history since ${since} to say what a ${years}-year `
             + `hold has done under that regime.` };
      }
      const c2 = countAtOrBelow(d2, hurdleTotal);
      return { ran: true, since, n: d2.n, independent: d2.independent, from: d2.from, to: d2.to,
               percentiles: { p10: pctlOf(d2.sorted, 0.10), p25: pctlOf(d2.sorted, 0.25),
                              median: d2.middle.change, p75: pctlOf(d2.sorted, 0.75),
                              p90: pctlOf(d2.sorted, 0.90) },
               negative: d2.negative, belowHurdle: c2 };
    })(),
  } : null;

  /* ── A REFUSAL THAT NAMES THE LIMIT ───────────────────────────────────────
   * distribution() requires four NON-OVERLAPPING readings before it will
   * speak, which is its own guard and a good one. The consequence is specific
   * and worth stating rather than reporting as a blank: HDB's index begins in
   * 1990-Q1, so it carries seven-year stretches and not ten-year ones, while
   * URA's begins in 1975 and carries both. "Cannot be read" leaves the reader
   * thinking the tool is broken; naming the longest horizon that CAN be read
   * turns the same refusal into the next thing to run. */
  if (!record && series) {
    let longest = null;
    for (let y = years - 1; y >= 1; y--) if (distribution(series, y)) { longest = y; break; }
    record = {
      ran: false,
      why: `${s.label} begins in ${s.points[0].quarter}, which leaves fewer than four `
         + `non-overlapping ${years}-year stretches. Four is the floor, and overlapping `
         + `windows are not independent readings.`,
      longestReadable: longest,
    };
  } else if (!record) {
    record = { ran: false, why: 'No price index is held for this kind of home.' };
  }

  /* ── 6. SUPPLY ALREADY ON THE CALENDAR ────────────────────────────────── */
  const self = comps().records?.[rec.href];
  let supply = { ran: false, why: 'No coordinate for this record, so nothing can be counted around it.' };
  if (self && Number.isFinite(self.lat)) {
    const mop = supplyWithin(self.lat, self.lon, { km: 1, years: Math.min(years, 5), town: rec.town, from: now });
    const gls = glsWithin(self.lat, self.lon, { km: 1 });
    supply = { ran: true, km: 1, mop, gls,
      note: 'Blocks reaching MOP become eligible to sell on dates already fixed. This is a '
          + 'calendar, not a forecast — but how many actually list is not knowable.' };
  }

  return {
    ok: true, version: VERSION, years,
    today: {
      paying,
      psf: Math.round(paying / Number(areaSqft)),
      basis: Number(price) > 0 ? 'the price you gave' : 'the AVM estimate',
      estimate: est.ok ? { psf: est.psf, price: est.price, band: est.band, error: est.error } : null,
    },
    lease, friction, hurdle, record, supply,
    /**
     * Stated, every time. A list of what the analysis could not see is not a
     * disclaimer — it is the part that tells Shervin what to go and find out,
     * and silent truncation reads as completeness.
     */
    unknown: [
      'Whether this home tracks the index at all. The index is a market; this is one home.',
      'The unit itself — facing, corner or corridor, layout efficiency, noise, renovation. '
        + 'None is in any public dataset and together they are most of the AVM\'s error.',
      'How many of the MOP blocks nearby will actually list, and when.',
      'Interest rates, which decide the monthly cost and are excluded here by design.',
      'Policy. Cooling measures, LTV, ABSD and grant changes have moved this market more than '
        + 'any fundamental in the record above, and none of them is on a calendar.',
    ],
  };
}
