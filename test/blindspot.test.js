import test from 'node:test';
import assert from 'node:assert/strict';
import { score, scoreCheck, CHECKS, BANDS, totalPossible } from '../lib/blindspot/rubric.js';
import { pricePercentile, supplyInTown, mopCoverage } from '../lib/blindspot/measure.js';

/**
 * The rubric is the reason this tool is allowed to publish a number at all.
 * A score assembled by a model was refused on this project; a score computed by
 * a published formula over filed transactions is a different object. These
 * tests are what keep it the second thing.
 */

test('the same inputs always produce the same score', () => {
  const a = score({ price: 0.82, supply: 0.11, gls: 450, view: 3.2 });
  const b = score({ price: 0.82, supply: 0.11, gls: 450, view: 3.2 });
  assert.deepEqual(a, b);
  assert.equal(a.points, b.points);
});

test('a check with no data is skipped, never scored as zero risk', () => {
  // The whole failure mode: absence of evidence reading as evidence of safety.
  const partial = score({ price: 0.95, supply: null, gls: null, view: null });
  assert.equal(partial.checks.length, 1);
  assert.equal(partial.skipped.length, 3);
  assert.equal(partial.max, CHECKS.price.max, 'the denominator must only count checks that ran');
  assert.equal(partial.points, 3);
  for (const s of partial.skipped) assert.ok(s.needs, `${s.key} does not say what it needs`);
});

test('the denominator is what ran, and ten is only claimed when all four did', () => {
  const two = score({ price: 0.4, supply: 0.06 });
  assert.equal(two.max, 6);
  assert.equal(two.outOfTen, null, 'a ten-point score off six points of evidence is a lie');

  const all = score({ price: 0.4, supply: 0.06, gls: 100, view: 1.0 });
  assert.equal(all.max, totalPossible());
  assert.equal(all.outOfTen, all.points);
});

test('nothing measurable at all returns no score rather than a clean bill', () => {
  const none = score({});
  assert.equal(none.max, 0);
  assert.equal(none.ratio, null);
  assert.equal(none.band, null, 'zero checks must not band as low risk');
  assert.equal(none.checks.length, 0);
});

test('more risk scores higher, and the bands say so', () => {
  const low = score({ price: 0.2, supply: 0.01, gls: 0, view: 0 });
  const high = score({ price: 0.99, supply: 0.4, gls: 2000, view: 4.2 });
  assert.ok(high.points > low.points);
  assert.equal(high.points, totalPossible());
  assert.match(high.direction, /Higher means more to check/);
  assert.notEqual(high.band, low.band);
});

test('every band is reachable and they tile the whole range', () => {
  const seen = new Set();
  for (let r = 0; r <= 1; r += 0.01) {
    const b = BANDS.find(x => r <= x.upTo);
    assert.ok(b, `no band covers ratio ${r.toFixed(2)}`);
    seen.add(b.label);
  }
  assert.equal(seen.size, BANDS.length, 'a band that can never be reached should not exist');
});

test('every finding names a figure rather than an adjective', () => {
  const r = score({ price: 0.93, supply: 0.22, gls: 900, view: 3.5 });
  for (const c of r.checks) {
    assert.match(c.finding, /\d/, `${c.key} finding carries no number: ${c.finding}`);
    // Rule 7 — no verdict words anywhere in the output.
    assert.doesNotMatch(c.finding, /undervalued|overvalued|best deal|bargain|expert/i);
  }
});

test('a check refuses a value it was not given', () => {
  assert.equal(scoreCheck('price', null), null);
  assert.equal(scoreCheck('price', undefined), null);
  assert.equal(scoreCheck('price', NaN), null);
  assert.throws(() => scoreCheck('nonsense', 1));
});

/* ── measurements ────────────────────────────────────────────────────────── */

const sale = (month, psf) => ({ month, psf });
const rec = psfs => ({ recent: psfs.map(([m, p]) => sale(m, p)) });

test('the price percentile only counts sales inside the window', () => {
  const now = new Date('2026-08-24');
  const r = rec([
    ['2026-07', 900], ['2026-06', 950], ['2026-05', 1000], ['2026-04', 1050], ['2026-03', 1100],
    ['2019-01', 400], ['2019-02', 410],   // old, must not drag the percentile down
  ]);
  const p = pricePercentile(r, 1000, { now });
  assert.equal(p.sample, 5, 'sales outside the window were counted');
  assert.equal(p.low, 900);
  assert.equal(p.high, 1100);
  assert.equal(p.percentile, 0.4);
});

test('too thin a sample returns nothing rather than a percentile', () => {
  const now = new Date('2026-08-24');
  assert.equal(pricePercentile(rec([['2026-07', 900], ['2026-06', 950]]), 1000, { now }), null);
  assert.equal(pricePercentile({ recent: [] }, 1000, { now }), null);
  assert.equal(pricePercentile(null, 1000, { now }), null);
});

test('an asking price above everything filed reads as above 100%', () => {
  const now = new Date('2026-08-24');
  const r = rec([['2026-07', 900], ['2026-06', 910], ['2026-05', 920], ['2026-04', 930], ['2026-03', 940]]);
  assert.equal(pricePercentile(r, 2000, { now }).percentile, 1);
  assert.equal(pricePercentile(r, 100, { now }).percentile, 0);
});

/* These read the real repo data, so they skip on a clone that has not built. */
const built = supplyInTown('TAMPINES') !== null;
const has = built ? undefined : { skip: 'data/mop.json not present' };

test('town supply is a real share of a real denominator', has, () => {
  const t = supplyInTown('TAMPINES');
  assert.equal(t.basis, 'town');
  assert.ok(t.totalUnits > 50_000, `Tampines came back with ${t.totalUnits} units`);
  assert.ok(t.ratio > 0 && t.ratio < 1);
  assert.equal(Math.round(t.upcomingUnits / t.totalUnits * 1e6), Math.round(t.ratio * 1e6));
});

test('an unknown town returns nothing rather than zero', has, () => {
  assert.equal(supplyInTown('ATLANTIS'), null);
  assert.equal(supplyInTown(null), null);
});

test('MOP geocode coverage is reported honestly', has, () => {
  const c = mopCoverage();
  assert.ok(c.total > 0, 'no upcoming MOP blocks found at all');
  assert.ok(c.ratio >= 0 && c.ratio <= 1);
  // Not asserted as high: it is low until `npm run geocode` has been re-run
  // with the MOP register included. What matters is that it is MEASURED, so
  // the supply check knows to fall back to the town instead of reporting a
  // radius it cannot actually see.
});
