import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ledger, cpfAccrual, breakEven } from '../lib/calc/ledger.js';
import { cpfAccruedInterest } from '../lib/calc/proceeds.js';
import { CPF_OA_RATE, GST_RATE } from '../lib/calc/constants.js';

const base = {
  price: 1_600_000, purchaseDate: '2021-06-01', propertyType: 'PRIVATE',
  loan: 1_200_000, loanRate: 0.036, loanYears: 30,
  cashDown: 200_000, cpfDown: 200_000, cpfMonthly: 2_500, yearsHeld: 5,
};

/* ── CPF accrual ───────────────────────────────────────────────────────────── */

test('the lump-sum case agrees with the calculator that already existed', () => {
  // Two implementations of one rule that disagree is a failure this repo has
  // had before, so the new general form is pinned to the old special one.
  for (const [p, y] of [[200_000, 5], [80_000, 12], [1, 30]]) {
    const mine = cpfAccrual({ lump: p, months: y * 12 }).interest;
    assert.ok(Math.abs(mine - cpfAccruedInterest(p, y)) <= 1,
      `lump ${p} over ${y}y: ledger says ${mine}, proceeds says ${cpfAccruedInterest(p, y)}`);
  }
});

test('a dollar paid in last month has not accrued a year of interest', () => {
  // The whole reason the annuity form exists. Compounding the monthly stream
  // as though it had all been there from day one overstates it by a third.
  const stream = cpfAccrual({ monthly: 1_000, months: 120 });
  assert.equal(stream.principal, 120_000);
  const wrong = cpfAccruedInterest(120_000, 10);
  assert.ok(stream.interest < wrong * 0.7,
    `stream interest ${stream.interest} is too close to the lump answer ${wrong}`);
  assert.ok(stream.interest > 0);
});

test('no time means no interest', () => {
  assert.equal(cpfAccrual({ lump: 500_000, monthly: 3_000, months: 0 }).interest, 0);
});

/* ── break-even is division ────────────────────────────────────────────────── */

test('break-even divides rather than adds', () => {
  // Adding the selling costs to the target is the obvious way to do it and it
  // is short by the commission charged on the commission.
  const args = { target: 100_000, loan: 0, cpfRefund: 0, legal: 0, agentRate: 0.0218, ssdRate: 0 };
  const p = breakEven(args);
  const naive = 100_000 * (1 + 0.0218);
  assert.ok(p > naive, `${p} should exceed the naive ${naive}`);
  // And it must actually clear: price minus its own commission leaves target.
  assert.ok(Math.abs(p - p * 0.0218 - 100_000) < 0.01);
});

test('costs that would eat the whole price return nothing, not Infinity', () => {
  assert.equal(breakEven({ target: 1, loan: 0, cpfRefund: 0, legal: 0, agentRate: 0.9, ssdRate: 0.2 }), null);
});

/* ── the ledger ────────────────────────────────────────────────────────────── */

test('there is no benchmark that grows cash at the CPF rate', () => {
  // Cash held outside CPF does not earn the Ordinary Account rate and cannot
  // be made to — you cannot put savings into your OA to collect 2.5%. The
  // ledger used to grow the reader's cash at it and call the result the price
  // a sale had to clear "to keep pace", which measured them against something
  // they could not have had. Worst of all, a purchase with NO CPF still got
  // the figure.
  const noCpf = ledger({ ...base, cashDown: 500_000, cpfDown: 0, cpfMonthly: 0 });
  assert.equal(noCpf.cpfReturns, null, 'no CPF used, nothing to say about CPF');
  assert.deepEqual(Object.keys(noCpf.breakEven), ['returnOfCash'],
    'a cash-versus-OA baseline has come back');
  assert.ok(noCpf.caveats.some(c => /cannot be made to/i.test(c)),
    'the page must say why no investment comparison is offered');
});

test('what CPF gets back is the refund, and the interest inside it is named', () => {
  // The OA rate IS relevant to CPF that was used, and it is already fully
  // accounted for: money out of an OA stops compounding, and the refund puts
  // back exactly what it would have earned. So there is no shortfall to
  // report — only the fact that all of it goes to the ACCOUNT and none of it
  // into the seller's hands.
  const r = ledger({ ...base, cashDown: 200_000, cpfDown: 300_000, cpfMonthly: 2_000 });
  assert.equal(r.cpfReturns.principal, r.cpf.principal);
  assert.equal(r.cpfReturns.interest, r.cpf.interest);
  assert.equal(r.cpfReturns.total, r.cpf.principal + r.cpf.interest);
  assert.ok(r.cpfReturns.interestShare > 0 && r.cpfReturns.interestShare < 1);
  assert.equal(r.cpfReturns.rate, CPF_OA_RATE);
});

test('the longer it is held, the more of the refund is interest', () => {
  // The part nobody expects. It is a share of a refund, not a loss, and the
  // page has to be able to say which.
  const five = ledger({ ...base, cpfDown: 300_000, cpfMonthly: 2_000, yearsHeld: 5 });
  const twenty = ledger({ ...base, cpfDown: 300_000, cpfMonthly: 2_000, yearsHeld: 20 });
  assert.ok(twenty.cpfReturns.interestShare > five.cpfReturns.interestShare);
});

test('SSD follows the purchase date, and vanishes when the schedule runs out', () => {
  // Bought 2021 — legacy three-year schedule, so year 3 still bites and year 5
  // does not. Getting this from the SALE date is the error this library was
  // written to avoid.
  assert.equal(ledger({ ...base, yearsHeld: 3 }).exit.ssd.rate, 0.04);
  assert.equal(ledger({ ...base, yearsHeld: 5 }).exit.ssd.rate, 0);
  // Bought after 4 Jul 2025 — four-year schedule, so year 4 still bites.
  const later = ledger({ ...base, purchaseDate: '2025-08-01', yearsHeld: 4 });
  assert.ok(later.exit.ssd.rate > 0, 'the 2025 regime runs to four years');
});

test('an HDB flat is governed by MOP, not by SSD, and says which', () => {
  const r = ledger({ ...base, propertyType: 'HDB', yearsHeld: 2 });
  assert.equal(r.exit.ssd.rate, 0);
  assert.ok(r.caveats.some(c => /minimum occupation period/i.test(c)));
});

test('an EC from the developer is treated as MOP, a resale EC as SSD', () => {
  assert.equal(ledger({ ...base, propertyType: 'EC_DEVELOPER', yearsHeld: 2 }).exit.ssd.rate, 0);
  assert.ok(ledger({ ...base, propertyType: 'EC_RESALE', yearsHeld: 2 }).exit.ssd.rate > 0);
});

test('agent commission carries GST', () => {
  const r = ledger(base);
  assert.ok(Math.abs(r.exit.agentRate - 0.02 * (1 + GST_RATE)) < 1e-12);
});

test('holding past the end of the tenure leaves no loan and stops the interest', () => {
  const short = ledger({ ...base, loanYears: 10, yearsHeld: 10 });
  const longer = ledger({ ...base, loanYears: 10, yearsHeld: 20 });
  assert.equal(longer.holding.outstanding, 0);
  assert.equal(longer.holding.interestPaid, short.holding.interestPaid);
});

test('rent is named as missing on every result', () => {
  // The largest number not in the ledger. Silent omission reads as
  // completeness, which is the one thing this must never do.
  const r = ledger(base);
  assert.ok(r.omissions.some(o => /^Rent\./.test(o)), 'rent must be the first omission named');
  assert.ok(r.omissions.some(o => /not be worth|what it is worth/i.test(o)));
});

test('no figure comes back as NaN when the inputs are empty', () => {
  // Degrade, never break: a page renders before anyone has typed anything.
  const r = ledger({ price: 0, purchaseDate: '2026-01-01', yearsHeld: 0 });
  const walk = v => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `NaN or Infinity in the result: ${v}`);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk({ ...r, exit: { ...r.exit, ssd: { rate: r.exit.ssd.rate, total: r.exit.ssd.total } } });
});

test('an outright purchase has no instalment and no monthly CPF', () => {
  // The down payments covering the whole price leaves no loan. Nothing may
  // keep flowing out of CPF each month against a mortgage that is not there.
  // loan is an input to the library; the page derives it as price less the
  // down payments, and this is that case: nothing left to borrow.
  const r = ledger({ ...base, price: 400_000, loan: 0, cashDown: 200_000, cpfDown: 200_000, cpfMonthly: 2_500 });
  assert.equal(r.holding.instalment, 0);
  assert.equal(r.holding.interestPaid, 0);
  assert.equal(r.holding.outstanding, 0);
  assert.equal(r.cash.perMonth, 0);
  // CPF still has the down payment accruing against it — that part is real.
  assert.equal(r.cpf.principal, 200_000);
  assert.ok(r.cpf.interest > 0);
});

/* ── money stops flowing when the loan does ────────────────────────────────── */

const tenYear = { ...base, purchaseDate: '2000-06-01', loan: 900_000, loanYears: 10,
  cashDown: 300_000, cpfDown: 400_000, cpfMonthly: 3_000 };

test('nothing goes in after the loan is repaid, but interest keeps accruing', () => {
  // A ten-year loan held for twenty-five went on drawing CPF and cash for
  // fifteen years after the mortgage ended: S$2,135,200 of "cash in" on a
  // S$1.6m purchase. The withdrawal stops; the interest against it does not,
  // because the money stays out of the account until the day of sale.
  const at10 = ledger({ ...tenYear, yearsHeld: 10 });
  const at25 = ledger({ ...tenYear, yearsHeld: 25 });
  assert.equal(at25.cpf.principal, at10.cpf.principal, 'CPF principal must freeze at repayment');
  assert.equal(at25.cash.total, at10.cash.total, 'cash in must freeze at repayment');
  assert.equal(at25.holding.interestPaid, at10.holding.interestPaid);
  assert.ok(at25.cpf.interest > at10.cpf.interest * 1.5,
    'accrued interest must keep running to the sale');
});

test('the year the loan ran out is reported, and only when it did', () => {
  assert.equal(ledger({ ...tenYear, yearsHeld: 25 }).holding.repaidInYear, 10);
  // Sold inside the tenure — nothing ran out, so nothing to report.
  assert.equal(ledger({ ...tenYear, yearsHeld: 5 }).holding.repaidInYear, null);
});

test('CPF cannot pay more of an instalment than the instalment is, and says so', () => {
  // The excess never enters the property — it stays in the Ordinary Account
  // earning the same rate. Applying the clamp silently would leave a control
  // describing a number the page did not use.
  const r = ledger({ ...base, cpfMonthly: 9_000 });
  assert.equal(r.cpfEntry.wanted, 9_000);
  assert.equal(r.cpfEntry.used, r.holding.instalment);
  assert.equal(r.cpfEntry.clamped, true);
  assert.equal(r.cash.perMonth, 0);
  // And it is not reported when it did not happen.
  assert.equal(ledger({ ...base, cpfMonthly: 1_000 }).cpfEntry.clamped, false);
});

test('a stream that never stops is unchanged by the two-phase accrual', () => {
  // Held entirely within the tenure, payingMonths === months, so the new form
  // must give exactly what the single-phase one did.
  const a = cpfAccrual({ lump: 50_000, monthly: 1_200, months: 120 });
  const b = cpfAccrual({ lump: 50_000, monthly: 1_200, months: 120, payingMonths: 120 });
  assert.equal(a.interest, b.interest);
});

/* ── against renting ───────────────────────────────────────────────────────── */

test('rent is compared against friction, not against everything paid', async () => {
  const { rentInstead } = await import('../lib/calc/ledger.js');
  // The loan principal and the CPF refund are not gone — they are yours in
  // another form. Putting them on the same side as rent would make ownership
  // look far worse than it is, which is the easiest way to get this wrong.
  const r = ledger({ ...base, monthlyRent: 4000 });
  assert.equal(r.renting.paid, 4000 * 60);
  assert.equal(r.renting.friction, r.friction);
  assert.equal(r.renting.difference, r.friction - r.renting.paid);
  assert.ok(r.renting.friction < r.cash.total,
    'friction must exclude the instalments that repaid principal');

  assert.equal(rentInstead({ monthlyRent: 0, yearsHeld: 5, friction: 1 }), null);
  assert.equal(rentInstead({ monthlyRent: 3000, yearsHeld: 0, friction: 1 }), null);
});

test('the ledger says rent is missing until it knows which home', () => {
  // The omission was unconditional and stayed on the page after the figure
  // arrived, which would have been a page contradicting itself.
  const without = ledger(base);
  assert.equal(without.renting, null);
  assert.match(without.omissions[0], /^Rent\./);
  assert.match(without.omissions[0], /Name a project/);

  const with_ = ledger({ ...base, monthlyRent: 4000 });
  assert.doesNotMatch(with_.omissions[0], /^Rent\./);
  assert.match(with_.omissions[0], /Future rent movements/);
  assert.match(with_.omissions[0], /held flat this is a floor/);
});

test('holding rent flat is stated, because it is the assumption doing the work', () => {
  const r = ledger({ ...base, monthlyRent: 4000 });
  assert.equal(r.renting.heldFlat, true);
  assert.ok(r.omissions.some(o => /rents would have to FALL/i.test(o)));
});

test('the headline does not mention a CPF refund when there was no CPF', () => {
  // Small, and the same class of error as the benchmark itself: text that
  // describes a component of the calculation which is not in this reader's
  // calculation at all.
  const src = readFileSync(new URL('../components/Ledger.jsx', import.meta.url), 'utf8');
  const line = src.slice(src.indexOf('to return every dollar of cash'), src.indexOf('to return every dollar of cash') + 320);
  assert.match(line, /cpfBack \?/, 'the CPF clause must be conditional on CPF having been used');
});
