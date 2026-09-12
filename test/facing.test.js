/**
 * A refusal must not parse as a bearing.
 *
 * /api/ai/floorplan reads a north arrow off an uploaded plan and reports a
 * facing in words, and it refuses when there is no arrow — the note it writes
 * in that case is "the plan carries no north arrow". The first version of
 * bearingOf() read that sentence as facing NORTH, at 0°, because the word is
 * in it. A refusal turned into a confident bearing by the code written to
 * prevent exactly that.
 *
 * About half of Singapore marketing plans carry no arrow, so this is the
 * common path, not the edge case.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { bearingOf } from '../lib/facing.js';
import { sunOnFacing, sunsetByMonth, DIRECTNESS, SG } from '../lib/sun.js';

test('a sentence saying the plan has no arrow is not a facing', () => {
  for (const s of [
    'the plan carries no north arrow',
    'no north arrow is shown',
    'cannot tell — no compass on the drawing',
    'orientation not marked',
    'without a north arrow the facing is unknown',
    'no compass rose, unclear',
  ]) {
    assert.strictEqual(bearingOf(s), null, `"${s}" parsed as a bearing`);
  }
});

test('two facings is not a facing', () => {
  // A through-unit. Taking the first would report half of it as the whole.
  assert.strictEqual(bearingOf('north east and south west'), null);
  assert.strictEqual(bearingOf('the north arrow points up, unit faces south'), null);
});

test('a compound reading is not truncated to its first half', () => {
  // "north-north-east" contains "north east". Matching the shorter one first
  // reads NNE as NE, which is 22.5° — two directness bands at the tight end.
  assert.strictEqual(bearingOf('north-north-east').point, 'NNE');
  assert.strictEqual(bearingOf('north-north-east').bearing, 22.5);
  assert.strictEqual(bearingOf('west-south-west').point, 'WSW');
});

test('the readings a model actually writes all parse', () => {
  const expect = {
    'north-east': 45, 'NNE': 22.5, 'faces south west': 225, 'W': 270,
    'west': 270, 'northeast': 45, 'SE-facing living room': 135,
    'the balcony looks WSW': 247.5,
  };
  for (const [s, deg] of Object.entries(expect)) {
    const r = bearingOf(s);
    assert.ok(r, `"${s}" did not parse`);
    assert.strictEqual(r.bearing, deg, `"${s}" read as ${r.bearing}°`);
  }
});

/* An abbreviation search that is a loose substring match finds "sw" inside
   "answer" and reports a south-west facing from a sentence about a question. */
test('an abbreviation is a word, not a substring', () => {
  assert.strictEqual(bearingOf('answer'), null);
  assert.strictEqual(bearingOf('there is no answer here'), null);
});

/* ── the astronomy ───────────────────────────────────────────────────────── */

/**
 * A north-east facing never takes the low afternoon sun, because the sun sets
 * between 246° and 293° over the year and NE is 45°. If this ever returns a
 * lit month, the offset maths has been inverted.
 */
test('a facing outside the sunset arc is never lit', () => {
  const y = sunOnFacing(bearingOf('north-east').bearing, { year: 2026 });
  assert.strictEqual(y.monthsClear.length, 12, 'a north-east facing was reported as sunlit');
  assert.strictEqual(y.closest, null);
});

test('due west takes the sun square on at the equinox', () => {
  const y = sunOnFacing(270, { year: 2026 });
  assert.strictEqual(y.monthsClear.length, 0, 'due west was reported as missing the sun');
  assert.ok(y.closest.offset < 10,
    `due west is ${y.closest.offset.toFixed(1)}° off at its closest; the sun crosses due west twice a year`);
  assert.strictEqual(y.closest.band, 'dead');
});

test('a facing that cannot be read produces nothing, not a year of nulls', () => {
  // "not shown" and "the sun never reaches it" are different sentences and the
  // page must never print the second when the first is true.
  assert.strictEqual(sunOnFacing(null), null);
  assert.strictEqual(sunOnFacing(undefined), null);
  assert.strictEqual(sunOnFacing('west'), null, 'a string was accepted as a bearing');
});

test('every month lands in a band the page knows how to name', () => {
  const ids = new Set(DIRECTNESS.map(b => b.id));
  for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
    for (const m of sunOnFacing(deg, { year: 2026 }).months) {
      assert.ok(ids.has(m.band), `facing ${deg}° month ${m.month} produced band "${m.band}"`);
      assert.ok(m.label, 'a band arrived without a label');
    }
  }
});

/**
 * An uploaded plan has no address, so the answer is computed from Singapore's
 * centroid. That is only honest if the island is small enough for it not to
 * matter — measured here rather than asserted in a comment.
 */
test('one coordinate answers for the whole island', () => {
  const south = sunsetByMonth(1.16, 103.8, 2026);
  const north = sunsetByMonth(1.47, 103.8, 2026);
  const worst = Math.max(...south.map((s, i) => Math.abs(s.azimuth - north[i].azimuth)));
  const narrowest = DIRECTNESS[0].upTo;
  assert.ok(worst < narrowest / 10,
    `the sunset bearing varies ${worst.toFixed(3)}° across Singapore, against a narrowest band of ${narrowest}°`);
  assert.ok(SG.lat > 1.1 && SG.lat < 1.5, 'SG.lat is not in Singapore');
});
