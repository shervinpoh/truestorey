import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Turning a budget into places.
 *
 * /plan worked out the largest loan the rules allow and stopped at a figure.
 * A ceiling is half an answer: the question underneath "what can I afford" is
 * always "and what does that BUY". These guard the two ways that answer could
 * quietly become dishonest — quoting an outlier, and describing a market from
 * a handful of sales.
 */
const b = JSON.parse(readFileSync(new URL('../data/budget.json', import.meta.url), 'utf8'));

test('every published group is a market, not a handful of homes', () => {
  assert.ok(b.minSales >= 10, 'the floor for publishing a median must not be lowered quietly');
  for (const r of b.rows)
    assert.ok(r.n >= b.minSales, `${r.scope} ${r.area} ${r.type} published on ${r.n} sales`);
});

test('the quartiles are ordered, so none of them is a stray figure', () => {
  for (const r of b.rows) {
    assert.ok(r.p25 <= r.median, `${r.area} ${r.type}: lower quartile above the median`);
    assert.ok(r.median <= r.p75, `${r.area} ${r.type}: median above the upper quartile`);
    assert.ok(r.p25 > 0);
  }
});

test('reachability is judged on the lower quartile, never on the cheapest sale', () => {
  // One low price is a story about one home — a low floor, a short lease, a
  // seller in a hurry — and quoting it would send somebody looking for
  // something that mostly is not there.
  const src = readFileSync(new URL('../scripts/build-budget.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Math\.min\(\.\.\.g\.prices\)/, 'a minimum price has crept in');
  assert.match(src, /q\(g\.prices, 0\.25\)/);
  for (const r of b.rows) assert.equal(r.min, undefined, 'rows must not carry a cheapest sale');
});

test('it describes now, not the whole history', () => {
  // A budget is being spent now, and a 2021 median would flatter every area.
  assert.equal(b.months, 12);
  const [y, m] = b.from.split('-').map(Number);
  const age = (new Date().getFullYear() - y) * 12 + (new Date().getMonth() + 1 - m);
  assert.ok(age >= 11 && age <= 13, `the window starts ${age} months back, not twelve`);
});

test('both markets are covered, and named the way each agency names them', () => {
  assert.ok(b.counts.hdb > 50, 'HDB towns are missing');
  assert.ok(b.counts.private > 50, 'private districts are missing');
  for (const r of b.rows) {
    if (r.scope === 'HDB') assert.match(r.type, /ROOM|EXECUTIVE|GENERATION/);
    else assert.match(r.area, /^D\d{2}$/, `a private group is filed by district: ${r.area}`);
  }
});

test('the panel says when a size is out of reach rather than omitting it', () => {
  // Knowing that no town has a five-room inside the budget is as useful as
  // knowing which ones do, and an empty list says neither.
  const src = readFileSync(new URL('../components/Planner.jsx', import.meta.url), 'utf8');
  assert.match(src, /Out of reach everywhere filed/);
  assert.match(src, /the cheapest quarter starts at/);
});
