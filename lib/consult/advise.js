/**
 * What a screened listing means, said the way an agent would say it.
 *
 * The screen already knew everything: what similar homes sold for, how far
 * the asking sits from that, whether the gap survives the method's own error,
 * and what in the records might explain it. What it printed was
 * `premium-against-risk` beside "+5.2%" — the analyst's working, not an
 * answer. Asked what a good result looked like, the honest reply was that the
 * page never said.
 *
 * So every result is turned into four things here, and only these reach the
 * page: a verdict in words, the range the recent sales support, what to do
 * about it, and the reasons in plain terms. Nothing is recomputed — this reads
 * the residual and the score and translates them — so the words can never
 * drift from the numbers underneath.
 *
 * ── THE WORDS IT WILL NOT USE ─────────────────────────────────────────────
 * "Undervalued", "bargain", "best deal". A price below comparable sales with
 * nothing in the records to explain it is a reason to view quickly; whether
 * it is a good buy is settled inside the unit, which no dataset has seen.
 */

/** Best first. The order a buyer's shortlist should be read in. */
export const RANK = {
  'below-unexplained': 1,
  'in-line': 2,
  'below-explained': 3,
  'above-unexplained': 4,
  'above-with-risks': 5,
  'cannot-judge': 6,
  'cannot-price': 7,
};

const money = n => 'S$' + Math.round(n).toLocaleString('en-SG');
const pct = v => `${(100 * Math.abs(v)).toFixed(0)}%`;

/* A watch-out, in the few words it takes inside a sentence... */
const WATCH = {
  lease: 'a shortening lease',
  liquidity: 'slow resale',
  supply: 'nearby MOP supply',
  gls: 'new land sales nearby',
  view: 'building works planned nearby',
  price: 'its price',
};
/* ...and on its own line, with what it means for the buyer. */
const WATCH_LINE = {
  liquidity: 'Flats here change hands less often than most, so selling it later may take longer.',
  supply: 'Many flats nearby reach their MOP soon — more competition when it is time to sell.',
  gls: 'Government land sales nearby will add new supply.',
  view: 'Something is planned to be built close by — check what it blocks.',
};
const joinWords = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

/* What each check is called when you are standing in front of a client. */
const PLAIN = {
  lease: 'lease left',
  liquidity: 'how often flats here sell',
  supply: 'flats nearby reaching MOP',
  gls: 'new land sales nearby',
  view: 'what is being built around it',
  rail: 'MRT access',
  primary: 'primary schools within 1km',
  daily: 'shops and food nearby',
  price: 'price',
};

/**
 * Turn a declined estimate's reason into something actionable. The
 * estimator's own reasons are written for whoever maintains it.
 */
export function plainReason(reason = '', sizeCheck = null) {
  if (sizeCheck?.ran && sizeCheck.plausible === false) {
    return {
      says: 'The floor area in the listing does not match any flat in this block, so there is nothing like it to compare against.',
      fix: sizeCheck.suggest
        ? `Check the size. ${sizeCheck.suggest}`
        : `Check the size — this block's flats are ${sizeCheck.rangeSqft}.`,
    };
  }
  if (/floor area is required/i.test(reason)) return { says: 'The listing has no floor area.', fix: 'Add the size in sqft and screen again.' };
  if (/At least \d+ comparable/i.test(reason) || /too few/i.test(reason)) {
    return { says: 'Too few recent sales of homes like this one nearby to price it.', fix: 'Price it by hand from the few sales there are, or use the Development page for the whole project.' };
  }
  if (/worth only/i.test(reason) || /Too far to be about this home/i.test(reason)) {
    return {
      says: 'The recent sales nearby are too different from this home — in size, age or distance — to price it reliably.',
      fix: 'Check the size and storey first; a wrong size is the usual cause. If they are right, this home is unusual for its area and needs pricing by hand.',
    };
  }
  if (/No record matched/i.test(reason)) return { says: 'The address did not match any block or project in the records.', fix: 'Paste the block number and street, or the project name, exactly as the listing shows it.' };
  if (/price and a floor area/i.test(reason)) return { says: 'The listing is missing its price or its size.', fix: 'Fill in both in the table above and screen again.' };
  return { says: 'This one could not be priced from the records.', fix: reason ? `Detail: ${reason}` : null };
}

/**
 * @param x one row from /api/screen: { ok, reason, residual, score, factors, sizeCheck, price }
 */
export function advise(x) {
  if (!x.ok || !x.residual) {
    const r = plainReason(x.reason, x.sizeCheck);
    return { key: 'cannot-price', rank: RANK['cannot-price'], verdict: "Can't price this one", tone: 'muted', ...r, reasons: [] };
  }

  const R = x.residual;
  const band = R.estimate.band;
  const range = `${money(band.priceLow)} – ${money(band.priceHigh)}`;
  const gap = R.gap;
  const wide = R.estimate.error?.band === 'wide';
  const flaggedKeys = (R.test2?.flagged || []).map(f => f.key);
  const flagged = flaggedKeys.map(k => WATCH[k] || PLAIN[k] || k);

  /* Positives from the score: factors that scored full marks, said as what
     they are for a buyer. The lease is left out — it has its own line with
     its number, and "good for lease left" said nothing that line does not. */
  const GOOD = {
    rail: 'an MRT station close by',
    primary: 'primary schools within 1km',
    daily: 'shops and food nearby',
    liquidity: 'flats here sell readily',
    supply: 'little MOP supply nearby to compete with',
    gls: 'no new land sales nearby',
    view: 'nothing major planned next door',
  };
  const positives = (x.factors || [])
    .filter(f => f.ran && f.points === f.max && f.max > 0 && GOOD[f.key])
    .map(f => GOOD[f.key])
    .slice(0, 3);

  const reasons = [];
  /* The lease once, with its number — it was printed twice, as a watch-out
     and again as a figure. */
  const lease = (x.factors || []).find(f => f.key === 'lease' && f.ran);
  if (lease?.freehold) reasons.push({ good: true, text: 'Freehold.' });
  else if (Number.isFinite(lease?.value)) {
    reasons.push({ good: !flaggedKeys.includes('lease'), text: `${Math.round(lease.value)} years of lease left.` });
  }
  if (positives.length) {
    const t = joinWords(positives);
    reasons.push({ good: true, text: t[0].toUpperCase() + t.slice(1) + '.' });
  }
  for (const k of flaggedKeys) if (WATCH_LINE[k]) reasons.push({ good: false, text: WATCH_LINE[k] });

  let key, verdict, tone, action;
  const code = R.verdict.code;
  if (code === 'unmeasured') {
    key = 'cannot-judge'; verdict = "Can't judge the price yet"; tone = 'muted';
    action = `Similar homes sold for ${range}, but this tool's error has not been measured, so it cannot say whether the gap matters.`;
  } else if (code === 'noise') {
    key = 'in-line'; verdict = 'Priced in line with the market'; tone = 'neutral';
    action = `Similar homes sold for ${range}. The asking sits inside the normal spread, so there is no pricing edge either way — negotiate as usual, and use the lower half of that range as your anchor.`;
  } else if (code === 'discount-unexplained') {
    key = 'below-unexplained'; verdict = 'Priced below the market'; tone = 'good';
    action = `About ${money(Math.abs(gap.dollars))} (${pct(gap.pct)}) under what similar homes sold for, and nothing in the records explains it. Worth viewing soon — check condition, facing and noise in person, because that is where an unexplained discount usually comes from.`;
  } else if (code === 'discount-explained') {
    key = 'below-explained'; verdict = 'Cheaper, but for a reason'; tone = 'neutral';
    action = `About ${money(Math.abs(gap.dollars))} (${pct(gap.pct)}) under similar sales, but it comes with ${joinWords(flagged)}. The market is probably pricing that in — cheaper for a reason rather than a find.`;
  } else if (code === 'premium-unexplained') {
    key = 'above-unexplained'; verdict = 'Asking is above the market'; tone = 'bad';
    action = `About ${money(gap.dollars)} (${pct(gap.pct)}) over what similar homes sold for, and nothing in the records justifies it. Ask the seller's agent what does — renovation, view, layout — and offer within ${range}; the sales back that.`;
  } else {
    key = 'above-with-risks'; verdict = 'Asking is above the market, with watch-outs'; tone = 'bad';
    action = `About ${money(gap.dollars)} (${pct(gap.pct)}) over similar sales, on a home that comes with ${joinWords(flagged)}. Hard to justify — offer within ${range} or keep looking.`;
  }

  /* A wide estimate softens everything above. Said first, because it
     changes how much weight the rest can bear. */
  const caution = wide
    ? 'Few sales close to this home, so the range is rough — treat the verdict as a lead to check, not a finding.'
    : null;

  return {
    key, rank: RANK[key], verdict, tone, action, caution, reasons,
    range, nineInTen: band.outer ? `${money(band.outer.priceLow)} – ${money(band.outer.priceHigh)}` : null,
    gapPct: gap.pct, gapDollars: gap.dollars,
  };
}
