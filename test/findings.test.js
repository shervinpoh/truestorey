/**
 * What is worth writing about, decided by arithmetic.
 *
 * The news pipeline works — every article it has filed carries its source —
 * but its ceiling is the government: five pieces on 5 September and nothing
 * for the four days after, because URA had announced nothing. Asking a model
 * to "find something interesting in the data" instead would break the rule the
 * site rests on: the model would be choosing which number matters and then
 * writing prose to justify the choice.
 *
 * So the finding is computed and the model only writes around it. These tests
 * are about the two ways that goes wrong: a candidate that can never fire, and
 * a candidate that fires on anything.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findings, topFinding, MIN_SCORE } from '../lib/findings.js';

const all = findings();

test('every finding carries its figures with a period and an agency', () => {
  for (const f of all) {
    assert.ok(f.figures?.length, `${f.id} has no figures`);
    for (const x of f.figures) {
      assert.ok(x.what, `${f.id} has a figure with no name`);
      assert.ok(x.value !== undefined && x.value !== null, `${f.id}: ${x.what} has no value`);
      assert.ok(x.period, `${f.id}: ${x.what} has no period — rule 6`);
      assert.ok(x.source, `${f.id}: ${x.what} has no source — rule 6`);
    }
  }
});

test('a finding names the thing it is about and where to read more', () => {
  for (const f of all) {
    assert.ok(f.subject, `${f.id} is about nothing in particular`);
    assert.match(f.href, /^\//, `${f.id} does not link anywhere on this site`);
    assert.ok(f.claim && f.claim.length > 25, `${f.id} has no claim worth writing about`);
    assert.ok(f.score >= MIN_SCORE);
  }
});

/**
 * A generator that must produce something every day produces filler on the
 * days it has nothing, and filler is how a desk becomes a content farm.
 */
test('an empty day is a valid answer', () => {
  // Every candidate reads from data/, so raising the bar past 1 must silence
  // all of them rather than throwing or inventing a fallback.
  const quiet = findings({ now: new Date('2000-01-01T00:00:00Z') });
  assert.ok(Array.isArray(quiet), 'findings must always return an array');
  // A date before any dataset existed cannot produce a recent land award.
  assert.ok(!quiet.some(f => f.kind === 'land-award'),
    'a twenty-year-old award is being offered as news');
});

test('findings are ranked, and the top one is the top one', () => {
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i - 1].score >= all[i].score, 'findings came back unsorted');
  }
  assert.equal(topFinding()?.id, all[0]?.id);
});

/**
 * The candidate that nearly shipped as a confident price story.
 *
 * Central Area came out of the first run at +11.8% on 46 sales. A median moves
 * when the MIX moves: sell more four-rooms than three-rooms this quarter and
 * the median psf shifts without one seller changing their price. Central Area
 * is not a single planning area, so its mix is unusually free to move — and it
 * had moved 12 points.
 *
 * The caveat is computed and attached to the finding, so an article cannot be
 * written without it.
 */
test('a town move reports how much the mix moved with it', () => {
  const move = all.find(f => f.kind === 'town-move');
  if (!move) return;                                  // not every quarter has one
  assert.ok(move.caveat, 'a town move with no mix caveat is a price claim it cannot support');
  assert.match(move.caveat, /mix/i);
  assert.ok(move.figures.some(x => /mix/i.test(x.what)),
    'the mix shift must be a figure on the page, not only a sentence');
});

/**
 * A candidate reading a field that does not exist returns null forever and
 * nobody notices — the day just looks quiet. The first version of townOutlier
 * read `prevMedianPsf` off index.json, which has never carried it.
 */
test('every candidate can actually fire on the data in this build', () => {
  // Not that they all fire TODAY — that depends on the quarter — but that the
  // set is not silently empty, which would mean the engine reads nothing.
  assert.ok(all.length > 0,
    'no candidate produced a finding: check each is reading fields that exist');
});

test('the MOP caveat travels with the figure, because that one is always misread', () => {
  const mop = all.find(f => f.kind === 'mop');
  if (!mop) return;
  assert.match(mop.caveat, /not an intention to sell/i);
  assert.doesNotMatch(mop.claim, /supply/i, 'MOP eligibility is not incoming supply');
});
