/**
 * How an event somewhere else reaches a Singapore property decision.
 *
 * ── WHY THIS IS A WRITTEN MAP AND NOT A NEWS FEED ──────────────────────────
 * The ask was a page for catching up on news that affects property here, with
 * reasoning about what it means. A feed that fetched articles and summarised
 * them would be the obvious build and it is the wrong one, twice over:
 *
 *   · Rule 9. Nothing here reproduces anyone's reporting. Primary sources are
 *     indexed and linked; the reasoning is ours.
 *   · A model asked to explain a rate move produces a different explanation
 *     every time, and none of them can be checked. The same objection as the
 *     Blindspot rubric — an explanation nobody can audit is an opinion wearing
 *     analysis's clothes.
 *
 * So the CHAIN is written down once, versioned, and reviewed like a rate. What
 * changes between readings is the DATA at each link, and the arithmetic at the
 * end. The map states what a lever touches directly, what it reaches only
 * indirectly and through what, and — the part that is usually missing — what
 * it does NOT touch, because that is where most of the confident wrong
 * commentary lives.
 *
 * ── THE ONE ARITHMETIC CLAIM ──────────────────────────────────────────────
 * `rateScenario` computes the two consequences of a rate move that people
 * routinely conflate: the monthly payment, which moves, and the amount a
 * household can borrow, which frequently does not. Both come out of lib/calc,
 * which is where every rate in this repo carries a source and a review date.
 */
import { monthlyRepayment, affordability } from '../calc/affordability.js';
import { TDSR_LIMIT, MSR_LIMIT, STRESS_TEST_RATE, HDB_CONCESSIONARY_RATE, CPF_OA_RATE, RATES_REVIEWED }
  from '../calc/constants.js';

export const VERSION = '2026-09-transmission-v1';
export const REVIEWED = '2026-09-19';

/**
 * ── THE ASSESSMENT FLOOR IS THE HINGE ─────────────────────────────────────
 * TDSR is computed at a medium-term floor rate, not at the rate a bank offers.
 * So while the offered rate sits below that floor, a rise changes what a
 * borrower PAYS and not what they may BORROW — which is the opposite of what
 * almost everyone assumes, and it is the single most useful thing on this page.
 *
 * Above the floor the two move together again.
 *
 * NOTE FOR WHOEVER READS THIS NEXT: lib/calc/affordability.js assesses at
 * STRESS_TEST_RATE flat, not at max(offered, floor). That is correct for every
 * offered rate below 4% and would overstate borrowing power above it. No
 * Singapore mortgage is there today, so it has not been changed — but if
 * offered rates pass 4%, that function needs the max() and this note is the
 * reason why.
 */
export const assessmentRate = offered => Math.max(Number(offered) || 0, STRESS_TEST_RATE);

/**
 * What a change in the offered mortgage rate does, and does not, do.
 *
 * @param loan        outstanding or intended loan
 * @param tenureYears remaining tenure
 * @param from,to     offered rates, as decimals (0.03 = 3%)
 * @param applicants  optional — to show the borrowing-capacity half
 */
export function rateScenario({ loan, tenureYears = 25, from, to, applicants = [], monthlyDebts = 0, propertyType = 'HDB' } = {}) {
  const f = Number(from), t = Number(to);
  if (!(loan > 0) || !Number.isFinite(f) || !Number.isFinite(t)) {
    return { ok: false, reason: 'A loan amount and two rates are needed.' };
  }
  const payBefore = monthlyRepayment(loan, f, tenureYears);
  const payAfter = monthlyRepayment(loan, t, tenureYears);

  let capacity = null;
  if (applicants.length) {
    /* Assessed at the floor, or at the offered rate once it passes the floor —
       which is the rule, and the reason capacity often does not move. */
    const before = affordability({ applicants, monthlyDebts, propertyType, maxTenureYears: tenureYears });
    const aFrom = assessmentRate(f), aTo = assessmentRate(t);
    const income = before.totalIncomeCounted;
    const msr = MSR_LIMIT, tdsr = TDSR_LIMIT;
    const binding = Math.min(income * tdsr - monthlyDebts,
      ['HDB', 'EC_DEVELOPER'].includes(propertyType) ? income * msr : Infinity);
    const loanAt = r => {
      const m = r / 12, n = tenureYears * 12;
      return m === 0 ? binding * n : binding * (1 - Math.pow(1 + m, -n)) / m;
    };
    capacity = {
      assessedBefore: aFrom, assessedAfter: aTo,
      maxLoanBefore: Math.round(loanAt(aFrom)), maxLoanAfter: Math.round(loanAt(aTo)),
      unchanged: aFrom === aTo,
      floor: STRESS_TEST_RATE,
    };
  }

  return {
    ok: true, loan, tenureYears, from: f, to: t,
    monthlyBefore: Math.round(payBefore), monthlyAfter: Math.round(payAfter),
    monthlyDelta: Math.round(payAfter - payBefore),
    annualDelta: Math.round((payAfter - payBefore) * 12),
    capacity,
    /* Said in words, because the counterintuitive half is the point. */
    says: capacity && capacity.unchanged
      ? `Both rates sit under the ${(100 * STRESS_TEST_RATE).toFixed(1)}% floor that TDSR is assessed at, so how much they can BORROW does not move. What moves is the monthly payment.`
      : capacity
        ? `The offered rate has passed the ${(100 * STRESS_TEST_RATE).toFixed(1)}% assessment floor, so borrowing capacity now moves with it as well as the payment.`
        : 'Add an income to see the borrowing-capacity half.',
    reviewed: RATES_REVIEWED,
  };
}

/**
 * The levers. Each states what it touches directly, what it reaches only
 * through something else, what it does NOT touch, and what in our own data
 * would show it moving.
 */
export const LEVERS = [
  {
    key: 'fed',
    title: 'The Fed moves its policy rate',
    premise: 'The question is never whether Singapore follows. It is which parts follow, how fast, and which parts do not move at all.',
    direct: [
      ['MAS does not set an interest rate at all',
       'MAS runs monetary policy through the exchange rate — it manages the SGD against a trade-weighted basket within a band. There is no Singapore equivalent of a Fed funds decision to wait for, and commentary that expects one is looking for a lever that does not exist.'],
      ['Domestic rates are largely imported',
       'An open economy with free capital movement cannot hold both its exchange rate and its own interest rate. Singapore chooses the exchange rate, so SGD rates track USD rates. The gap between them moves with expectations of SGD appreciation: when the market expects a stronger SGD, investors accept a lower SGD yield, and local rates sit BELOW US rates rather than level with them.'],
      ['SORA is where it lands',
       'US policy reaches SGD funding through the swap market, and SORA follows with a lag. Mortgage packages pegged to 3-month compounded SORA reprice on their own schedule after that, so a household feels it one to two quarters after the headline.'],
    ],
    indirect: [
      ['Payment first, capacity later',
       'A rise changes what a borrower pays every month. It does not change what they may borrow until the offered rate passes the TDSR assessment floor. Most commentary merges the two and says buying power falls the day rates rise. Usually it has not.'],
      ['Volume moves before price',
       'Buyers meet a higher monthly cost by delaying or trading down, so transaction counts fall first. Prices are stickier, because a seller under no pressure simply does not list.'],
      ['The lock-in effect cuts supply as well as demand',
       'Owners sitting on a cheap fixed package are reluctant to sell and refinance into a dearer one. That withdraws resale listings at the same time as it cools demand, which is why a rate rise does not reliably produce the price falls people expect.'],
      ['Leverage maths flips',
       'When the mortgage rate passes the gross rental yield, a leveraged investment purchase is cash-negative from day one. Our own yield figures are the test: data/yield.json carries gross yields by project and district.'],
      ['Renting absorbs the deferred buyers',
       'Households that postpone a purchase still need somewhere to live, so rental demand firms while transaction volume softens.'],
    ],
    notDirect: [
      ['The HDB concessionary loan rate',
       `Pegged to the CPF Ordinary Account rate plus 0.1 point and changed by policy, not by markets — ${(100 * HDB_CONCESSIONARY_RATE).toFixed(1)}% today. An HDB buyer on an HDB loan feels almost nothing from a Fed move, which makes HDB demand structurally more insulated than private. This asymmetry is the most useful single consequence for a Singapore agent, and it is rarely said out loud.`],
      ['The CPF OA rate',
       `A statutory formula with a ${(100 * CPF_OA_RATE).toFixed(1)}% floor. It sets the accrued interest a seller must refund, so it shapes sale proceeds — and it is not a market rate.`],
      ['TDSR, MSR, LTV, ABSD and SSD',
       'All policy settings. They change when MAS, HDB or IRAS change them, on their own timetable and usually without warning. A rate cycle does not move them, though it may prompt a review.'],
    ],
    watch: [
      ['SORA', 'npm run ingest:sora — MAS eservices. It times out when MAS is under maintenance and the page then says so rather than guessing.'],
      ['Transaction volume', 'The Scan page and data/comps.json. Volume turns before price does, so it is the earlier signal.'],
      ['Gross yield against the offered rate', 'data/yield.json — the point at which a leveraged purchase stops paying for itself.'],
    ],
    sources: [
      ['Federal Reserve — FOMC calendar and statements', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'],
      ['MAS — monetary policy statements', 'https://www.mas.gov.sg/news/monetary-policy-statements'],
      ['MAS — domestic interest rates, including SORA', 'https://eservices.mas.gov.sg/statistics/dir/DomesticInterestRates.aspx'],
    ],
  },
  {
    key: 'mas',
    title: 'MAS adjusts the SGD policy band',
    premise: 'The slope, width and centre of the band are the actual instrument. Tightening means allowing faster SGD appreciation, not raising a rate.',
    direct: [
      ['Imported inflation', 'A stronger SGD makes imports cheaper, which is the channel MAS is aiming at. Construction materials are imported, so it reaches development cost.'],
      ['SGD interest rates, in the opposite direction to intuition',
       'A steeper appreciation path lets SGD rates sit further below USD rates, because investors are compensated in currency rather than yield. Tightening policy can therefore coincide with domestic rates staying low.'],
    ],
    indirect: [
      ['Foreign buyer economics', 'A stronger SGD raises the price of Singapore property in a foreign buyer\'s own currency, on top of the 60% ABSD they already face.'],
      ['Developer margins', 'Imported material costs fall as the SGD firms, which reaches land bid behaviour with a long lag.'],
    ],
    notDirect: [
      ['Anything in a mortgage quote, immediately', 'The band works through the currency; the rate effect is second-order and slow.'],
    ],
    watch: [['URA PPI and HDB RPI', 'Both are in data/. Quarterly, and they lag policy by more than one quarter.']],
    sources: [
      ['MAS — monetary policy statements', 'https://www.mas.gov.sg/news/monetary-policy-statements'],
      ['MAS — exchange rate policy explainer', 'https://www.mas.gov.sg/monetary-policy'],
    ],
  },
  {
    key: 'cooling',
    title: 'A cooling measure lands',
    premise: 'These are the only levers that change the arithmetic overnight, with no lag and no warning. Everything else on this page takes quarters.',
    direct: [
      ['ABSD', 'Changes the cash a buyer needs on the day it takes effect, and hits second and subsequent purchases and foreign buyers hardest.'],
      ['LTV', 'Changes the loan ceiling and therefore the downpayment, immediately.'],
      ['TDSR and MSR', `Change borrowing capacity directly — ${(100 * TDSR_LIMIT).toFixed(0)}% and ${(100 * MSR_LIMIT).toFixed(0)}% today.`],
      ['SSD', 'Changes the cost of selling early, which locks existing owners in and withdraws supply.'],
    ],
    indirect: [
      ['A pull-forward, then a gap', 'Announcements typically produce a rush before the effective date and a quiet stretch after it, so the months either side are not comparable to each other or to trend.'],
      ['Substitution rather than disappearance', 'A measure aimed at second properties pushes demand toward first-timer stock and toward the segment it did not touch.'],
    ],
    notDirect: [
      ['Anything already contracted', 'The rules that bind a transaction are the ones in force on its own dates. A live case is governed by the regime it started under.'],
    ],
    watch: [
      ['lib/calc/constants.js', `Every rate carries its source and a review date — currently ${RATES_REVIEWED}. When a measure lands, that file is what changes, and test/guides.test.js fails if the published guides disagree with it.`],
      ['Volume either side of the effective date', 'The pull-forward is visible in monthly counts.'],
    ],
    sources: [
      ['IRAS — BSD, ABSD and SSD', 'https://www.iras.gov.sg/taxes/stamp-duty/for-property'],
      ['MAS — media releases', 'https://www.mas.gov.sg/news'],
      ['HDB — press releases', 'https://www.hdb.gov.sg/about-us/news-and-publications/press-releases'],
    ],
  },
  {
    key: 'supply',
    title: 'Land is sold, or a project reaches TOP',
    premise: 'Supply is the one thing on this page that arrives on a published timetable, which makes it the most forecastable and the least talked about.',
    direct: [
      ['GLS awards set the floor for a future launch', 'What a developer paid is filed. What they will ask is not — construction cost and margin are published by nobody, which is why /land refuses to project a launch price from a land price.'],
      ['TOP dates create rental supply', 'Completion puts units into the rental market before it puts them into the resale market, because the five-year seller\'s stamp duty window and owner-occupier intentions delay resale.'],
    ],
    indirect: [
      ['MOP is a supply calendar for HDB', 'Blocks reaching their fifth year become eligible to sell on dates already fixed. How many actually list is not knowable, which is why the tools count eligibility and say so.'],
      ['A launch nearby reprices the resale stock around it', 'Buyers compare, and a new launch sets the visible ceiling for a precinct.'],
    ],
    notDirect: [
      ['Anything immediate', 'A GLS award reaches the market as completed housing four to six years later. It is the slowest lever here and the easiest to see coming.'],
    ],
    watch: [
      ['data/pipeline.json', 'URA development pipeline — 78 projects. Most carry no expected TOP year and it is stored as null rather than guessed.'],
      ['data/gls.json and gls-awards.json', '441 awarded sites, 1993 to 2026.'],
      ['The MOP register', 'Blocks reaching their fifth year within 1km, on the Valuation page.'],
    ],
    sources: [
      ['URA — Government Land Sales programme', 'https://www.ura.gov.sg/Corporate/Land-Sales'],
      ['URA — media releases and statistics', 'https://www.ura.gov.sg/Corporate/Media-Room'],
      ['HDB — MOP and resale eligibility', 'https://www.hdb.gov.sg/residential/selling-a-flat/eligibility'],
      ['SingStat — Table Builder', 'https://tablebuilder.singstat.gov.sg/'],
    ],
  },
];
