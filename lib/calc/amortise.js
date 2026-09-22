import { monthlyRepayment } from './affordability.js';

/**
 * A repayment schedule.
 *
 * `monthlyRepayment()` has been in this library since the first week and
 * nothing ever rendered what it implies over time. The instalment is the small
 * question; the one worth showing is how little of the early years touches the
 * principal, and how much interest the whole thing costs.
 *
 * Note this is the OFFERED rate, not the stress rate. TDSR is assessed at the
 * MAS floor because a bank has to know you could still pay if rates rose; what
 * you actually pay each month is your own rate. Conflating the two is the most
 * common error in this calculation and every figure here says which it used.
 */
export function amortise({ principal, annualRate, years, extraMonthly = 0 }) {
  const P = Number(principal);
  const rate = Number(annualRate);
  const term = Number(years);
  const extra = Number(extraMonthly);
  if ([principal, annualRate, years, extraMonthly].some(v => v == null || String(v).trim() === '')
    || ![P, rate, term, extra].every(Number.isFinite)
    || P <= 0 || rate < 0 || term <= 0 || term > 100) return null;
  const r = rate / 12;
  const n = Math.round(term * 12);
  if (n <= 0) return null;

  const base = monthlyRepayment(P, rate, n / 12);
  const pay = base + extra;

  const months = [];
  let balance = P, interestPaid = 0, principalPaid = 0;

  for (let m = 1; m <= n * 2 && balance > 0.005; m++) {
    const interest = balance * r;
    let toPrincipal = pay - interest;
    // An instalment that does not cover the interest never amortises. Say so
    // rather than looping to the cap and returning a schedule that is fiction.
    if (toPrincipal <= 0) return { impossible: true, instalment: base, interestOnly: interest };
    if (toPrincipal > balance) toPrincipal = balance;

    balance -= toPrincipal;
    interestPaid += interest;
    principalPaid += toPrincipal;
    months.push({
      month: m,
      year: Math.ceil(m / 12),
      interest,
      principal: toPrincipal,
      balance: Math.round(balance),
    });
  }

  // A lower payment may reduce the balance but still leave debt at the loop
  // limit. Never describe that partial schedule as a repaid loan.
  if (balance > 0.005) return { impossible: true, instalment: base, interestOnly: P * r };

  // One row per year, which is the resolution anybody actually reads.
  const byYear = [];
  for (const row of months) {
    const y = byYear[row.year - 1] || (byYear[row.year - 1] = { year: row.year, interest: 0, principal: 0, balance: 0 });
    y.interest += row.interest;
    y.principal += row.principal;
    y.balance = row.balance;
  }

  return {
    instalment: Math.round(base),
    paying: Math.round(pay),
    months: months.length,
    years: Math.round((months.length / 12) * 10) / 10,
    totalInterest: Math.round(interestPaid),
    totalPaid: Math.round(interestPaid + principalPaid),
    /** Share of the actual first payment, including the optional extra. */
    firstMonthInterestShare: months.length ? months[0].interest / (months[0].interest + months[0].principal) : null,
    /** Which month the split crosses over, when more goes to principal than interest. */
    crossoverMonth: months.find(m => m.principal > m.interest)?.month ?? null,
    savedByExtra: null,
    byYear,
  };
}

/** What paying more each month is worth, in interest and in time. */
export function extraPaymentSaving({ principal, annualRate, years, extraMonthly }) {
  const plain = amortise({ principal, annualRate, years });
  const faster = amortise({ principal, annualRate, years, extraMonthly });
  if (!plain || !faster || plain.impossible || faster.impossible) return null;
  return {
    interestSaved: plain.totalInterest - faster.totalInterest,
    monthsSaved: plain.months - faster.months,
    plain, faster,
  };
}
