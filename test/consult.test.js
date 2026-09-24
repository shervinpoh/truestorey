import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert';
import { priceAnalysis } from '../lib/blindspot/measure.js';
import { estimate, clientSafe, WEIGHTS } from '../lib/consult/avm.js';
import { timebase, quarterOf, indexAt, latestQuarter } from '../lib/consult/timebase.js';
import { asOfRecord, asOfIndex } from '../lib/consult/asof.js';

const ASOF = new Date('2026-09-14T00:00:00Z');

/* A synthetic block, so these assert the ESTIMATOR rather than whatever
   happens to be in data/ this month. Eight sales clears the default min of
   five, so the cohort resolves on the first rung and stays same-address. */
const sale = (month, psf, storey = '07 TO 09') =>
  ({ month, psf, areaSqm: 93, flatType: '4 ROOM', storey });
const REC = {
  href: '/hdb/testtown/blk-1', kind: 'HDB', label: 'Blk 1 TEST ROAD',
  source: 'HDB resale (data.gov.sg)', period: '2026',
  flatTypes: ['4 ROOM'], leaseCommence: 1990,
  recent: [
    sale('2026-08', 640), sale('2026-07', 620), sale('2026-06', 655),
    sale('2026-05', 610), sale('2026-04', 630), sale('2026-03', 600),
    sale('2026-02', 645), sale('2026-01', 615),
  ],
};
const SQFT = Math.round(93 * 10.7639);

test('the estimate runs and sits inside the prices it was built from', () => {
  const r = estimate(REC, { areaSqft: SQFT, asOf: ASOF });
  assert.ok(r.ok, r.reason);
  assert.ok(r.psf >= 600 && r.psf <= 655, `psf ${r.psf} outside the filed range`);
  assert.ok(r.band.psfLow <= r.psf && r.psf <= r.band.psfHigh, 'point outside its own band');
  assert.strictEqual(r.evidence.sample, 8);
  assert.strictEqual(r.evidence.fromNearby, 0, 'a sufficient block rung must not reach for neighbours');
  assert.strictEqual(r.price, Math.round(r.psf * SQFT));
});

/**
 * ── THE CIRCULARITY GUARD ─────────────────────────────────────────────────
 * The AVM gets its cohort by calling `priceAnalysis`, which takes an asking
 * price it does not need, so it passes a constant. That is safe only while
 * rung selection depends on `sample >= min` and never on the asking price. If
 * someone ever couples them — a rung that widens when the asking price looks
 * high, say — the AVM silently becomes anchored on its own seed, every
 * backtest it passes becomes meaningless, and nothing else would notice.
 */
test('the cohort does not depend on the asking price it was seeded with', () => {
  const opts = { areaSqft: SQFT, months: 12, min: 5, now: ASOF };
  const a = priceAnalysis(REC, 1, opts);
  const b = priceAnalysis(REC, 99_999, opts);
  const key = x => (x.scored?.comparisons || []).map(c => `${c.month}|${c.psf}|${c.areaSqm}`).join(',');
  assert.strictEqual(key(a), key(b), 'rung selection has become asking-price dependent');
  assert.strictEqual(a.scored.basis, b.scored.basis);
});

test('a thin address scores nothing and says why, rather than guessing wider', () => {
  const thin = { ...REC, recent: [sale('2026-08', 640), sale('2026-07', 620)] };
  const r = estimate(thin, { areaSqft: SQFT, asOf: ASOF });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /At least 5 comparable sales/);
});

test('an estimate without a floor area is refused, not approximated', () => {
  const r = estimate(REC, { asOf: ASOF });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /floor area/i);
});

/* Rule 2 is enforced by a function rather than by remembering. */
test('clientSafe removes the point and keeps the band', () => {
  const r = estimate(REC, { areaSqft: SQFT, asOf: ASOF });
  const safe = clientSafe(r);
  assert.strictEqual(safe.psf, undefined);
  assert.strictEqual(safe.price, undefined);
  assert.ok(safe.band.psfLow > 0 && safe.band.psfHigh > 0);
  assert.ok(safe.comparables.every(c => c.weight === undefined),
    'the weights that produced the point must not travel with the safe form');
});

/* ── time ──────────────────────────────────────────────────────────────── */

test('a month maps to its quarter and a quarter passes through', () => {
  assert.strictEqual(quarterOf('2026-07'), '2026-Q3');
  assert.strictEqual(quarterOf('2026-01'), '2026-Q1');
  assert.strictEqual(quarterOf('2026-12'), '2026-Q4');
  assert.strictEqual(quarterOf('2026-Q2'), '2026-Q2');
});

/**
 * Reading forward would let a sale be restated by a quarter that had not been
 * published when it happened — the leak that makes a backtest report an
 * accuracy nobody can reproduce on a live lookup.
 */
test('the index reads back to the nearest earlier quarter, never forward', () => {
  const points = [
    { quarter: '2025-Q1', index: 100 },
    { quarter: '2025-Q3', index: 110 },
    { quarter: '2026-Q1', index: 120 },
  ];
  assert.strictEqual(indexAt(points, '2025-Q2').quarter, '2025-Q1');
  assert.strictEqual(indexAt(points, '2025-Q3').quarter, '2025-Q3');
  assert.strictEqual(indexAt(points, '2026-Q4').quarter, '2026-Q1');
  assert.strictEqual(indexAt(points, '2024-Q4'), null, 'nothing published yet is not "the earliest"');
  assert.strictEqual(latestQuarter(points, '2025-Q3').quarter, '2025-Q3');
});

test('the target quarter never runs ahead of the valuation date', () => {
  const tb = timebase('HDB', '4 ROOM', { asOf: ASOF });
  assert.ok(tb, 'the HDB index should be present in data/');
  assert.ok(tb.targetQuarter <= quarterOf('2026-09'), `${tb.targetQuarter} is in the future`);
  assert.ok(Number.isFinite(tb.lagMonths) && tb.lagMonths >= 0);
  assert.match(tb.describe(), /assumption, not a measurement/);
});

/**
 * ── THE CAP MUST BITE ON A PAST DATE ──────────────────────────────────────
 * The test above passes whether or not the cap works, because the series ends
 * at 2026-Q2 and the assertion only asks that the target is not in the future.
 * It was not, and the cap was doing nothing at all: quarterOf took a string
 * and estimate() passes a Date, so it returned null and latestQuarter fell
 * through to the newest quarter in the file.
 *
 * Invisible in production, where asOf is today. Looking backwards it made a
 * 2018-Q4 comparable worth 1.54x what it filed for, and a rolling backtest
 * from 2019 reported a +54% median bias decaying to zero at the present.
 *
 * So the assertion is now made where it can fail: a valuation dated 2019 must
 * restate to a 2019 quarter, from a Date, which is the type the caller holds.
 */
test('a valuation dated in the past restates to a past quarter', () => {
  assert.strictEqual(quarterOf(new Date('2019-02-15T00:00:00Z')), '2019-Q1',
    'quarterOf must accept the Date that estimate() actually passes');
  const past = timebase('HDB', '4 ROOM', { asOf: new Date('2019-02-15T00:00:00Z') });
  assert.ok(past, 'the HDB index covers 2019');
  assert.strictEqual(past.targetQuarter, '2019-Q1',
    `a 2019 valuation restated to ${past.targetQuarter}`);
  const moved = past.adjust(500, '2018-10');
  assert.ok(moved.factor > 0.9 && moved.factor < 1.1,
    `one quarter of HDB index moved a comparable by ${moved.factor} — the cap is not biting`);
});

test('restating an older sale moves it and reports by how much', () => {
  const tb = timebase('HDB', '4 ROOM', { asOf: ASOF });
  const moved = tb.adjust(600, '2024-07');
  assert.ok(moved && moved.factor > 1, 'HDB resale prices rose over this window');
  assert.strictEqual(moved.from, '2024-Q3');
  assert.strictEqual(tb.summary().n, 1);
});

/* ── the backtest leak ─────────────────────────────────────────────────── */

/**
 * `sameRecordPrice` filters `month >= cutoff` with no upper bound, which is
 * correct live and fatal to a backtest — a past `now` would still see the very
 * sale being predicted. The truncation is what stops that, so it is asserted
 * rather than assumed.
 */
test('an as-of view excludes the as-of month itself, not just later ones', () => {
  const v = asOfRecord(REC, '2026-06');
  assert.ok(v.recent.every(s => s.month < '2026-06'), 'a later or same-month sale survived');
  assert.strictEqual(v.recent.length, 5);
  assert.strictEqual(REC.recent.length, 8, 'the original record must not be mutated');
});

test('an as-of index drops addresses left with nothing, rather than keeping them empty', () => {
  const index = { records: {
    a: { kind: 'HDB', lat: 1, lon: 103, sales: [['2026-08', 600, 93, '4 ROOM', '07 TO 09']] },
    b: { kind: 'HDB', lat: 1, lon: 103, sales: [['2025-01', 500, 93, '4 ROOM', '07 TO 09']] },
  } };
  const v = asOfIndex(index, '2026-01');
  assert.deepStrictEqual(Object.keys(v.records), ['b'],
    'an address contributing no sales would still be counted as a contributing address');
});

test('the weights are published and are half-weight distances', () => {
  assert.ok(WEIGHTS.distanceM > 0 && WEIGHTS.months > 0 && WEIGHTS.areaPct > 0);
  assert.ok(Math.exp(-WEIGHTS.distanceM / WEIGHTS.distanceM) < 0.5,
    'a comparable at the stated distance must count for less than half');
});

/* ── the measured error ─────────────────────────────────────────────────── */

test('an estimate carries the error measured for its own shape of lookup', async (t) => {
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return; // the shard is absent; nothing to assert
  const r = estimate(rec, { areaSqft: 1313, floor: 9 });
  /* Whether this block's estimate runs tonight depends on what has aged out
     of the window. A failure here would block the nightly data commit over a
     fact about the calendar, so a declined estimate skips instead. */
  if (!r.ok) { t.skip(`the estimate declined on current data: ${r.reason}`); return; }
  if (!r.error) return; // no table built yet — estimate() must still succeed
  assert.ok(r.error.p90Pct > r.error.medianPct, 'a 90th percentile below the median is not one');
  assert.ok(r.error.trials > 0);
  assert.ok(['tight', 'workable', 'wide'].includes(r.error.band));
});

/**
 * A missing table must leave the error UNMEASURED, never small. This is the
 * same rule as "a check that cannot run scores nothing and says so" — an
 * estimate that silently reported a tight error because no table existed would
 * be confident for exactly the wrong reason.
 */
test('with no error table the estimate still runs and reports no error', async () => {
  const { errorFor } = await import('../lib/consult/error.js');
  assert.strictEqual(errorFor({ kind: 'HDB' }), null, 'missing features must not resolve to a bin');
  assert.strictEqual(errorFor({}), null);
});

test('the confidence word is derived from the measured p90, not chosen', async () => {
  const { bandFor, BANDS } = await import('../lib/consult/error.js');
  assert.strictEqual(bandFor(0.05), 'tight');
  assert.strictEqual(bandFor(0.12), 'workable');
  assert.strictEqual(bandFor(0.30), 'wide');
  assert.ok(BANDS.at(-1).at === Infinity, 'every p90 must land in a band');
});

/* ── outlook ────────────────────────────────────────────────────────────── */

const OUT_REC = { ...REC, town: 'TESTTOWN', leaseCommence: 1990 };

test('lease decay comes from the SLA table and is scheduled, not forecast', async () => {
  const { outlook } = await import('../lib/consult/outlook.js');
  const { relativity } = await import('../lib/calc/lease.js');
  const r = outlook(OUT_REC, { areaSqft: SQFT, years: 10, price: 500_000, now: ASOF });
  assert.ok(r.ok, r.reason);
  assert.ok(r.lease.ran, r.lease.why);
  /* Not "about right" — the exact published rows, or it is not the table. */
  assert.strictEqual(r.lease.relativityNow, relativity(r.lease.leftNow));
  assert.strictEqual(r.lease.relativityThen, relativity(r.lease.leftThen));
  assert.strictEqual(r.lease.leftThen, r.lease.leftNow - 10);
  assert.ok(r.lease.dropPct < 0, 'a lease running down cannot gain relativity');
});

/**
 * Freehold must report NO SCHEDULED DECAY, which is a different claim from a
 * decay of zero arrived at by failing to look. relativity() returns null
 * outside 1–99 and that refusal has to survive into the output.
 */
test('freehold reports no scheduled decay rather than a zero it did not measure', async () => {
  const { outlook } = await import('../lib/consult/outlook.js');
  const fh = { ...OUT_REC, kind: 'Condo', tenure: 'Freehold', leaseCommence: null,
               propertyTypes: ['Condominium'], recent: REC.recent.map(s => ({ ...s, propertyType: 'Condominium' })) };
  const r = outlook(fh, { areaSqft: SQFT, years: 10, price: 1_500_000, now: ASOF });
  if (!r.ok) return;
  if (r.lease.ran && r.lease.freehold) {
    assert.strictEqual(r.lease.dropPct, 0);
    assert.match(r.lease.note, /No scheduled lease decay/);
  }
});

test('the hurdle is exactly its two published parts', async () => {
  const { outlook } = await import('../lib/consult/outlook.js');
  const r = outlook(OUT_REC, { areaSqft: SQFT, years: 10, price: 500_000, now: ASOF });
  const { friction, lease } = r.hurdle.parts;
  assert.ok(Math.abs((friction + lease) - r.hurdle.totalPct) < 1e-9,
    'the hurdle must be the sum of what it says it is');
  assert.ok(friction > 0, 'buying and selling are never free');
});

/**
 * HDB's index begins in 1990-Q1, which leaves fewer than four non-overlapping
 * ten-year stretches. distribution() refuses, and the refusal has to NAME the
 * longest horizon that works — "cannot be read" reads as a broken tool, and
 * the next thing to run is the useful half of the answer.
 */
test('a horizon the index cannot support is refused by name, with the one that works', async () => {
  const { outlook } = await import('../lib/consult/outlook.js');
  const r = outlook(OUT_REC, { areaSqft: SQFT, years: 10, price: 500_000, now: ASOF });
  assert.strictEqual(r.record.ran, false);
  assert.match(r.record.why, /1990-Q1|four/);
  assert.ok(r.record.longestReadable >= 5 && r.record.longestReadable < 10,
    `expected a shorter readable horizon, got ${r.record.longestReadable}`);
});

test('one part failing does not take the rest of the report with it', async () => {
  const { outlook } = await import('../lib/consult/outlook.js');
  const r = outlook(OUT_REC, { areaSqft: SQFT, years: 10, price: 500_000, now: ASOF });
  assert.strictEqual(r.record.ran, false, 'this fixture is the degraded case');
  assert.ok(r.hurdle.totalPct > 0, 'the hurdle still ran');
  assert.ok(r.lease.ran, 'the lease still ran');
  assert.ok(Array.isArray(r.unknown) && r.unknown.length >= 4);
});

/**
 * The tool exists to inform a view, never to hold one. A verdict in the output
 * is both worse analysis and, once it reaches a client, a CEA problem — rule 7
 * bans exactly these words on anything published, and this is the file they
 * would most naturally creep into.
 */
test('the report contains no verdict', async () => {
  const { outlook } = await import('../lib/consult/outlook.js');
  const r = outlook(OUT_REC, { areaSqft: SQFT, years: 10, price: 500_000, now: ASOF });
  const text = JSON.stringify(r).toLowerCase();
  for (const word of ['good buy', 'bad buy', 'undervalued', 'overvalued', 'bargain',
                      'recommend', 'should buy', 'best deal', 'expert', 'specialist']) {
    assert.ok(!text.includes(word), `the report said "${word}"`);
  }
});

/* ── the rolling backtest's as-of view ──────────────────────────────────── */

/**
 * Built on synthetic rows rather than data/.hdb-history.json, which is
 * gitignored — a test that silently skips on a fresh clone is not a test.
 */
const HCOLS = { month: 0, town: 1, block: 2, street: 3, flatType: 4, model: 5,
                storeyRange: 6, areaSqm: 7, leaseCommence: 8, price: 9 };
const hrow = (month, block, psfish) =>
  [month, 'TESTTOWN', block, 'TEST RD', '4 ROOM', 'Improved', '07 TO 09', 93, 1990, psfish];

test('the market can only see months that have been folded in', async () => {
  const { MarketAsOf } = await import('../lib/consult/history.js');
  const m = new MarketAsOf({ columns: HCOLS, coords: { '/hdb/testtown/1-test-rd': { lat: 1.3, lon: 103.8 } } });

  m.add([hrow('2019-01', '1', 500_000)]); m.added.push('2019-01');
  m.add([hrow('2019-02', '1', 520_000)]); m.added.push('2019-02');

  const rec = m.record('/hdb/testtown/1-test-rd');
  assert.strictEqual(rec.recent.length, 2);
  assert.ok(rec.recent.every(s => s.month <= '2019-02'),
    'a month that was never added has appeared in the record');

  /* The invariant the whole design rests on: predict, THEN fold in. A sale
     that has not been added cannot be seen, so there is no `month < asOf`
     comparison anywhere in the loop to get subtly wrong — which is exactly
     how sameRecordPrice's missing upper bound nearly shipped a leak. */
  m.add([hrow('2019-03', '1', 540_000)]); m.added.push('2019-03');
  assert.strictEqual(m.record('/hdb/testtown/1-test-rd').recent.length, 3);
});

test('an address with no coordinate is a subject but never a comparable', async () => {
  const { MarketAsOf } = await import('../lib/consult/history.js');
  const m = new MarketAsOf({ columns: HCOLS, coords: { '/hdb/testtown/1-test-rd': { lat: 1.3, lon: 103.8 } } });
  m.add([hrow('2019-01', '1', 500_000), hrow('2019-01', '2', 510_000)]);
  m.added.push('2019-01');

  /* Block 2 has no coordinate. nearbyComps would place it at null and still
     count it toward `places.size`, so it is withheld from the index — but it
     can still be priced off its own filed sales. */
  assert.ok(m.record('/hdb/testtown/2-test-rd'), 'block 2 must remain available as a subject');
  assert.deepStrictEqual(Object.keys(m.index().records), ['/hdb/testtown/1-test-rd']);
  assert.strictEqual(m.coverage().withoutCoordinate, 1);
});

test('an unknown address returns null rather than an empty record', async () => {
  const { MarketAsOf } = await import('../lib/consult/history.js');
  const m = new MarketAsOf({ columns: HCOLS, coords: {} });
  assert.strictEqual(m.record('/hdb/nowhere/9-nope'), null);
});

/* ── Test 2: is the gap explained? ──────────────────────────────────────── */

/**
 * ── THE CIRCULARITY GUARD ─────────────────────────────────────────────────
 * The rubric's own `price` check is the percentile of the asking price within
 * its comparables — which is Test 1 restated. If it ever leaks into the list
 * of things allowed to EXPLAIN a gap, the tool starts saying "the price is
 * high, and what explains it is that the price is high" — and it would fire
 * on exactly the lookups where the residual matters most, because those are
 * the ones where the price check scores.
 */
test('the price check can never explain the gap it is measuring', async () => {
  const { EXPLAINERS } = await import('../lib/consult/residual.js');
  assert.ok(!EXPLAINERS.includes('price'),
    'the rubric price check has been allowed to explain its own gap');
  assert.ok(EXPLAINERS.length >= 3, 'too few explainers left to say anything survived them');
});

test('an asking price is required — this asks whether a price is explained', async () => {
  const { residual } = await import('../lib/consult/residual.js');
  const r = residual(REC, { areaSqft: SQFT });
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /asking price is required/i);
});

test('a gap inside the typical miss is noise, not a finding', async () => {
  const { residual } = await import('../lib/consult/residual.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return;
  const { estimate } = await import('../lib/consult/avm.js');
  const est = estimate(rec, { areaSqft: 1313, floor: 9 });
  if (!est.ok || !est.error) return;

  /* Priced a hair off the estimate: inside any plausible error band. */
  const r = residual(rec, { asking: est.psf * 1313 * 1.002, areaSqft: 1313, floor: 9 });
  assert.strictEqual(r.verdict.code, 'noise', `expected noise, got ${r.verdict.code}`);
  assert.match(r.verdict.says, /not a finding/i);
});

test('direction decides which verdict a surviving gap gets', async () => {
  const { residual } = await import('../lib/consult/residual.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return;
  const { estimate } = await import('../lib/consult/avm.js');
  const est = estimate(rec, { areaSqft: 1313, floor: 9 });
  if (!est.ok || !est.error) return;

  const far = est.error.p90Pct + 0.05;   // comfortably past any noise threshold
  const up = residual(rec, { asking: est.psf * 1313 * (1 + far), areaSqft: 1313, floor: 9 });
  const down = residual(rec, { asking: est.psf * 1313 * (1 - far), areaSqft: 1313, floor: 9 });
  assert.match(up.verdict.code, /^premium-/, `a price above the estimate produced ${up.verdict.code}`);
  assert.match(down.verdict.code, /^discount-/, `a price below the estimate produced ${down.verdict.code}`);
  assert.strictEqual(up.gap.direction, 'premium');
  assert.strictEqual(down.gap.direction, 'discount');
});

/**
 * "Unexplained" means one thing when every check ran and found nothing, and
 * something quite different when three could not run at all. The first is
 * evidence; the second is silence, and letting silence read as safety is the
 * failure this whole repo is organised against.
 */
test('a check that could not run weakens the verdict in words', async () => {
  const { residual } = await import('../lib/consult/residual.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return;
  const r = residual(rec, { asking: 858_000, areaSqft: 1313, floor: 9 });
  if (!r.ok) return;
  assert.ok(Array.isArray(r.test2.coverage.couldNotRun));
  assert.strictEqual(r.test2.coverage.complete, r.test2.coverage.couldNotRun.length === 0);
  if (!r.test2.coverage.complete) {
    assert.ok(r.verdict.qualifier, 'checks were skipped and the verdict did not say so');
    assert.match(r.verdict.qualifier, /nothing was FOUND/);
  } else {
    assert.strictEqual(r.verdict.qualifier, null);
  }
});

test('the residual report carries no verdict vocabulary either', async () => {
  const { residual } = await import('../lib/consult/residual.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return;
  const r = residual(rec, { asking: 700_000, areaSqft: 1313, floor: 9 });
  const text = JSON.stringify(r).toLowerCase();
  for (const w of ['undervalued', 'overvalued', 'bargain', 'good buy', 'recommend',
                   'should buy', 'best deal', 'expert', 'specialist']) {
    assert.ok(!text.includes(w), `the residual report said "${w}"`);
  }
});

test('what a viewing is for is stated every time', async () => {
  const { residual } = await import('../lib/consult/residual.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return;
  const r = residual(rec, { asking: 858_000, areaSqft: 1313, floor: 9 });
  if (!r.ok) return;
  assert.match(r.whatIsLeft, /renovation|facing|condition/i,
    'the report must say what it cannot see, not only what it found');
});

/* ── the positive score ─────────────────────────────────────────────────── */

/**
 * Two scores with OPPOSITE polarity now live in this repo: Blindspot's, where
 * higher means more to check, and this one, where higher means more going for
 * it. Somebody will eventually read one as the other. The polarity therefore
 * travels with the result rather than living in a comment.
 */
test('the positive score states which way it runs', async () => {
  const { score, POLARITY } = await import('../lib/consult/score.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return;
  const s = score(rec);
  assert.ok(s.ok);
  assert.match(s.polarity, /opposite of the Blindspot/i);
  assert.match(POLARITY, /Higher means MORE going for it/);
});

/**
 * The denominator is the sum of the maxima of the factors that RAN. Calling a
 * property with no coordinate 0/14 would read as "nothing nearby" when the
 * truth is "we could not look" — the same distinction the rubric is built on.
 */
test('a factor that could not run lowers the denominator, not the score', async () => {
  const { score, FACTORS } = await import('../lib/consult/score.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return;

  const full = Object.values(FACTORS).reduce((a, x) => a + x.max, 0);
  const s = score(rec);
  const ranMax = s.factors.filter(x => x.ran).reduce((a, x) => a + x.max, 0);
  assert.strictEqual(s.max, ranMax, 'the denominator must count only factors that ran');
  assert.ok(s.max <= full);
  assert.strictEqual(s.skipped.length, s.factors.filter(x => !x.ran).length);
  for (const sk of s.skipped) assert.ok(sk.why, `${sk.key} did not run and did not say why`);
  assert.ok(s.points <= s.max, 'a score cannot exceed what was measurable');
  assert.match(s.basis, /possible/);
});

test('every factor that scores says what it measured and in what units', async () => {
  const { score } = await import('../lib/consult/score.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return;
  for (const fct of score(rec).factors.filter(x => x.ran)) {
    assert.ok(fct.finding && fct.finding.length > 20, `${fct.key} scored with no finding`);
  }
});

/* Rule 10 and rule 11, asserted on the text a reader actually sees. */
test('distances are labelled straight-line and a school band is never a place', async () => {
  const { score } = await import('../lib/consult/score.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/punggol/271a-punggol-walk') || recordByHref('/hdb/bedok/649-jln-tenaga');
  if (!rec) return;
  const s = score(rec);
  const rail = s.factors.find(x => x.key === 'rail');
  if (rail?.ran) assert.match(rail.finding, /straight line|straight-line/i,
    'a distance was printed without saying it is straight-line — rule 10');
  const pri = s.factors.find(x => x.key === 'primary');
  if (pri?.ran && pri.value > 0) assert.match(pri.finding, /BALLOT PRIORITY/,
    'the 1km band was printed without saying it is ballot priority — rule 11');
});

/* ── the record, and the regime it came from ────────────────────────────── */

test('the record leads with percentiles, which are ordered', async () => {
  const { outlook } = await import('../lib/consult/outlook.js');
  const r = outlook(OUT_REC, { areaSqft: SQFT, years: 7, price: 500_000, now: ASOF });
  if (!r.ok || !r.record.ran) return;
  const p = r.record.percentiles;
  assert.ok(p.p10 <= p.p25 && p.p25 <= p.median && p.median <= p.p75 && p.p75 <= p.p90,
    `percentiles out of order: ${JSON.stringify(p)}`);
});

/**
 * ── THE EXTREME MUST CARRY ITS REGIME ─────────────────────────────────────
 * The best seven-year window on HDB's index is +305.8%, 1990-Q1 to 1997-Q1 —
 * before ABSD, before the current SSD regime, before TDSR, off an index
 * reading 24.3 against today's 202.8. Printed as a headline it reads as an
 * attainable outcome, which is the exact failure the whole module exists to
 * avoid. It is kept — deleting the upside while keeping the downside would be
 * its own dishonesty — but it may never appear without the regime beside it.
 */
test('an extreme from the pre-2000 market cannot be reported without saying so', async () => {
  const { outlook } = await import('../lib/consult/outlook.js');
  const r = outlook(OUT_REC, { areaSqft: SQFT, years: 7, price: 500_000, now: ASOF });
  if (!r.ok || !r.record.ran) return;
  const R = r.record;
  assert.ok(R.extremes?.best && R.extremes?.worst, 'the extremes were dropped rather than demoted');
  assert.ok(R.regime, 'the record carries no regime note');
  if (R.regime.preModern > 0) {
    assert.match(R.regime.note, /ABSD|TDSR|SSD/,
      'windows predate the modern policy regime and the note does not name it');
    assert.match(R.regime.note, /upper tail|no longer exists/);
  }
  /* The best window is one observation out of many, and must not be the median. */
  assert.ok(R.extremes.best.change >= R.percentiles.p90,
    'a maximum below the 90th percentile means these are not the same windows');
});

test('cutting the record short refuses rather than answering thinly', async () => {
  const { outlook } = await import('../lib/consult/outlook.js');
  const r = outlook(OUT_REC, { areaSqft: SQFT, years: 7, price: 500_000, now: ASOF, since: '2013-Q3' });
  if (!r.ok || !r.record.ran) return;
  const sinceBlock = r.record.since;
  assert.ok(sinceBlock, '--since was given and the record ignored it');
  if (!sinceBlock.ran) {
    assert.match(sinceBlock.why, /four is the floor/i);
    assert.match(sinceBlock.why, /not enough history/i);
  } else {
    assert.ok(sinceBlock.independent >= 4, 'it ran on fewer than four independent readings');
  }
});

/* ── pasted listings ────────────────────────────────────────────────────── */

test('a pasted listing gives up price, size, storey and address', async () => {
  const { parseListing } = await import('../lib/consult/listing.js');
  const r = parseListing(`https://www.propertyguru.com.sg/listing/hdb-for-sale-12345
    Blk 649 Jln Tenaga
    S$858,000
    1,313 sqft (S$653 psf)
    #09-234 · 5 Room · 3 Beds`);
  assert.strictEqual(r.price, 858_000);
  assert.strictEqual(r.areaSqft, 1313);
  assert.strictEqual(r.floor, 9, 'the unit number is the most reliable storey in any listing');
  assert.strictEqual(r.unit, '#09-234');
  assert.match(r.addressLine, /649/);
  assert.ok(r.url.startsWith('https://'));
  assert.deepStrictEqual(r.missing, []);
});

/**
 * The commonest paste is a bare link, and it is the least useful one — a slug
 * carries an address at best. Saying so is the difference between a tool that
 * looks broken and one that tells you what it needs.
 */
test('a link on its own says what it cannot carry', async () => {
  const { parseListing } = await import('../lib/consult/listing.js');
  const r = parseListing('https://www.propertyguru.com.sg/listing/hdb-for-sale-649-jalan-tenaga-24771234');
  assert.ok(r.missing.includes('price') && r.missing.includes('areaSqft'));
  assert.match(r.note, /link on its own/i);
});

test('"high floor" is not read as a storey', async () => {
  const { parseListing } = await import('../lib/consult/listing.js');
  const r = parseListing('Blk 100 Some Road\nS$700,000\n1000 sqft\nHigh floor, unblocked view');
  assert.strictEqual(r.floor, null,
    'a marketing adjective became the input the storey curve is most sensitive to');
});

test('a price that is really a psf is refused', async () => {
  const { parseListing } = await import('../lib/consult/listing.js');
  assert.strictEqual(parseListing('Blk 1 Road\n$653 psf\n1313 sqft').price, null);
  assert.strictEqual(parseListing('Blk 1 Road\nS$1.28M\n1313 sqft').price, 1_280_000);
});

test('sqm is converted and says it was', async () => {
  const { parseListing } = await import('../lib/consult/listing.js');
  const r = parseListing('Blk 1 Road\nS$700,000\n122 sqm');
  assert.strictEqual(r.areaSqm, 122);
  assert.strictEqual(r.areaSqft, 1313);
  assert.strictEqual(r.found.areaSqft, 'sqm');
});

/**
 * An overstated area understates the psf, which the screener reads as a
 * discount and ranks at the top. Flagged against what the block has actually
 * filed, not against a rule of thumb.
 */
test('an implausible advertised size is flagged against filed sales', async () => {
  const { checkArea } = await import('../lib/consult/listing.js');
  const sales = [['2026-01', 600, 93, '4 ROOM', '07 TO 09'], ['2026-02', 610, 93, '4 ROOM', '10 TO 12'],
                 ['2026-03', 605, 94, '4 ROOM', '04 TO 06']];
  assert.strictEqual(checkArea({ areaSqft: 1001, sales, type: '4 ROOM' }).plausible, true);
  /* Both directions are wrong in useful ways, and each must say its OWN
     consequence — the first version hardcoded one of them and told a reader
     that an understated size understates the psf, which is backwards. */
  const tooBig = checkArea({ areaSqft: 1400, sales, type: '4 ROOM' });
  assert.strictEqual(tooBig.plausible, false);
  assert.match(tooBig.why, /larger/);
  assert.match(tooBig.why, /understates the psf/);
  const tooSmall = checkArea({ areaSqft: 700, sales, type: '4 ROOM' });
  assert.strictEqual(tooSmall.plausible, false);
  assert.match(tooSmall.why, /smaller/);
  assert.match(tooSmall.why, /overstates the psf/);
  assert.strictEqual(checkArea({ areaSqft: 1001, sales: [] }).ran, false);
});

/* ── REALIS import ──────────────────────────────────────────────────────── */

/**
 * The stack is the whole reason for a REALIS ingest. Units sharing one share
 * their orientation, corner-or-corridor position, outlook and noise exposure,
 * so a stack captures four unobservable attributes at once and none of them
 * ever has to be estimated. Without a unit number the export is the free URA
 * feed with extra steps.
 */
test('a unit number yields a floor and a stack', async () => {
  const { unitParts } = await import('../lib/consult/imports.js');
  assert.deepStrictEqual(unitParts('#08-123'), { floor: 8, stack: '123' });
  assert.deepStrictEqual(unitParts('#32-123'), { floor: 32, stack: '123' },
    'two floors of one stack must share a stack id — that is the comparison');
  assert.deepStrictEqual(unitParts('12-088'), { floor: 12, stack: '088' });
  assert.deepStrictEqual(unitParts(''), { floor: null, stack: null });
  assert.deepStrictEqual(unitParts('penthouse'), { floor: null, stack: null },
    'a word is not a floor');
});

/**
 * REALIS export columns vary by search type and have been renamed over the
 * years, so the importer is header-driven. A column quietly ignored is the
 * failure mode of every CSV importer ever written — the alias table is the
 * supported way to extend it, and anything unmatched is reported rather than
 * dropped in silence.
 */
test('the REALIS alias table covers the fields the ingest cannot work without', async () => {
  const { REALIS_ALIASES: ALIASES } = await import('../lib/consult/imports.js');
  for (const required of ['project', 'unit', 'areaSqm', 'price', 'date']) {
    assert.ok(Array.isArray(ALIASES[required]) && ALIASES[required].length,
      `${required} has no aliases — the ingest cannot map it`);
  }
  /* Aliases are compared after stripping punctuation and case, so any alias
     carrying either would never match anything. */
  for (const [field, list] of Object.entries(ALIASES)) {
    for (const a of list) {
      assert.strictEqual(a, a.toLowerCase().replace(/[^a-z0-9]/g, ''),
        `alias "${a}" for ${field} is not in normalised form and can never match`);
    }
  }
});

/** Licensed data must not be committable. The .gitignore entry goes in before
 *  the first export lands, not after somebody notices. */
test('REALIS exports and their derived index are gitignored', async () => {
  const gi = (await import('node:fs')).readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(gi, /^data\/realis\/$/m, 'the REALIS drop folder is not gitignored');
  assert.match(gi, /^data\/\.realis\.json$/m, 'the derived REALIS index is not gitignored');
});

/* ── the listings store ─────────────────────────────────────────────────── */

const LST = (url, price, extra = {}) => ({ url, price, href: '/hdb/testtown/1-test-rd', areaSqft: 1000, ...extra });

/**
 * ── THE ONE THAT WOULD DO REAL DAMAGE ─────────────────────────────────────
 * A FULL snapshot covers the whole watched market, so absence means gone. A
 * PARTIAL one — one town, one saved search, a pasted handful — says nothing
 * about anything it did not cover. Treating a partial as full retires most of
 * the store on every import, and the damage looks exactly like a market
 * signal: dozens of listings "disappearing" in a week.
 */
test('a partial snapshot never marks anything gone', async () => {
  const { emptyStore, merge } = await import('../lib/consult/listings.js');
  let st = merge(emptyStore(), [LST('u/1', 900_000), LST('u/2', 800_000)],
    { at: '2026-07-01T00:00:00Z' }).store;

  const partial = merge(st, [LST('u/1', 900_000)], { at: '2026-08-01T00:00:00Z', partial: true });
  assert.strictEqual(partial.gone, 0, 'a partial import retired a listing it never covered');
  assert.strictEqual(partial.store.listings['url:u/2'].status, 'active');

  const full = merge(partial.store, [LST('u/1', 900_000)], { at: '2026-09-01T00:00:00Z' });
  assert.strictEqual(full.gone, 1, 'a full sweep must retire what it did not find');
  assert.strictEqual(full.store.listings['url:u/2'].status, 'gone');
});

/** Disappearing is not selling, and the store may never imply otherwise. */
test('a vanished listing is never called sold', async () => {
  const { emptyStore, merge, summarise } = await import('../lib/consult/listings.js');
  let st = merge(emptyStore(), [LST('u/1', 900_000)], { at: '2026-07-01T00:00:00Z' }).store;
  st = merge(st, [], { at: '2026-08-01T00:00:00Z' }).store;
  const s = summarise(st.listings['url:u/1']);
  assert.strictEqual(s.status, 'gone');
  /* "sold" may appear, but only ever hedged. The first version of this
     assertion looked for "sold" not FOLLOWED by a hedge, and the hedge
     precedes it — so it failed on correct text. What matters is that the note
     never states it as fact. */
  assert.match(s.goneNote, /may have sold/i, 'the possibility must be named, and hedged');
  assert.doesNotMatch(s.goneNote, /\b(has sold|was sold|is sold|now sold)\b/i,
    'a vanished listing was reported as a completed sale');
  assert.match(s.goneNote, /withdrawn|expired|relisted/,
    'the other explanations must be named, or the hedge is decorative');
});

test('a listing is followed across snapshots, and its cuts counted', async () => {
  const { emptyStore, merge, summarise } = await import('../lib/consult/listings.js');
  let st = emptyStore();
  for (const [at, p] of [['2026-06-01', 900_000], ['2026-07-01', 880_000], ['2026-08-01', 850_000]]) {
    st = merge(st, [LST('u/1', p)], { at: `${at}T00:00:00Z` }).store;
  }
  const s = summarise(st.listings['url:u/1'], new Date('2026-09-01T00:00:00Z'));
  assert.strictEqual(s.cuts, 2);
  assert.strictEqual(s.firstPrice, 900_000);
  assert.ok(s.movePct < -0.05);
  assert.strictEqual(st.listings['url:u/1'].seenCount, 3);
});

/** A URL identifies a listing by construction; the fallbacks can collide, and
 *  which one was used has to travel so a collision is diagnosable. */
test('listings are keyed on the strongest identifier available', async () => {
  const { fingerprint } = await import('../lib/consult/listings.js');
  assert.strictEqual(fingerprint({ url: 'https://X/a?utm=1', href: '/h', unit: '#01-01' }).keyedBy, 'url');
  assert.strictEqual(fingerprint({ href: '/h', unit: '#01-01' }).keyedBy, 'unit');
  assert.strictEqual(fingerprint({ href: '/h', areaSqft: 1000 }).keyedBy, 'address+size+floor');
  assert.strictEqual(fingerprint({}), null, 'a listing with no identifier must not be stored');
  /* A query string must not fork one listing into two across snapshots. */
  assert.strictEqual(fingerprint({ url: 'https://X/a?utm=1' }).key, fingerprint({ url: 'https://x/a' }).key);
});

/**
 * Days on market is measured from when WE first saw it unless the feed
 * supplied a listed date. A listing up for six months before the first ingest
 * reads as new, and the figure must say which clock it came from.
 */
test('days on market says whether it is a floor or a fact', async () => {
  const { emptyStore, merge, summarise } = await import('../lib/consult/listings.js');
  const now = new Date('2026-09-01T00:00:00Z');
  let a = merge(emptyStore(), [LST('u/1', 900_000)], { at: '2026-08-01T00:00:00Z' }).store;
  assert.strictEqual(summarise(a.listings['url:u/1'], now).domIsFloor, true);

  let b = merge(emptyStore(), [LST('u/2', 900_000, { listedAt: '2026-03-01' })],
    { at: '2026-08-01T00:00:00Z' }).store;
  const s = summarise(b.listings['url:u/2'], now);
  assert.strictEqual(s.domIsFloor, false);
  assert.ok(s.days > s.daysKnown, 'a supplied listed date must beat the first-seen floor');
});

test('licensed listing exports are gitignored', async () => {
  const gi = (await import('node:fs')).readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(gi, /^data\/listings\/$/m);
  assert.match(gi, /^data\/\.listings\.json$/m);
});


/* ── importing, through either door ─────────────────────────────────────── */

import os from 'node:os';
const tmpRoot = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'consult-'));
  fs.mkdirSync(path.join(d, 'data', 'listings'), { recursive: true });
  fs.mkdirSync(path.join(d, 'data', 'realis'), { recursive: true });
  return d;
};

/**
 * ── THE RE-READ BUG ───────────────────────────────────────────────────────
 * The first CLI read every CSV in the drop folder on every run and moved
 * none. Week 2's run read week 1's file again, so a listing that had left the
 * market was seen again and never went gone. Reproduced before the fix:
 * snapshot 2 read 3 rows where it should have read 1.
 */
test('an imported listings file is archived and never read again', async () => {
  const { importListings, pendingListingFiles, archiveListingFiles, paths } = await import('../lib/consult/imports.js');
  const root = tmpRoot();
  const P = paths(root);
  const drop = (name, csv) => fs.writeFileSync(path.join(P.listingsDir, name), csv);
  const read = n => ({ name: n, text: fs.readFileSync(path.join(P.listingsDir, n), 'utf8') });

  drop('wk1.csv', 'Asking Price,Listing URL\n900000,https://x/a\n800000,https://x/b\n');
  let names = pendingListingFiles(root);
  assert.ok(importListings({ files: names.map(read), partial: false, root, at: '2026-07-01T00:00:00Z' }).ok);
  archiveListingFiles(names, { root, at: '2026-07-01T00:00:00Z' });
  assert.deepStrictEqual(pendingListingFiles(root), [], 'an imported file is still waiting to be read');

  drop('wk2.csv', 'Asking Price,Listing URL\n870000,https://x/a\n');
  names = pendingListingFiles(root);
  assert.deepStrictEqual(names, ['wk2.csv']);
  const r = importListings({ files: names.map(read), partial: false, root, at: '2026-07-08T00:00:00Z' });
  assert.strictEqual(r.rows, 1, 'week 1 was read again as part of week 2');
  const store = JSON.parse(fs.readFileSync(P.listingsStore, 'utf8'));
  assert.strictEqual(store.listings['url:https://x/b'].status, 'gone',
    'a listing that left the market was kept alive by an old file');
});

test('a full sweep is refused when a file is unreadable or empty', async () => {
  const { importListings } = await import('../lib/consult/imports.js');
  const root = tmpRoot();
  const junk = { name: 'broken.csv', text: 'nothing,we,recognise\n1,2,3\n' };
  const good = { name: 'ok.csv', text: 'Asking Price,Listing URL\n900000,https://x/a\n' };
  assert.strictEqual(importListings({ files: [good, junk], partial: false, root }).refused, true,
    'an unreadable file in a full sweep would retire every listing in it');
  assert.strictEqual(importListings({ files: [], partial: false, root }).refused, true,
    'an empty full sweep would mark every active listing gone');
  assert.strictEqual(importListings({ files: [good], root }).refused, true,
    'full or partial must be chosen, never defaulted');
  assert.strictEqual(importListings({ files: [good, junk], partial: true, root }).ok, true,
    'a partial import marks nothing gone, so a broken file in it harms nothing');
});

/**
 * 275A Bishan St 24 files 4-room flats at a median of 95 sqm and 5-room at 120.
 * The first check pooled them and flagged a correctly stated 93 sqm 4-room as
 * a mis-stated size — a false alarm that was shown to Shervin as a catch.
 */
test('the size check compares like with like, or does not run', async () => {
  const { sizeCheck, typeFromListing } = await import('../lib/consult/imports.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/hdb/bishan/275a-bishan-st-24');
  if (!rec) return;
  /* The mixed-type half needs the block to still file more than one flat type
     inside the window; when it no longer does, that half has nothing to test. */
  const types = rec.flatTypes || Object.keys(rec.byType || {});
  if (types.length > 1) {
    /* A mixed-type block with no stated type is checked only as the ONE type
       the size can belong to. The failure this guards was a correct 4-room
       flagged against a median taken mostly from 5-rooms; inferring the type
       from the size cannot do that, and it catches a size that fits no type
       at all, which refusing to check never could. */
    const c = sizeCheck(rec, 1001);
    if (c.ran) {
      assert.strictEqual(c.plausible, true, 'a correct 4-room was flagged when its type was not stated');
      assert.strictEqual(c.inferred, true);
    }
  }
  assert.strictEqual(sizeCheck(rec, 1001, '4 Room').plausible, true, 'a correct 4-room was flagged');
  assert.strictEqual(sizeCheck(rec, 1400, '4 Room').plausible, false, 'an oversized 4-room was missed');
  assert.strictEqual(typeFromListing('3 Bedroom'), null, 'a 3-bedroom is not a 3-room flat');
  assert.strictEqual(typeFromListing('5-rm HDB'), '5 ROOM');
});

test('an uploaded filename cannot leave the folder it is written to', async () => {
  const { safeName } = await import('../lib/consult/imports.js');
  for (const bad of ['../../app/page.jsx', '/etc/passwd', '..\\..\\x.csv', '.env.local']) {
    const n = safeName(bad);
    assert.ok(!n.includes('/') && !n.includes('\\') && !n.startsWith('.'), `${bad} became ${n}`);
    assert.match(n, /\.csv$/);
  }
});

/**
 * mapColumns gives a header to the FIRST field that claims it, so an alias
 * listed under two fields silently files a column under the wrong one. 'area'
 * was under both town and floor area, and a column headed "Area" went to town.
 */
test('no column alias is claimed by two fields', async () => {
  const { LISTING_ALIASES, REALIS_ALIASES } = await import('../lib/consult/imports.js');
  for (const [name, table] of [['listings', LISTING_ALIASES], ['REALIS', REALIS_ALIASES]]) {
    const owner = {};
    for (const [field, list] of Object.entries(table)) {
      for (const a of list) {
        assert.ok(!owner[a], `${name}: "${a}" is claimed by both ${owner[a]} and ${field}`);
        owner[a] = field;
        assert.strictEqual(a, a.toLowerCase().replace(/[^a-z0-9]/g, ''), `${name}: alias "${a}" can never match`);
      }
    }
  }
});

/** Overlapping exports carry the same transactions twice, and a duplicated
 *  sale inside a stack is one piece of evidence counted twice. */
test('REALIS transactions that appear in two exports are counted once', async () => {
  const { rebuildRealis, paths } = await import('../lib/consult/imports.js');
  const root = tmpRoot();
  const head = 'Project Name,Street Name,Unit No,Area (SQM),Transacted Price ($),Sale Date\n';
  const P = paths(root);
  fs.writeFileSync(path.join(P.realisDir, 'jan-jun.csv'), head + 'SAIL,MARINA,#08-123,66,1580000,Mar-26\nSAIL,MARINA,#10-123,66,1600000,Apr-26\n');
  fs.writeFileSync(path.join(P.realisDir, 'apr-sep.csv'), head + 'SAIL,MARINA,#10-123,66,1600000,Apr-26\nSAIL,MARINA,#32-123,66,1810000,Aug-26\n');
  const r = rebuildRealis({ root });
  assert.strictEqual(r.count, 3);
  assert.strictEqual(r.duplicates, 1);
  assert.strictEqual(r.stacks, 1);
});

/* ── the two holes that fell entirely on private ────────────────────────── */

/**
 * leaseRemaining returns Infinity for freehold, the check asked
 * Number.isFinite, and the BEST possible lease state fell through to "could
 * not measure" — so a freehold condo was scored out of 9 instead of 14 and
 * penalised by omission. Private carries almost all the freehold stock, so
 * the bug landed entirely on private.
 */
test('freehold scores full on lease, and still runs', async () => {
  const { score, FACTORS } = await import('../lib/consult/score.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/condo/1919');
  if (!rec) return;
  const lease = score(rec).factors.find(f => f.key === 'lease');
  assert.strictEqual(lease.ran, true, 'freehold fell through to "could not measure"');
  assert.strictEqual(lease.points, FACTORS.lease.max, 'no lease running down is the top of this scale');
  assert.match(lease.finding, /freehold/i);
});

/**
 * The supply factor counted HDB flats reaching their fifth year, so every
 * private lookup scored nothing and lost two points of DENOMINATOR. Competing
 * supply is the same question for a condo, asked of URA's pipeline instead.
 */
test('private gets a supply factor rather than a hole', async () => {
  const { score } = await import('../lib/consult/score.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const rec = recordByHref('/condo/the-sail-marina-bay');
  if (!rec) return;
  const s = score(rec);
  const sup = s.factors.find(f => f.key === 'supply');
  assert.strictEqual(sup.ran, true, 'private still has no supply factor');
  assert.match(sup.finding, /pipeline/i);
  /* It is ranked against other districts, not against an invented denominator —
     district housing stock is not held here. */
  assert.match(sup.finding, /against a spread of|Nothing in the URA pipeline/);
});

test('a private lookup is scored out of the same total as an HDB one', async () => {
  const { score, FACTORS } = await import('../lib/consult/score.js');
  const { recordByHref } = await import('../lib/data/query.js');
  const full = Object.values(FACTORS).reduce((a, f) => a + f.max, 0);
  for (const h of ['/condo/1919', '/condo/the-sail-marina-bay', '/hdb/punggol/271a-punggol-walk']) {
    const rec = recordByHref(h); if (!rec) continue;
    const s = score(rec);
    assert.strictEqual(s.max, full, `${rec.label} was scored out of ${s.max}, not ${full} — a factor is silently skipped`);
  }
});

/**
 * The panel's affordability form must ask who the loan is from.
 *
 * lib/calc/plan.js has taken `hdbLoan` since 30 Aug 2026 and the panel's own
 * /api/plan route passes it through — but the page never sent it, so every
 * lookup was silently assessed as a bank loan and carried a 5% cash floor
 * CPF cannot cover. On a S$820,000 flat that is S$16,000 of cash a buyer was
 * told they needed and did not.
 *
 * This reads the page source the same way test/motion.test.js does: Node does
 * not strip JSX or HTML, and a transform would cost more than the
 * three-dependency rule is worth.
 */
test('the panel asks who the loan is from, and sends the answer', () => {
  const ui = fs.readFileSync(new URL('../scripts/consult-ui.html', import.meta.url), 'utf8');
  assert.match(ui, /id="ploan"/, 'no "Loan from" control on the affordability form');
  assert.match(ui, /hdbLoan:\s*\$\('#ploan'\)\.value === 'hdb'/, 'the control exists but its answer is never sent');
  /* Gated: plan.js ignores hdbLoan unless propertyType is HDB, so leaving it
     visible on a private lookup offers a choice that changes nothing — the
     exact failure components/Planner.jsx records in its own comment. */
  assert.match(ui, /loanfromwrap'\)\.hidden = !isHdb/, 'the control is not gated to HDB flats');
});

test('the two loan types differ by the cash floor and nothing else', async () => {
  /* HDB's concessionary LTV was cut 80% -> 75% on 20 Aug 2024 and now sits
     level with the banks. If a future edit reintroduces an LTV difference —
     85% is the figure people reach for, and it was last correct in 2022 —
     this fails. */
  const { plan } = await import('../lib/calc/plan.js');
  const base = {
    price: 820000,
    applicants: [{ fixedIncome: 7600, age: 30 }, { fixedIncome: 4800, age: 29 }],
    cashAvailable: 80000, cpfAvailable: 180000, propertyType: 'HDB',
  };
  const bank = plan({ ...base, hdbLoan: false });
  const hdb = plan({ ...base, hdbLoan: true });

  assert.equal(bank.ltv.rate, hdb.ltv.rate, 'an LTV difference between HDB and bank has been reintroduced');
  assert.equal(bank.ltv.rate, 0.75);
  assert.equal(bank.loan, hdb.loan, 'the loan ceiling must not move with who lends');
  assert.equal(hdb.cashFloor, 0);
  assert.ok(bank.cashFloor > 0);
  assert.ok(bank.cashNeeded > hdb.cashNeeded,
    'the HDB loan must need less cash, or the floor is not being applied');
});

/**
 * Every numeric field in the panel reads through one helper.
 *
 * The Land page looked like a dead button because `1,323` — how a land price
 * is written, and how this panel PRINTS every figure it produces — became
 * NaN, fell through to 0, and the tool computed nothing and said nothing.
 * The valuation form's floor area had the identical hole. The cause was five
 * separate implementations of "read a number from a field", three of which
 * stripped punctuation and two of which did not.
 *
 * Read from source, the way test/motion.test.js does: Node does not strip
 * HTML and a transform would cost more than the three-dependency rule.
 */
test('no numeric field in the panel reads a value without stripping punctuation', () => {
  const ui = fs.readFileSync(new URL('../scripts/consult-ui.html', import.meta.url), 'utf8');
  const body = ui.slice(ui.indexOf('<script'));

  /* One definition, and it is the shared one. */
  const defs = [...body.matchAll(/replace\(\/\[\^0-9\.\]\/g/g)];
  assert.equal(defs.length, 1, `${defs.length} implementations of the numeric reader; there must be exactly one (toNum)`);
  assert.match(body, /const toNum = v =>/);
  assert.match(body, /const num = id => toNum\(\$\(id\)\.value\)/);

  /* And nothing reads a field raw. Selects hold digit-only values and are
     exempt; a free-text field is not. */
  const RAW_OK = new Set(['#years', '#pcount', '#loans']);
  for (const m of body.matchAll(/Number\(\$\('(#[a-z0-9]+)'\)\.value\)/g)) {
    assert.ok(RAW_OK.has(m[1]),
      `${m[1]} is read with Number() and no stripping — type "1,323" into it and the tool silently computes nothing`);
  }
});

test('the panel honours prefers-reduced-motion on every scroll it performs', () => {
  /* The site has Motion.jsx's still() and test/motion.test.js guards it. The
     panel is standalone vanilla JS and cannot import it, so it carries its
     own — and a raw scrollIntoView here would bypass it silently. */
  const ui = fs.readFileSync(new URL('../scripts/consult-ui.html', import.meta.url), 'utf8');
  const body = ui.slice(ui.indexOf('<script'));
  assert.match(body, /const still = \(\) => window\.matchMedia/);
  assert.match(body, /const reveal = el => el\.scrollIntoView/);
  const raw = [...body.matchAll(/scrollIntoView/g)];
  assert.equal(raw.length, 1, 'every viewport movement must go through reveal(), which asks first');
});
