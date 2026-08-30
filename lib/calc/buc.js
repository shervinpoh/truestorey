import { monthlyRepayment } from './affordability.js';

/**
 * Paying for a home that is still being built.
 *
 * ── THE PERCENTAGES ARE LAW. THE DURATIONS ARE NOT. ─────────────────────────
 *
 * Every figure in STAGES below is set by the Housing Developers Rules, and the
 * `wording` on each one is quoted from them rather than paraphrased. That
 * matters more than it sounds: the competitor calculator this was checked
 * against renders stage 3 as "Brick walls for unit completed" where the Rules
 * say PARTITION WALLS — which are routinely drywall or precast — and stage 4 as
 * "Ceiling of completed unit" where the Rules say ROOFING. Both send a buyer
 * to watch for the wrong thing. It also writes "for unit" throughout where the
 * Rules say "of the Building"; in a multi-block development those are
 * different milestones.
 *
 * What that calculator ALSO prints is a Duration column — "6-9 months",
 * "3-6 months" — beside the statutory percentages, in the same table, in the
 * same weight. There is no such thing in the Rules. Every construction stage
 * falls due "within 14 days immediately after the date on which the Purchaser
 * receives from the Vendor notice that [the stage] has been completed". THE
 * SCHEDULE IS EVENT-DRIVEN, NOT CALENDAR-DRIVEN, and a table that implies
 * otherwise is telling a buyer they can plan around dates nobody has promised.
 *
 * So this module returns no durations at all. The order is fixed; the calendar
 * is not ours to publish.
 *
 * ── THE BOOKING FEE IS NOT 5% BY LAW ────────────────────────────────────────
 *
 * The Rules define it as "the booking fee of such amount as set out in item 2
 * of the Fourth Schedule" — set per project, in the agreement. 5% is market
 * convention for a new launch, so it is the DEFAULT and it is editable.
 * Publishing a convention as a rule is the same error as the Duration column.
 *
 * Source: Housing Developers Rules (Cap. 130, R 1), First Schedule — the
 * prescribed Sale and Purchase Agreement, clause 5.1 Payment Schedule.
 * https://sso.agc.gov.sg/SL/HDCLA1965-R1?ProvIds=Sc1-
 * Read against the version current as at 31 Aug 2026. Confirmed by Shervin,
 * 31 Aug 2026, the way the stress rate and the HDB cash floor were.
 */

export const BUC_SOURCE = {
  name: 'Housing Developers Rules (Cap. 130, R 1), First Schedule — prescribed Sale and Purchase Agreement, clause 5.1',
  url: 'https://sso.agc.gov.sg/SL/HDCLA1965-R1?ProvIds=Sc1-',
  versionAsAt: '2026-08-31',
  reviewed: '2026-08-31',
};

/**
 * The nine stages, in order, worded as the Rules word them.
 *
 * `on` is the plain-English handle a reader scans for; `wording` is what the
 * law actually says and is what the page prints underneath. Never edit
 * `wording` to read more smoothly — it is a quotation.
 */
export const STAGES = [
  { pct: 20, on: 'Signing the S&P',
    wording: '20% of the Purchase Price (inclusive of the Booking Fee), upon signing this Agreement, or within 8 weeks immediately after the date of the Option.',
    kind: 'signing' },
  { pct: 10, on: 'Foundation',
    wording: 'Notice that the foundation work (inclusive of pile caps) of the Building has been completed.' },
  { pct: 10, on: 'Reinforced concrete framework',
    wording: 'Notice that the reinforced concrete framework of the Building has been completed.' },
  { pct: 5, on: 'Partition walls',
    wording: 'Notice that the partition walls of the Building have been completed.' },
  { pct: 5, on: 'Roofing',
    wording: 'Notice that the roofing of the Building has been completed.' },
  { pct: 5, on: 'Frames, wiring, plastering and plumbing',
    wording: 'Notice that the door sub-frames/door frames and window frames are in position, and that the electrical wiring (without fittings), the internal plastering and the plumbing of the Building have been completed.' },
  { pct: 5, on: 'Car park, roads and drains',
    wording: 'Notice that the car park, roads and drains serving the Housing Estate have been completed.' },
  { pct: 25, on: 'TOP — you get the keys',
    wording: 'Either the TOP or CSC in respect of the Building, and notice that the Building and all roads and drainage and sewerage works in the Housing Estate have been completed, and that water and electricity supplies, and gas supplies (if any) have been connected to the Building.',
    kind: 'top' },
  { pct: 15, on: 'Completion',
    wording: 'On the Completion Date: 2% of the Purchase Price to the Vendor, and 13% to the Singapore Academy of Law as stakeholder, which pays the Vendor 8% within 7 working days after it receives the CSC, and 5% (or 5% less all authorised deductions) on the Final Payment Date.',
    kind: 'completion' },
];

/** Every construction stage falls due on NOTICE, not on a date. */
export const NOTICE_DAYS = 14;

/**
 * The ladder.
 *
 * ── HOW THE MONEY IS ORDERED, AND WHY IT IS NOT A CHOICE ────────────────────
 * A buyer's own share is (100 − LTV)% and it is spent FIRST, because the bank
 * does not disburse until the buyer's equity is in. At 75% that means the 20%
 * on signing, then 5% of the foundation stage — after which every remaining
 * dollar is a drawdown. That is why the first instalment appears at the
 * foundation stage and not before.
 *
 * ── THE INSTALMENT IS AN ASSUMPTION AND IS LABELLED AS ONE ──────────────────
 * `monthly` is the fully amortising payment on the amount drawn SO FAR, over
 * the full tenure. That is how Singapore banks usually present a BUC loan and
 * it is what makes the payment climb stage by stage — you are only charged on
 * what has been disbursed. It is not universal: some packages are interest-only
 * until TOP, which is cheaper during construction and identical afterwards. The
 * page says which one it assumed.
 */
export function progressive({
  price,
  ltv = 0.75,
  bookingFeePct = 0.05,
  rate = 0.025,
  tenureYears = 25,
}) {
  const p = Number(price) || 0;
  const ownShare = Math.max(0, 1 - ltv);

  let ownLeft = p * ownShare;
  let drawn = 0;
  let cashCpfTotal = 0;

  const rows = STAGES.map(s => {
    const due = p * (s.pct / 100);
    // The buyer's equity goes in first, then the bank.
    const own = Math.min(ownLeft, due);
    const loan = due - own;
    ownLeft -= own;
    drawn += loan;
    cashCpfTotal += own;

    return {
      ...s,
      due,
      own,
      loan,
      drawnAfter: drawn,
      /* Zero until the bank has actually disbursed something — a monthly
         payment on a loan that has not started is a number with no referent. */
      monthly: drawn > 0 ? monthlyRepayment(drawn, rate, tenureYears) : 0,
    };
  });

  /*
   * The booking fee is the one slice that must be CASH. CPF cannot be used
   * before the Sale and Purchase Agreement exists, and the fee is what buys
   * the Option that precedes it. At the conventional 5% this is also exactly
   * the 5% minimum cash a 75% LTV requires, which is why the two are so often
   * conflated — they coincide, they are not the same rule.
   */
  const bookingFee = p * bookingFeePct;
  const signingBalance = Math.max(0, p * 0.20 - bookingFee);

  return {
    price: p,
    rows,
    bookingFee,
    signingBalance,
    cashCpfTotal,
    loanTotal: drawn,
    /* What a bank would lend against this price, for the caller to compare
       with what the borrower can actually be assessed for. */
    ltv,
    monthlyAtTop: rows.find(r => r.kind === 'top')?.monthly ?? 0,
    monthlyFinal: rows.at(-1)?.monthly ?? 0,
    /* Interest is only charged on what is drawn, so the payments before TOP
       are genuinely smaller — this is the figure people are surprised by. */
    assumption: 'amortising-on-drawn',
  };
}

/** The percentages must always account for the whole price. */
export const totalPct = () => STAGES.reduce((a, s) => a + s.pct, 0);
