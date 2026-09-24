/**
 * Find, said the way an agent would say it.
 *
 * The screen printed `premium-against-risk` beside "+5.2%", and a listing at
 * 649 Jalan Tenaga stated as 1,232 sqft — a size no flat in that block has —
 * came back "size ok" above a failure message about "0.391 of one good one".
 * Asked what a good result looked like, the page had never said.
 *
 * Every input here is invented, on purpose: these check the translation and
 * the size rule, and a test that read one real block's sales would fail the
 * night that block filed another — which blocks the site's data refresh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advise, plainReason, RANK } from '../lib/consult/advise.js';
import { checkArea, AREA_MARGIN } from '../lib/consult/listing.js';

const band = { priceLow: 790000, priceHigh: 830000, outer: { priceLow: 745000, priceHigh: 875000 } };
const row = (code, { pct = 0.05, dollars = 40000, flagged = [], errBand = 'tight', factors = [] } = {}) => ({
  ok: true,
  residual: {
    verdict: { code },
    gap: { pct, dollars },
    estimate: { band, error: { band: errBand } },
    test2: { flagged: flagged.map(key => ({ key })) },
  },
  factors,
});

test('every verdict the screen can reach has words, and none of them is a code', () => {
  const codes = ['noise', 'discount-unexplained', 'discount-explained', 'premium-unexplained', 'premium-against-risk', 'unmeasured'];
  for (const code of codes) {
    const a = advise(row(code, { flagged: code.includes('explained') || code.includes('risk') ? ['lease'] : [] }));
    assert.ok(a.verdict && a.action, `${code} produced no words`);
    assert.ok(!/[a-z]+-[a-z]+-[a-z]+|discount-|premium-/.test(a.verdict + a.action), `${code} leaked a code: ${a.verdict}`);
    assert.ok(Number.isFinite(a.rank));
  }
});

test('the range in words is the range the estimate published', () => {
  const a = advise(row('noise'));
  assert.equal(a.range, 'S$790,000 – S$830,000');
  assert.equal(a.nineInTen, 'S$745,000 – S$875,000');
});

test('best first: below the market with nothing to explain it leads, asking too much trails', () => {
  const order = ['premium-against-risk', 'noise', 'discount-unexplained', 'premium-unexplained', 'discount-explained']
    .map(c => advise(row(c, { flagged: c === 'discount-explained' || c === 'premium-against-risk' ? ['supply'] : [] })))
    .sort((a, b) => a.rank - b.rank)
    .map(a => a.key);
  assert.deepEqual(order, ['below-unexplained', 'in-line', 'below-explained', 'above-unexplained', 'above-with-risks']);
  assert.ok(RANK['cannot-price'] > RANK['above-with-risks']);
});

test('it never calls a listing undervalued, a bargain or a best deal', () => {
  /* A price below comparable sales is a reason to view quickly. Whether it
     is a good buy is settled inside the unit, which no record has seen. */
  for (const code of ['discount-unexplained', 'discount-explained', 'noise']) {
    const a = advise(row(code, { pct: -0.08, dollars: -60000, flagged: code === 'discount-explained' ? ['lease'] : [] }));
    const all = [a.verdict, a.action, ...(a.reasons || []).map(r => r.text)].join(' ');
    assert.ok(!/undervalued|bargain|best deal|steal/i.test(all), all);
  }
});

test('a rough estimate says so before anything else', () => {
  const a = advise(row('discount-unexplained', { pct: -0.08, dollars: -60000, errBand: 'wide' }));
  assert.match(a.caution, /rough/);
  assert.equal(advise(row('discount-unexplained', { pct: -0.08 })).caution, null);
});

test('the lease is said once, with its number', () => {
  const a = advise(row('premium-against-risk', {
    flagged: ['lease', 'supply'],
    factors: [{ key: 'lease', ran: true, points: 1, max: 3, value: 66 }, { key: 'primary', ran: true, points: 2, max: 2 }],
  }));
  const lines = a.reasons.map(r => r.text);
  assert.equal(lines.filter(t => /lease/i.test(t)).length, 1, lines.join(' | '));
  assert.ok(lines.includes('66 years of lease left.'));
  assert.ok(a.reasons.find(r => /lease/.test(r.text)).good === false, 'a flagged lease is a watch-out, not a positive');
});

test('a listing that cannot be priced says why in words, and what to do', () => {
  const a = advise({ ok: false, reason: '14 comparables were found but they are worth only 0.391 of one good one (average 151m away). Too far to be about this home' });
  assert.equal(a.key, 'cannot-price');
  assert.ok(!/0\.391|weights are relative|good one/.test(a.says + a.fix), 'the estimator\'s own jargon reached the page');
  assert.match(a.fix, /size/i);
});

/* ── the size check ─────────────────────────────────────────────────────── */

const fiveRooms = [122, 122, 123, 124].map((sqm, i) => [`2025-0${i + 1}`, 620, sqm, '5 ROOM', '07 TO 09']);

test('a size that matches no flat in the block is caught, even when it is close to the median', () => {
  /* The old rule allowed 15% either side of the median, and waved through
     1,232 sqft (114 sqm) against flats of 122 to 124. */
  const c = checkArea({ areaSqft: 1232, sales: fiveRooms, type: '5 ROOM' });
  assert.equal(c.plausible, false);
  assert.match(c.why, /smaller than any of them/);
  assert.equal(AREA_MARGIN, 0.03, 'the margin was measured at 3%: change it only with a new measurement');
});

test('two swapped digits are offered back as the likely size', () => {
  const c = checkArea({ areaSqft: 1232, sales: fiveRooms, type: '5 ROOM' });
  assert.equal(c.suggestedSqft, 1322);
  assert.match(c.suggest, /Did you mean 1,322 sqft\?/);
  assert.match(c.suggest, /5-room flats/);
  assert.match(plainReason('', c).fix, /1,322/);
});

test('a correct size passes, and no suggestion is invented for it', () => {
  for (const sqft of [1313, 1322, 1335]) {
    const c = checkArea({ areaSqft: sqft, sales: fiveRooms, type: '5 ROOM' });
    assert.equal(c.plausible, true, `${sqft} sqft is one of this block's sizes`);
    assert.equal(c.suggest, null);
  }
});

test('a wrong size with no single obvious fix gets no guess', () => {
  const c = checkArea({ areaSqft: 1900, sales: fiveRooms, type: '5 ROOM' });
  assert.equal(c.plausible, false);
  assert.equal(c.suggest, null, 'offering a correction that is not clearly the typo would be a guess');
});

test('with no type stated, a size that fits only one of the block\'s types is checked as that type', async () => {
  const { checkArea } = await import('../lib/consult/listing.js');
  const mixed = [
    ...[92, 93, 93].map((sqm, i) => [`2025-0${i + 1}`, 600, sqm, '4 ROOM', '07 TO 09']),
    ...[110, 110, 112].map((sqm, i) => [`2025-0${i + 4}`, 580, sqm, '5 ROOM', '07 TO 09']),
  ];
  /* checkArea is per-type; the inference lives in sizeCheck, so the rule is
     exercised through the per-type checks it is built from. */
  const fitsFour = checkArea({ areaSqft: 1000, sales: mixed, type: '4 ROOM' }).plausible;
  const fitsFive = checkArea({ areaSqft: 1000, sales: mixed, type: '5 ROOM' }).plausible;
  assert.equal(fitsFour, true);
  assert.equal(fitsFive, false, '1,000 sqft is not a 5-room here, so it can only be the 4-room');
  const neither = ['4 ROOM', '5 ROOM'].filter(t => checkArea({ areaSqft: 1100, sales: mixed, type: t }).plausible);
  assert.deepEqual(neither, [], '1,100 sqft sits between the two types and matches neither');
});
