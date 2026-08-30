import { TDSR_LIMIT, MSR_LIMIT, STRESS_TEST_RATE, VARIABLE_INCOME_HAIRCUT, HDB_CONCESSIONARY_RATE, MSR_APPLIES, TENURE_CAP } from './constants.js';

export function monthlyRepayment(principal, annualRate, years) {
  const r = annualRate / 12, n = years * 12;
  if (r === 0) return principal / n;
  return principal * r / (1 - Math.pow(1 + r, -n));
}

export function maxLoanFromRepayment(repayment, annualRate, years) {
  const r = annualRate / 12, n = years * 12;
  if (r === 0) return repayment * n;
  return repayment * (1 - Math.pow(1 + r, -n)) / r;
}

/**
 * Borrowing capacity. Applicants: [{ fixedIncome, variableIncome, age }]
 *
 * TWO RULES, AND THEY DO NOT MOVE TOGETHER. TDSR at 55% applies to everything.
 * MSR at 30% applies to HDB flats and to ECs bought FROM THE DEVELOPER, and to
 * nothing else — a resale EC is private property for this purpose. Tenure runs
 * to 25 years on an HDB flat and 30 on everything else, an EC included on both
 * sides of its MOP.
 *
 * This used to read `propertyType === 'HDB'` for the first rule and derive the
 * second from the same boolean, so there were two categories where there are
 * four. An EC had no way to be expressed: sent as HDB it got MSR and a 25-year
 * tenure, understating the loan by about S$54,000 on a S$9,000 household; sent
 * as private it escaped MSR entirely. /tools offered a button reading "HDB or
 * EC" and took the first of those.
 *
 * Tenure uses the income-weighted average age (IWAA) for joint applicants.
 */
export function affordability({
  applicants = [],
  monthlyDebts = 0,
  propertyType = 'HDB',
  maxTenureYears = null,
}) {
  const eligible = applicants.map(a => ({
    ...a,
    counted: (a.fixedIncome || 0) + (a.variableIncome || 0) * (1 - VARIABLE_INCOME_HAIRCUT),
  }));
  const totalIncome = eligible.reduce((s, a) => s + a.counted, 0);
  const weightSum = eligible.reduce((s, a) => s + a.counted, 0) || 1;
  const iwaa = eligible.reduce((s, a) => s + (a.age || 35) * a.counted, 0) / weightSum;

  const msrApplies = MSR_APPLIES.includes(propertyType);
  const tenureCap = TENURE_CAP[propertyType] ?? TENURE_CAP.PRIVATE;
  const tenure = maxTenureYears ?? Math.max(5, Math.min(tenureCap, Math.round(65 - iwaa)));

  const tdsrCapacity = totalIncome * TDSR_LIMIT - monthlyDebts;
  const msrCapacity  = msrApplies ? totalIncome * MSR_LIMIT : Infinity;
  const binding = Math.min(tdsrCapacity, msrCapacity);

  // Assessed at the stress-test floor, not the offered rate.
  const maxLoan = Math.max(0, maxLoanFromRepayment(binding, STRESS_TEST_RATE, tenure));

  return {
    totalIncomeCounted: Math.round(totalIncome),
    incomeWeightedAvgAge: Math.round(iwaa * 10) / 10,
    tenureYears: tenure,
    tenureCap,
    tdsrCapacity: Math.round(tdsrCapacity),
    msrApplies,
    msrCapacity: msrApplies ? Math.round(msrCapacity) : null,
    bindingConstraint: msrApplies && msrCapacity < tdsrCapacity ? 'MSR' : 'TDSR',
    maxMonthlyRepayment: Math.round(binding),
    maxLoan: Math.round(maxLoan),
    assessedAtRate: STRESS_TEST_RATE,
    // Only an HDB flat can be financed by HDB. An EC is bank financing on both
    // sides of its MOP, whichever way it is assessed.
    actualRateIfHdbLoan: propertyType === 'HDB' ? HDB_CONCESSIONARY_RATE : null,
    note: 'Assessed at the medium-term stress rate, which is how banks compute it. Your actual repayment will differ from this assessment figure.',
  };
}
