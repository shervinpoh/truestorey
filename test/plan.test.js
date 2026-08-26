import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, maxPrice, ltvFor } from '../lib/calc/plan.js';
import { bsd, absd } from '../lib/calc/stampDuty.js';

/* The planner is a chain, so the risk is not that one link is wrong — each
 * link already has its own tests — it is that the chain silently drops a
 * constraint. These tests check the JOINS. */

const couple = {
  applicants: [{ fixedIncome: 6000, age: 34 }, { fixedIncome: 5000, age: 32 }],
  monthlyDebts: 800, profile: 'SC', propertyCount: 1,
  cashAvailable: 80_000, cpfAvailable: 120_000,
};

test('the loan is the smaller of what the bank assesses and what the LTV allows', () => {
  const p = plan({ ...couple, price: 650_000, propertyType: 'HDB', hdbLoan: true });
  assert.equal(p.loan, Math.min(p.afford.maxLoan, p.ltv.cap));
  assert.ok(p.limitedBy === 'LTV' || p.limitedBy === 'TDSR' || p.limitedBy === 'MSR');
});

test('the cash floor is never covered by CPF', () => {
  // Someone with a huge CPF balance and no cash still has to find the 5%.
  const p = plan({ ...couple, price: 650_000, propertyType: 'HDB', hdbLoan: true, cpfAvailable: 5_000_000 });
  assert.ok(p.cashTowardsDown >= p.cashFloor,
    `cash toward downpayment ${p.cashTowardsDown} fell below the floor ${p.cashFloor}`);
});

test('stamp duty matches the standalone calculators exactly', () => {
  const price = 1_600_000;
  const p = plan({ ...couple, price, propertyType: 'PRIVATE', propertyCount: 2 });
  assert.equal(p.duties.bsd, bsd(price).total);
  assert.equal(p.duties.absd, absd(price, 'SC', 2).total);
  // Mortgage duty is in the chain on purpose — 0.4% of the loan capped at $500,
  // the line the build pack calls "the one everybody forgets" and which no
  // competitor calculator includes.
  assert.equal(p.dutyTotal, p.duties.bsd + p.duties.absd + p.duties.mortgage);
  assert.ok(p.duties.mortgage > 0 && p.duties.mortgage <= 500);
});

test('the LTV tier follows loans running, not properties owned', () => {
  // Someone who owns a second flat outright still borrows at the first-loan
  // ceiling. Conflating the two is the commonest error in this calculation.
  const outright = plan({ ...couple, price: 1_600_000, propertyType: 'PRIVATE', propertyCount: 2, existingLoans: 0 });
  const mortgaged = plan({ ...couple, price: 1_600_000, propertyType: 'PRIVATE', propertyCount: 2, existingLoans: 1 });
  assert.ok(outright.ltv.rate > mortgaged.ltv.rate);
  assert.equal(outright.duties.absd, mortgaged.duties.absd, 'ABSD follows properties owned, and should not move');
});

test('a third loan is tighter than a second', () => {
  const two = ltvFor({ propertyType: 'PRIVATE', existingLoans: 1, tenureYears: 25, age: 35 });
  const three = ltvFor({ propertyType: 'PRIVATE', existingLoans: 2, tenureYears: 25, age: 35 });
  assert.ok(three.rate < two.rate, 'a third housing loan should not borrow at the second-loan ceiling');
});

test('a second property drops the LTV and raises the cash floor', () => {
  const one = ltvFor({ propertyType: 'PRIVATE', existingLoans: 0, tenureYears: 25, age: 35 });
  const two = ltvFor({ propertyType: 'PRIVATE', existingLoans: 1, tenureYears: 25, age: 35 });
  assert.ok(two.rate < one.rate, 'a second loan should not borrow at the first-loan ceiling');
  assert.ok(two.cashMin > one.cashMin, 'the cash floor rises with a second loan');
  assert.equal(two.cashMin, 0.25, 'a second loan carries a 25% cash floor per the verified table');
});

test('a tenure running past 65 is treated as the stretched case', () => {
  const normal = ltvFor({ propertyType: 'PRIVATE', existingLoans: 0, tenureYears: 25, age: 35 });
  const late = ltvFor({ propertyType: 'PRIVATE', existingLoans: 0, tenureYears: 25, age: 48 });
  assert.ok(late.rate < normal.rate);
  assert.match(late.why, /65/);
});

test('maxPrice is the largest price that still clears', () => {
  const cap = maxPrice({ ...couple, propertyType: 'HDB', hdbLoan: true });
  assert.ok(cap > 0);
  assert.equal(plan({ ...couple, price: cap, propertyType: 'HDB', hdbLoan: true }).shortfall, 0);
  const over = plan({ ...couple, price: cap + 50_000, propertyType: 'HDB', hdbLoan: true });
  assert.ok(over.shortfall > 0, 'a price above the cap should not still clear');
});

test('the planner never returns a valuation', () => {
  const p = plan({ ...couple, price: 650_000, propertyType: 'HDB', hdbLoan: true });
  // Rule 2: price is an input. Nothing in the output may look like an estimate
  // of what a home is worth.
  for (const k of ['value', 'estimate', 'worth', 'valuation']) {
    assert.ok(!(k in p), `plan() returned a "${k}" field`);
  }
});

test('the unverified-LTV flag is carried into the result', () => {
  // It must stay true until someone checks the ceilings against MAS and HDB.
  const p = plan({ ...couple, price: 650_000, propertyType: 'HDB', hdbLoan: true });
  assert.equal(typeof p.ratesUnverified, 'boolean');
});

/* ── when can I sell ─────────────────────────────────────────────────────── */
import { sellTimeline } from '../lib/calc/timeline.js';

test('private property can always be sold now — the answer is a cost, not a date', () => {
  const r = sellTimeline({
    propertyType: 'PRIVATE', purchaseDate: new Date('2024-03-15'),
    price: 1_800_000, today: new Date('2026-08-24'),
  });
  assert.equal(r.canSellNow, true, 'a condo has no minimum holding period');
  assert.ok(r.schedule.length > 0, 'the SSD schedule should be priced out');
  assert.equal(r.currentCost, Math.round(1_800_000 * r.currentRate));
});

test('an owner past the SSD window still gets an answer', () => {
  // The bug this replaces: ssd() returns freeAfter: null once the window has
  // closed, the old timeline pushed no event, and the panel rendered empty for
  // the one owner with nothing to worry about.
  const r = sellTimeline({
    propertyType: 'PRIVATE', purchaseDate: new Date('2018-01-01'),
    price: 1_800_000, today: new Date('2026-08-24'),
  });
  assert.equal(r.free, true);
  assert.equal(r.currentRate, 0);
  assert.equal(r.events.length, 1, 'an owner past the window still needs a panel');
  assert.match(r.events[0].meaning, /no SSD is payable/);
});

test('the SSD schedule is chosen by the purchase date, not the sale date', () => {
  const before = sellTimeline({ propertyType: 'PRIVATE', purchaseDate: new Date('2025-07-01'), price: 1_000_000, today: new Date('2026-08-24') });
  const after  = sellTimeline({ propertyType: 'PRIVATE', purchaseDate: new Date('2025-07-10'), price: 1_000_000, today: new Date('2026-08-24') });
  assert.equal(before.regime, 'legacy');
  assert.equal(after.regime, '2025');
  assert.equal(before.schedule.length, 3, 'the pre-July-2025 schedule runs three years');
  assert.equal(after.schedule.length, 4, 'the post-July-2025 schedule runs four');
  assert.ok(after.currentRate > before.currentRate, 'nine days apart, materially different bills');
});

test('HDB still answers with a date', () => {
  const r = sellTimeline({ propertyType: 'HDB', purchaseDate: new Date('2022-03-15'), keyCollectionDate: new Date('2022-03-15'), today: new Date('2026-08-24') });
  assert.equal(r.kind, 'HDB');
  assert.equal(r.canSellNow, false);
  assert.ok(r.nextEvent, 'an owner inside MOP has a date ahead of them');
});

/* ── the repayment schedule ──────────────────────────────────────────────── */
import { amortise, extraPaymentSaving } from '../lib/calc/amortise.js';

test('a schedule pays the loan off exactly, and no further', () => {
  const a = amortise({ principal: 487_500, annualRate: 0.026, years: 25 });
  assert.equal(a.months, 300);
  assert.equal(a.byYear.at(-1).balance, 0, 'the balance did not reach zero at the end of the term');
  // Total paid is principal plus interest, to the rounding.
  assert.ok(Math.abs(a.totalPaid - (487_500 + a.totalInterest)) <= a.months,
    `${a.totalPaid} is not principal plus interest`);
});

test('the early years are mostly interest', () => {
  const a = amortise({ principal: 1_000_000, annualRate: 0.04, years: 30 });
  assert.ok(a.firstMonthInterestShare > 0.6, 'a 30-year loan should start heavily weighted to interest');
  assert.ok(a.byYear[0].interest > a.byYear[0].principal);
  assert.ok(a.byYear.at(-1).principal > a.byYear.at(-1).interest, 'it should invert by the end');
});

test('paying extra shortens the loan and saves interest', () => {
  const s = extraPaymentSaving({ principal: 487_500, annualRate: 0.026, years: 25, extraMonthly: 300 });
  assert.ok(s.interestSaved > 0);
  assert.ok(s.monthsSaved > 0);
  assert.ok(s.faster.months < s.plain.months);
  assert.ok(s.faster.totalInterest < s.plain.totalInterest);
});

test('a payment below the interest is reported, not looped over', () => {
  // The failure mode this guards: a schedule that never amortises, iterated to
  // a cap and returned as though it were real.
  const a = amortise({ principal: 1_000_000, annualRate: 0.05, years: 30, extraMonthly: -5000 });
  assert.equal(a.impossible, true);
  assert.ok(a.interestOnly > 0);
});

test('nonsense inputs return nothing rather than a schedule', () => {
  assert.equal(amortise({ principal: 0, annualRate: 0.03, years: 25 }), null);
  assert.equal(amortise({ principal: 500_000, annualRate: 0.03, years: 0 }), null);
});

test('a zero-rate loan divides evenly and costs no interest', () => {
  const a = amortise({ principal: 240_000, annualRate: 0, years: 20 });
  assert.equal(a.instalment, 1000);
  assert.equal(a.totalInterest, 0);
});
