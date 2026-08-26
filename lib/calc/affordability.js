import { TDSR_LIMIT, MSR_LIMIT, STRESS_TEST_RATE, VARIABLE_INCOME_HAIRCUT, HDB_CONCESSIONARY_RATE } from './constants.js';

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
 * MSR applies to HDB and EC-from-developer only. TDSR applies to everything.
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

  const isHdb = propertyType === 'HDB';
  const tenureCap = isHdb ? 25 : 30;
  const tenure = maxTenureYears ?? Math.max(5, Math.min(tenureCap, Math.round(65 - iwaa)));

  const tdsrCapacity = totalIncome * TDSR_LIMIT - monthlyDebts;
  const msrCapacity  = isHdb ? totalIncome * MSR_LIMIT : Infinity;
  const binding = Math.min(tdsrCapacity, msrCapacity);

  // Assessed at the stress-test floor, not the offered rate.
  const maxLoan = Math.max(0, maxLoanFromRepayment(binding, STRESS_TEST_RATE, tenure));

  return {
    totalIncomeCounted: Math.round(totalIncome),
    incomeWeightedAvgAge: Math.round(iwaa * 10) / 10,
    tenureYears: tenure,
    tdsrCapacity: Math.round(tdsrCapacity),
    msrCapacity: isHdb ? Math.round(msrCapacity) : null,
    bindingConstraint: isHdb && msrCapacity < tdsrCapacity ? 'MSR' : 'TDSR',
    maxMonthlyRepayment: Math.round(binding),
    maxLoan: Math.round(maxLoan),
    assessedAtRate: STRESS_TEST_RATE,
    actualRateIfHdbLoan: isHdb ? HDB_CONCESSIONARY_RATE : null,
    note: 'Assessed at the medium-term stress rate, which is how banks compute it. Your actual repayment will differ from this assessment figure.',
  };
}
