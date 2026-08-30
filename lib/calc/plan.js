/**
 * The Financial Planner — the three calculators as one answer.
 *
 * TDSR, BSD and ABSD have all been in lib/calc since the first week, tested,
 * and answering three separate questions. Nobody buys a flat in three separate
 * questions. What a buyer actually asks is "can I do this, and what do I need
 * in the bank on the day", and answering that is a chain, not a fourth
 * calculator:
 *
 *   income and debts  → TDSR/MSR  → the loan a bank will assess you for
 *   the price         → LTV       → the loan the property will carry
 *   the smaller of those two                → the loan
 *   price minus the loan                    → the downpayment
 *   part of which must be cash, not CPF     → the cash floor
 *   plus BSD, plus ABSD if it is not your first
 *                                           → what you need on the day
 *
 * Two things this deliberately does NOT do.
 *
 * It does not value anything. Feed it a price; it will not tell you what a
 * home is worth. Rule 2.
 *
 * It does not quietly pick the friendly branch. Where a rule has a cliff — the
 * LTV drop for a long tenure, the ABSD step for a second property — the
 * planner reports which side it used and why, because the number is worthless
 * if the reader cannot see which assumption produced it.
 */
import { affordability } from './affordability.js';
import { bsd, absd } from './stampDuty.js';
import { LTV, LTV_REVIEWED, MORTGAGE_DUTY, TENURE_CAP, TENURE_AGE_LIMIT, TDSR_LIMIT, MSR_LIMIT, STRESS_TEST_RATE, HDB_LOAN_CASH_MIN, HDB_LOAN_CASH_MIN_REVIEWED } from './constants.js';

/**
 * Which LTV ceiling applies, and the sentence explaining why it applies.
 *
 * The ceiling turns on how many housing loans are ALREADY running, not on how
 * many properties are owned — someone who owns a second flat outright still
 * borrows at the first-loan ceiling. Those are two different questions and
 * conflating them is the commonest mistake in this calculation.
 */
export function ltvFor({ propertyType = 'HDB', existingLoans = 0, tenureYears = 25, age = 35 }) {
  const cap = TENURE_CAP[propertyType] ?? TENURE_CAP.PRIVATE;
  const extended = tenureYears > cap || age + tenureYears > TENURE_AGE_LIMIT;
  const tier = LTV.find(t => t.loansOutstanding === Math.min(existingLoans, 2)) || LTV[LTV.length - 1];
  const nth = tier.loansOutstanding === 0 ? 'first' : tier.loansOutstanding === 1 ? 'second' : 'third or later';
  return {
    rate: extended ? tier.extended : tier.max,
    cashMin: extended ? tier.cashMinExtended : tier.cashMin,
    extended,
    why: extended
      ? `${nth} housing loan, on an extended tenure — over ${cap} years or running past ${TENURE_AGE_LIMIT}`
      : `${nth} housing loan`,
  };
}

/**
 * One purchase, priced. Returns every intermediate figure, not just the total,
 * because the intermediate figures are what a reader argues with.
 */
export function plan({
  price,
  applicants = [],
  monthlyDebts = 0,
  propertyType = 'HDB',
  hdbLoan = false,
  existingLoans = 0,
  profile = 'SC',
  propertyCount = 1,
  cashAvailable = 0,
  cpfAvailable = 0,
  maxTenureYears = null,
}) {
  const afford = affordability({ applicants, monthlyDebts, propertyType, maxTenureYears });
  // hdbLoan no longer changes the ceiling. HDB's concessionary LTV was cut
  // 80% -> 75% on 20 Aug 2024 and now sits level with the banks; it still
  // changes the INTEREST rate, which affordability() already handles.
  const ltv = ltvFor({
    propertyType, existingLoans,
    tenureYears: afford.tenureYears,
    age: afford.incomeWeightedAvgAge,
  });

  const ltvCap = Math.floor(price * ltv.rate);
  const loan = Math.max(0, Math.min(afford.maxLoan, ltvCap));
  const limitedBy = afford.maxLoan < ltvCap ? afford.bindingConstraint : 'LTV';

  /*
   * An HDB concessionary loan has no cash floor — CPF OA can carry the whole
   * downpayment. Every bank loan has one, a bank loan on an HDB flat included,
   * and an EC is bank financing whichever way it is assessed.
   *
   * Until HDB_LOAN_CASH_MIN is reviewed this reports the fact that it is not,
   * because the direction of this correction is the dangerous one: it tells a
   * buyer they need LESS cash, and being wrong about that is a buyer short on
   * the day.
   */
  const hdbFinanced = propertyType === 'HDB' && hdbLoan;
  const cashMin = hdbFinanced ? HDB_LOAN_CASH_MIN : ltv.cashMin;

  const downpayment = Math.max(0, price - loan);
  const cashFloor = Math.ceil(price * cashMin);
  // CPF may cover the rest of the downpayment, but only as far as it goes.
  const cpfTowardsDown = Math.min(Math.max(0, downpayment - cashFloor), cpfAvailable);
  const cashTowardsDown = downpayment - cpfTowardsDown;

  // bsd() returns its bands and absd() returns the rate it used; both are kept,
  // because 'why is it that much' is the next question after 'how much'.
  const b = bsd(price), a = absd(price, profile, propertyCount);
  const mortgage = Math.min(MORTGAGE_DUTY.cap, Math.round(loan * MORTGAGE_DUTY.rate));
  const duties = { bsd: b.total, bsdBands: b.bands, absd: a.total, absdRate: a.rate, mortgage };
  // Stamp duty is payable in cash first and reimbursed from CPF afterwards for
  // most buyers. This plans for the cash, which is the version that bites.
  const dutyTotal = duties.bsd + duties.absd + duties.mortgage;

  const cashNeeded = cashTowardsDown + dutyTotal;
  const shortfall = Math.max(0, cashNeeded - cashAvailable);

  return {
    price,
    propertyType,
    afford,
    ltv: { ...ltv, cap: ltvCap, cashMin },
    loan,
    limitedBy,
    downpayment,
    cashFloor,
    cpfTowardsDown,
    cashTowardsDown,
    duties, dutyTotal,
    cashNeeded,
    cashAvailable,
    shortfall,
    works: shortfall === 0 && loan >= price - (cashAvailable + cpfAvailable),
    ratesUnverified: LTV_REVIEWED === null,
    // Named separately from ratesUnverified: this one is a single figure that
    // lowers the cash needed, and it should say so on its own rather than hide
    // inside a general warning about the LTV table.
    cashFloorUnverified: hdbFinanced && HDB_LOAN_CASH_MIN_REVIEWED === null,
    assumptions: {
      tdsrLimit: TDSR_LIMIT,
      msrLimit: afford.msrApplies ? MSR_LIMIT : null,
      stressRate: STRESS_TEST_RATE,
      ltvRate: ltv.rate,
      cashMin,
      tenureCap: afford.tenureCap,
    },
  };
}

/**
 * The other direction: given what someone has, the most they can pay.
 *
 * Solved by bisection rather than algebra because BSD is banded and ABSD steps,
 * so the cash requirement is piecewise and not worth inverting by hand. Forty
 * iterations lands inside a dollar on any Singapore price.
 */
export function maxPrice(opts) {
  const funds = (opts.cashAvailable || 0) + (opts.cpfAvailable || 0);
  let lo = 0, hi = 20_000_000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const p = plan({ ...opts, price: mid });
    const needed = p.downpayment + p.dutyTotal;
    const cashOk = p.cashTowardsDown + p.dutyTotal <= (opts.cashAvailable || 0);
    if (needed <= funds && cashOk) lo = mid; else hi = mid;
  }
  return Math.floor(lo / 1000) * 1000;
}
