/**
 * The /plan answer as an email: what you can borrow, what you need on the day,
 * and which rule is the one stopping you.
 *
 * Same two rules as lib/report/cost.js, for the same reasons. The figures are
 * recomputed on the server from lib/calc/plan.js — a posted figure is a figure
 * anyone can type, and this goes out under a CEA registration number. And
 * `planInputs` is the ONE mapping from the page's fields to the calculator's
 * arguments, so components/Planner.jsx and this email cannot drift apart.
 *
 * WHAT IT MAY SAY. An assessment against published rules — TDSR, MSR, the LTV
 * ceiling, both stamp duties — on figures the reader supplied. Not a valuation
 * (rule 2), not advice, and every rate with its source and effective date
 * (rule 6). "The most this supports" is a budget derived from their own income
 * and cash, not an opinion about any property.
 */
import { plan, maxPrice } from '../calc/plan.js';
import { SOURCES } from '../calc/constants.js';
import { S, bullets, esc, figure, footer, head, money, pct, table } from './shell.js';

const TYPE_NAMES = {
  HDB: 'HDB flat', EC_DEVELOPER: 'EC from the developer', EC_RESALE: 'EC resale', PRIVATE: 'Private',
};
const PROFILE_NAMES = { SC: 'Singapore Citizen', SPR: 'Permanent Resident', FOREIGNER: 'Foreigner' };

/** One mapping from the page's fields to lib/calc/plan.js's arguments. */
export function planInputs(v) {
  return {
    applicants: [
      { fixedIncome: Number(v.a1) || 0, age: Number(v.g1) || 35 },
      /* A second applicant exists only when an income was entered. A zero here
         would be assessed as a person earning nothing, which lowers the
         household's own average age and quietly lengthens the tenure. */
      ...(Number(v.a2) > 0 ? [{ fixedIncome: Number(v.a2), age: Number(v.g2) || 35 }] : []),
    ],
    monthlyDebts: Number(v.debts) || 0,
    propertyType: v.type,
    hdbLoan: v.type === 'HDB' && Boolean(v.hdbLoan),
    existingLoans: Number(v.loans) || 0,
    profile: v.profile,
    propertyCount: Number(v.owned) || 1,
    cashAvailable: Number(v.cash) || 0,
    cpfAvailable: Number(v.cpf) || 0,
  };
}

export function planResult(v) {
  const input = planInputs(v);
  return { input, r: plan({ ...input, price: Number(v.price) || 0 }), cap: maxPrice(input) };
}

export function renderPlanReport({ values, link, agent, siteUrl, now = new Date() }) {
  const { input, r, cap } = planResult(values);
  const dated = now.toISOString().slice(0, 10);
  const subject = `What you can afford — ${money(values.price)} ${TYPE_NAMES[values.type] || values.type}`;
  const standfirst = 'An assessment against the published rules, on the figures you entered. It is not a loan offer and not a valuation.';
  const h = head({ kind: 'what you can afford', subject, siteUrl, path: '/plan', dated, standfirst });

  const shortfall = r.shortfall > 0;
  const cashNote = shortfall
    ? `That is ${money(r.shortfall)} more than the ${money(r.cashAvailable)} you have. CPF cannot close it — the shortfall is in the part that must be cash.`
    : `Within the ${money(r.cashAvailable)} you have, with ${money(r.cashAvailable - r.cashNeeded)} left over.`;

  const asked = [
    ['Price', money(values.price)],
    ['Buying', `${TYPE_NAMES[values.type] || values.type}${values.type === 'HDB' ? (values.hdbLoan ? ' · HDB concessionary loan' : ' · bank loan') : ''}`],
    ['Income, first applicant', `${money(values.a1)} a month, age ${values.g1}`],
    ...(Number(values.a2) > 0 ? [['Income, second applicant', `${money(values.a2)} a month, age ${values.g2}`]] : []),
    ['Other monthly repayments', money(values.debts)],
    ['Housing loans already running', Number(values.loans) ? 'One or more' : 'None'],
    ['Cash available', money(values.cash)],
    ['CPF available', money(values.cpf)],
    ['Buyer', `${PROFILE_NAMES[values.profile] || values.profile} · ${Number(values.owned) === 1 ? 'only property' : Number(values.owned) === 2 ? 'second property' : 'third or later'}`],
  ];

  const assessment = [
    ['The loan', money(r.loan)],
    ['Limited by', r.limitedBy],
    ['Downpayment', money(r.downpayment)],
    ['Of which must be cash', money(r.cashTowardsDown)],
    ['CPF towards the downpayment', money(r.cpfTowardsDown)],
    ['Buyer’s Stamp Duty', money(r.duties.bsd)],
    ...(r.duties.absd > 0 ? [[`Additional Buyer’s Stamp Duty, ${pct(r.duties.absdRate * 100, 0)}`, money(r.duties.absd)]] : []),
    ['Cash needed on completion', money(r.cashNeeded)],
  ];

  const rules = [
    ['Assessed at the stress rate', pct(r.assumptions.stressRate * 100, 1)],
    ['TDSR limit', pct(r.assumptions.tdsrLimit * 100, 0)],
    ...(r.assumptions.msrLimit ? [['MSR limit — HDB and EC from the developer', pct(r.assumptions.msrLimit * 100, 0)]] : []),
    ['Loan-to-value ceiling applied', pct(r.assumptions.ltvRate * 100, 0)],
    ['Tenure assessed', `${r.afford.tenureYears} years, capped at ${r.afford.tenureCap}`],
    ['Income counted', `${money(r.afford.totalIncomeCounted)} a month · age used ${r.afford.incomeWeightedAvgAge}`],
    ['Maximum monthly repayment', money(r.afford.maxMonthlyRepayment)],
  ];

  const notes = [
    `The binding rule here is ${r.afford.bindingConstraint}. It is the one that moves first when income, debts or tenure change.`,
    'Assessed at the medium-term stress rate, which is how a bank computes it. Your actual repayment at your quoted rate will be lower than the figure the assessment uses.',
    'Stamp duty is cash on completion and cannot come from the loan. Buyer’s Stamp Duty can often be reimbursed from CPF afterwards; ABSD cannot.',
    'A bank’s own assessment will differ: it counts variable income at a haircut, sees your credit file, and is the only assessment that binds.',
    ...(r.ratesUnverified ? ['The loan-to-value ceilings have not been re-checked since they were last reviewed. Treat the ceiling and the cash floor as provisional.'] : []),
    ...(r.cashFloorUnverified ? ['The cash floor for an HDB concessionary loan has not been re-checked here. Confirm it with HDB before relying on it.'] : []),
  ];

  const f = footer({ link, sources: [SOURCES.bsd, SOURCES.absd], agent });

  const text = [
    h.text,
    `CASH YOU NEED ON THE DAY: ${money(r.cashNeeded)}`,
    cashNote,
    '',
    `THE MOST THIS SUPPORTS: ${money(cap)}`,
    'The highest price your income, cash and CPF still clear — stamp duty included.',
    '',
    'WHAT YOU ENTERED',
    ...asked.map(([k, v2]) => `  ${k}: ${v2}`),
    '',
    `AT ${money(values.price)}`,
    ...assessment.map(([k, v2]) => `  ${k}  ${v2}`),
    '',
    'THE RULES APPLIED',
    ...rules.map(([k, v2]) => `  ${k}  ${v2}`),
    '',
    'WORTH KNOWING',
    ...notes.map(n => `  · ${n}`),
    '',
    f.text,
  ].join('\n');

  const html = `<div style="${S.wrap}">
${h.html}
${figure('Cash you need on the day', money(r.cashNeeded), cashNote, shortfall ? '#A4462F' : '#164F52')}
${figure('The most this supports', money(cap), 'The highest price your income, cash and CPF still clear — stamp duty included.', '#58BCC3')}
<hr style="${S.rule}">
<p style="${S.lab};margin:0">What you entered</p>
${table(asked)}
<hr style="${S.rule}">
<p style="${S.lab};margin:0">At ${esc(money(values.price))}</p>
${table(assessment)}
<hr style="${S.rule}">
<p style="${S.lab};margin:0">The rules applied</p>
${table(rules)}
<hr style="${S.rule}">
<p style="${S.lab};margin:0 0 8px">Worth knowing</p>
${bullets(notes)}
${f.html}
</div>`;

  return { subject, text, html };
}
