import test from 'node:test';
import assert from 'node:assert/strict';
import { score, scoreCheck, CHECKS, BANDS, totalPossible } from '../lib/blindspot/rubric.js';
import { pricePercentile, nearbyComps, leaseFinding, leaseYearsLeft, tenureKey, supplyInTown, mopCoverage } from '../lib/blindspot/measure.js';
import { relativity, annualDecay } from '../lib/calc/lease.js';

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
  const partial = score({ price: 0.95, lease: null, supply: null, gls: null, view: null });
  assert.equal(partial.checks.length, 1);
  assert.equal(partial.skipped.length, 4);
  assert.equal(partial.max, CHECKS.price.max, 'the denominator must only count checks that ran');
  assert.equal(partial.points, 3);
  for (const s of partial.skipped) assert.ok(s.needs, `${s.key} does not say what it needs`);
});

test('the denominator is what ran, and the full score needs every check', () => {
  const two = score({ price: 0.4, supply: 0.06 });
  assert.equal(two.max, CHECKS.price.max + CHECKS.supply.max);
  assert.equal(two.outOfTen, null, 'a full-mark denominator off two checks is a lie');

  const all = score({ price: 0.4, lease: 70, supply: 0.06, gls: 100, view: 1.0 });
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

test('a partial result cannot say little flagged when the asking price was not assessed', () => {
  const partial = score({ supply: 0.01, gls: 0, view: 0 }, {
    price: { unavailable: 'Only two comparable sales were available.' },
  });
  assert.equal(partial.points, 0);
  assert.equal(partial.max, 7);
  assert.equal(partial.band, 'Incomplete — price not assessed');
  assert.match(partial.meaning, /asking price did not enter/i);
  assert.match(partial.skipped.find(s => s.key === 'price').needs, /Only two/);
});

/*
 * `view` is STOREYS, not a plot ratio. It changed with rubric v2, when the
 * check moved from what the Master Plan permits to what URA has actually
 * approved. The values below were 4.2 and 3.5 — plot ratios — and under the
 * new bands they read as four-storey buildings and scored nothing, which is
 * how this test caught the change rather than sleeping through it.
 */
test('more risk scores higher, and the bands say so', () => {
  const low = score({ price: 0.2, lease: Infinity, supply: 0.01, gls: 0, view: 0 });
  const high = score({ price: 0.99, lease: 35, supply: 0.4, gls: 2000, view: 39 });
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
  const r = score({ price: 0.93, supply: 0.22, gls: 900, view: 25 });
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

test('a thin block expands to the first sufficient nearby cohort, and no further', () => {
  // The radius must widen only until it has enough, because a percentile off
  // five sales within 500m and one off five within 1km are different claims
  // and only one of them is printed.
  const sale = (month, psf, areaSqm = 120, type = '5 ROOM') => [month, psf, areaSqm, type];
  const at = (lat, lon, sales, leaseCommence = 1992) =>
    ({ lat, lon, kind: 'HDB', label: 'blk', tenure: null, leaseCommence, sales });
  const index = { records: {
    '/hdb/test/100-test-road': at(1.35, 103.8, [sale('2025-12', 806)]),
    '/hdb/test/101-test-road': at(1.35, 103.801, [sale('2026-02', 766), sale('2026-06', 774)], 1991),
    '/hdb/test/102-test-road': at(1.35, 103.802, [sale('2026-07', 760)], 1994),
    // The fourth and fifth eligible sales sit beyond 500m, so the cohort must
    // widen once — and the subject's own sale does NOT make up the number,
    // because a "nearby" cohort that counts this address is not nearby.
    '/hdb/test/103-test-road': at(1.35, 103.8054, [sale('2026-07', 745), sale('2026-05', 752)], 1990),
    // Each of these fails exactly one filter and must not appear.
    '/hdb/test/104-test-road': at(1.35, 103.801, [sale('2026-07', 900, 120, '4 ROOM')]),
    '/hdb/test/105-test-road': at(1.35, 103.801, [sale('2026-07', 900, 150)]),
    '/hdb/test/106-test-road': at(1.35, 103.801, [sale('2026-07', 900)], 1980),
  } };
  const target = { kind: 'HDB', href: '/hdb/test/100-test-road', leaseCommence: 1992 };

  const r = nearbyComps(target, 5008, 120, '5 ROOM', { now: new Date('2026-09-02'), index });
  assert.equal(r.radiusKm, 0.75, 'stopped at the first radius that had enough');
  assert.equal(r.sample, 5);
  assert.equal(r.blocks, 3);
  assert.equal(r.percentile, 1, 'an ask above every comparable is the whole range');
  for (const c of r.comparisons)
    assert.notEqual(c.href, target.href, 'the subject must not be its own comparable');
});

test('tenure is matched on years left, not on the words in the lease', () => {
  // URA's tenure field is free text: this dataset holds 103-year and 946-year
  // leases. Grouping by the nominal term gave each its own family and starved
  // the cohort — 8 @ Mount Sophia found nothing inside 1.5km while sitting
  // among hundreds of comparable leasehold flats.
  const now = new Date('2026-09-02');
  assert.equal(leaseYearsLeft('Freehold', now), Infinity);
  assert.equal(leaseYearsLeft('946 yrs lease commencing from 1938', now), Infinity,
    'a lease with eight centuries left does not decay in any way a buyer meets');
  assert.equal(leaseYearsLeft('103 yrs lease commencing from 2002', now), 79);
  assert.equal(leaseYearsLeft('99 yrs lease commencing from 2002', now), 75);
  assert.equal(leaseYearsLeft('nonsense', now), null);
  // 79 and 75 are the same product; freehold and 75 are not.
  assert.equal(tenureKey('103 yrs lease commencing from 2002', now).family, 'leasehold');
  assert.equal(tenureKey('Freehold', now).family, 'freehold');
});

test('the lease check runs on freehold and scores it zero', () => {
  // A check that vanished on freehold would leave a reader unable to tell
  // "nothing to worry about here" from "we could not look".
  const fh = leaseFinding({ kind: 'PRIVATE', tenure: 'Freehold' });
  assert.equal(fh.freehold, true);
  const scored = scoreCheck('lease', fh.years, fh);
  assert.equal(scored.points, 0);
  assert.match(scored.finding, /freehold/i);
});

test('a shorter lease scores higher, and the figures come from the published table', () => {
  const now = new Date('2026-09-02');
  const at = y => leaseFinding({ kind: 'HDB', remainingLease: `${y} years 0 months` }, now);
  const pts = y => scoreCheck('lease', at(y).years, at(y)).points;
  assert.ok(pts(35) > pts(55), '35 years left must flag harder than 55');
  assert.ok(pts(55) > pts(75));
  assert.equal(pts(95), 0);
  // Not invented: the relativity and the annual decay are read out of
  // data/sources/leasehold-table.json, and the finding prints both.
  const sixty = at(60);
  assert.equal(sixty.relativity, relativity(60));
  assert.equal(sixty.decay, annualDecay(60));
  assert.match(scoreCheck('lease', sixty.years, sixty).finding, /% of freehold/);
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

test('a finding names the kind of building it actually counted', () => {
  // Perfect Ten, a freehold condominium, reported "13 comparable filed sales
  // across 7 HDB blocks". The word was hardcoded while the nearby cohort was
  // HDB-only and survived the change to cover private — an error a reader has
  // no way to catch, because the number beside it is correct.
  const hdb = scoreCheck('price', 0.95, {
    basis: 'nearby', sample: 5, blocks: 4, radiusKm: 1, months: 12,
    leaseFrom: 1987, leaseTo: 1997,
  });
  assert.match(hdb.finding, /HDB blocks/);

  const priv = scoreCheck('price', 0.95, {
    basis: 'nearby', sample: 13, blocks: 7, radiusKm: 0.5, months: 12,
    tenure: 'freehold', leaseFrom: null,
  });
  assert.doesNotMatch(priv.finding, /HDB/, 'a condominium cohort is not HDB blocks');
  assert.match(priv.finding, /nearby projects/);
});
