import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { qNum, qLabel, compact, windowsOf, distribution, countAtOrBelow } from '../lib/calc/windows.js';
import { ledger, breakEven, saleOutcome } from '../lib/calc/ledger.js';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const has = f => existsSync(new URL(`../data/${f}`, import.meta.url));

/* ── quarter arithmetic ────────────────────────────────────────────────────── */

test('a quarter label survives the round trip', () => {
  for (const q of ['1975-Q1', '1990-Q4', '2009-Q1', '2026-Q2']) {
    assert.equal(qLabel(qNum(q)), q);
  }
  assert.equal(qNum('2009Q1'), null);
  assert.equal(qNum('not a quarter'), null);
});

test('consecutive quarters are consecutive numbers across a year boundary', () => {
  assert.equal(qNum('2000-Q1') - qNum('1999-Q4'), 1);
});

/* ── compact ───────────────────────────────────────────────────────────────── */

test('a series with a hole in it is refused rather than silently closed up', () => {
  // This is the whole licence for shipping values without their labels. If a
  // source ever skips a quarter, every label after the hole would be wrong by
  // one and every window would silently span a longer period than it claims.
  const ok = compact([{ quarter: '2000-Q1', index: 1 }, { quarter: '2000-Q2', index: 2 },
                      { quarter: '2000-Q3', index: 3 }]);
  assert.deepEqual(ok, { from: '2000-Q1', values: [1, 2, 3] });

  const gap = compact([{ quarter: '2000-Q1', index: 1 }, { quarter: '2000-Q3', index: 3 }]);
  assert.equal(gap, null);
});

/* ── the windows themselves ────────────────────────────────────────────────── */

const flat = { from: '2000-Q1', values: Array.from({ length: 41 }, (_, i) => 100 + i) };

test('there is one window per possible start, and the last one ends on the last point', () => {
  const w = windowsOf(flat, 4);
  assert.equal(w.length, flat.values.length - 4);
  assert.equal(w[0].from, '2000-Q1');
  assert.equal(w.at(-1).to, qLabel(qNum('2000-Q1') + flat.values.length - 1));
});

test('a window longer than the series produces nothing, not a shorter window', () => {
  assert.deepEqual(windowsOf(flat, 100), []);
  assert.deepEqual(windowsOf(flat, 0), []);
});

test('a holding period the series cannot cover scores nothing and says so', () => {
  // "A check that cannot run scores nothing" — it must return null, not a
  // shape full of zeroes that reads as no risk.
  assert.equal(distribution({ from: '2020-Q1', values: [100, 101, 102] }, 5), null);
});

test('the middle window is a real dated window, not an interpolation', () => {
  const d = distribution(flat, 3);
  const all = windowsOf(flat, 12);
  assert.ok(all.some(w => w.from === d.middle.from && w.to === d.middle.to
    && Math.abs(w.change - d.middle.change) < 1e-12),
    'middle must be one of the windows that actually ran');
  assert.ok(d.worst.change <= d.middle.change && d.middle.change <= d.best.change);
});

test('the count at or below a change agrees with counting them one by one', () => {
  const d = distribution(flat, 5);
  for (const x of [-1, -0.05, 0, 0.03, 0.2, 5]) {
    const brute = d.sorted.filter(w => w.change <= x).length;
    assert.equal(countAtOrBelow(d, x).count, brute, `at or below ${x}`);
  }
  assert.equal(countAtOrBelow(d, NaN), null);
  assert.equal(countAtOrBelow(null, 0), null);
});

/* ── the published series ──────────────────────────────────────────────────── */

test('both published indices are contiguous quarterly runs', () => {
  // If either ever gains a gap, compact() returns null and /cost says it
  // cannot measure — but the ingest should be fixed, so this fails loudly.
  const hdb = compact(read('hdb-index.json').points);
  assert.ok(hdb, 'hdb-index.json has a gap in its quarters');
  assert.ok(hdb.values.length > 100);

  if (!has('ppi.json')) return;                       // ingest not run: not a failure here
  const ppi = read('ppi.json');
  for (const key of ['all', 'landed', 'nonLanded']) {
    const c = compact(ppi.series[key].points);
    assert.ok(c, `ppi.json series ${key} has a gap in its quarters`);
    assert.ok(c.values.length > 150, `ppi.json series ${key} is unexpectedly short`);
  }
  assert.equal(ppi.base, read('hdb-index.json').base,
    'the two indices are shown side by side and must share a base quarter');
});

test('the record contains holding periods that ended lower than they started', () => {
  // The entire point of the feature. If this ever passes trivially — because a
  // series was replaced by one that only rises — the section is decoration.
  const hdb = compact(read('hdb-index.json').points);
  const five = distribution(hdb, 5);
  assert.ok(five.negative > 0, 'no losing five-year window in HDB’s index?');
  assert.ok(five.worst.change < 0);
  assert.match(five.worst.from, /^\d{4}-Q[1-4]$/);
});

/* ── the money ─────────────────────────────────────────────────────────────── */

const base = {
  price: 1_600_000, purchaseDate: '2021-06-01', propertyType: 'PRIVATE',
  loan: 1_200_000, loanRate: 0.036, loanYears: 30,
  cashDown: 200_000, cpfDown: 200_000, cpfMonthly: 2_500, yearsHeld: 5,
};

const outcomeAt = (r, salePrice) => saleOutcome({
  salePrice,
  outstanding: r.holding.outstanding,
  cpfRefund: r.cpf.total,
  legalSell: r.exit.legal,
  agentRate: r.exit.agentRate,
  ssdRate: r.exit.ssd.rate,
  cashIn: r.cash.total,
});

test('a sale at the break-even price returns exactly the cash that went in', () => {
  // breakEven() and saleOutcome() are two readings of one settlement. Two
  // implementations of one rule disagreeing is a failure this repo has had
  // twice, so they are pinned to each other rather than tested apart.
  const r = ledger(base);
  const o = outcomeAt(r, r.breakEven.returnOfCash);
  assert.ok(Math.abs(o.cashChange) <= 2, `cashChange ${o.cashChange} at break-even`);
  assert.equal(o.cashToComplete, 0);
});

test('a shortfall is reported in full and never floored to nothing', () => {
  // `Math.max(0, …)` around a seller's proceeds is how this repo once told a
  // seller who owed S$197,747 at completion that they walked away with zero.
  const r = ledger(base);
  const o = outcomeAt(r, 900_000);
  assert.equal(o.toSeller, 0);
  assert.ok(o.cashToComplete > 0, 'a sale below the loan must name what is owed');

  // And it is the exact shortfall, not a gesture at one.
  const costs = 900_000 * (r.exit.agentRate + r.exit.ssd.rate) + r.exit.legal;
  assert.ok(Math.abs(o.cashToComplete - (r.holding.outstanding + costs - 900_000)) <= 1);
});

test('CPF and the bank fall short differently, and are never added together', () => {
  // The bank must be paid; CPF takes what is left and waives the rest at
  // market value. Collapsing the two makes the downside either alarmist or
  // useless, so they come back as separate figures.
  const r = ledger(base);
  const between = r.holding.outstanding + r.exit.legal + 60_000;   // clears the loan, not CPF
  const o = outcomeAt(r, between);
  assert.equal(o.cashToComplete, 0, 'the loan is covered at this price');
  assert.ok(o.cpfShortfall > 0, 'CPF is not fully refunded at this price');
  assert.equal(o.toSeller, 0, 'nothing reaches the seller before CPF is whole');
  assert.equal(o.cpfRefunded + o.cpfShortfall, r.cpf.total);
});

test('every dollar of the sale is accounted for at any price', () => {
  const r = ledger(base);
  for (const p of [400_000, 1_000_000, 1_600_000, 2_400_000]) {
    const o = outcomeAt(r, p);
    // price + what the seller brings = costs + loan + CPF refunded + what they keep
    const lhs = p + o.cashToComplete;
    const rhs = o.sellingCosts + o.outstanding + o.cpfRefunded + o.toSeller;
    assert.ok(Math.abs(lhs - rhs) <= 2, `at ${p}: ${lhs} vs ${rhs}`);
  }
});

test('an index change is applied to the reader’s own price and to nothing else', () => {
  // Rule 2: no valuation. The only price that enters is the one the reader
  // typed, moved by a published change — there is no estimate of this home.
  const hdb = compact(read('hdb-index.json').points);
  const d = distribution(hdb, 5);
  const r = ledger({ ...base, propertyType: 'HDB' });
  const o = outcomeAt(r, base.price * (1 + d.worst.change));
  assert.ok(Math.abs(o.salePrice - Math.round(base.price * (1 + d.worst.change))) <= 1);
});
