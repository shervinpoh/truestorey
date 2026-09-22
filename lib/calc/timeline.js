import { MOP_YEARS } from './constants.js';
import { calendarAnniversary, ssd, SSD_SCHEDULE } from './stampDuty.js';

/**
 * "When can I sell?" — the highest-intent question an owner types into Google,
 * and the one every portal sells to agents but nobody answers for the owner.
 *
 * The two sides of it are not the same question, and the tool used to pretend
 * they were.
 *
 *   HDB      there is a date. Before it you cannot sell on the open market at
 *            all. The answer is that date.
 *
 *   PRIVATE  there is no date. You may sell a condo the afternoon you collect
 *            the keys. What changes with time is the SSD bill, and the honest
 *            answer is not "when" but "what it costs you to go now, and what
 *            waiting is worth".
 *
 * The previous version asked ssd() for a `freeAfter` date and rendered nothing
 * at all when there wasn't one — so an owner four years in, the person with the
 * least to worry about, got a blank panel. Private now always returns a full
 * schedule with a cost against every step.
 */
export function sellTimeline({ propertyType, purchaseDate, keyCollectionDate = null, price = null,
  today = new Date(), mopYears = MOP_YEARS }) {
  const now = new Date(today);

  if (propertyType === 'HDB') {
    const start = new Date(keyCollectionDate || purchaseDate);
    const term = [5, 10, 20].includes(Number(mopYears)) ? Number(mopYears) : MOP_YEARS;
    const mopEnd = calendarAnniversary(start, term);
    const passed = now >= mopEnd;
    const events = [{
      key: 'MOP',
      label: 'Minimum Occupation Period ends',
      date: mopEnd,
      passed,
      meaning: passed
        ? 'You may sell on the open market, and you may buy private property.'
        : 'Until this date you cannot sell on the open market or own private property.',
    }];
    return { kind: 'HDB', mopYears: term, canSellNow: passed, events,
      nextEvent: events.find(e => !e.passed) || null, schedule: [] };
  }

  // ── private ──────────────────────────────────────────────────────────────
  const bought = new Date(purchaseDate);
  const nowSsd = ssd(price || 0, bought, now);
  const schedule = SSD_SCHEDULE(bought);

  // One row per band boundary: the date the rate drops, and what the drop is
  // worth on this price. The last row is the day SSD stops applying at all.
  const steps = schedule.map((band, i) => {
    const from = i === 0 ? new Date(bought) : calendarAnniversary(bought, schedule[i - 1].withinYears);
    const until = calendarAnniversary(bought, band.withinYears);
    return {
      holdingYear: band.withinYears,
      from, until,
      rate: band.rate,
      cost: price ? Math.round(price * band.rate) : null,
      current: now >= from && now < until,
      passed: now >= until,
    };
  });
  const freeFrom = steps.length
    ? calendarAnniversary(bought, schedule[schedule.length - 1].withinYears)
    : new Date(bought);
  const free = now >= freeFrom;

  const events = [{
    key: 'SSD',
    label: free ? 'Seller\u2019s Stamp Duty no longer applies' : 'Seller\u2019s Stamp Duty falls to zero',
    date: freeFrom,
    passed: free,
    meaning: free
      ? 'You can sell whenever you like, and no SSD is payable.'
      : `You can sell today \u2014 there is no minimum holding period on private property. Selling now costs ${(nowSsd.rate * 100).toFixed(0)}% of the sale price in SSD.`,
    currentRate: nowSsd.rate,
    regime: nowSsd.regime,
  }];

  return {
    kind: 'PRIVATE',
    // The point Shervin made, made explicit in the return value so no page can
    // render this as though there were a waiting period.
    canSellNow: true,
    free,
    currentRate: nowSsd.rate,
    currentCost: price ? Math.round(price * nowSsd.rate) : null,
    freeFrom,
    regime: nowSsd.regime,
    schedule: steps,
    events,
    nextEvent: events.find(e => !e.passed) || null,
  };
}
