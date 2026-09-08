/**
 * Three statistics that need a distribution, printed over a distribution of one.
 *
 * 985 records carry exactly one filed transaction and 3,056 carry fewer than
 * four — 21% of the site. A single sale rendered as:
 *
 *     $527 — $527 psf          a range whose ends are the same number
 *     0% Spread, low to high   which reads as a very tight market
 *     S$380k Median price      a median of one
 *     1 Filed transactions     plural, on one
 *
 * with a note underneath calling the spread "the real one — the cheapest and
 * dearest psf actually filed here".
 *
 * Nothing was wrong with the FIGURE. What was wrong was describing it as a
 * range, a median and a spread, which are claims about a distribution that
 * does not exist. This is the same rule the rest of the site already follows:
 * a check that cannot run scores nothing and says so.
 *
 * Asserted against the source, for the reason given at the top of
 * test/motion.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Comments stripped first. The explanatory note above each fix QUOTES the old
 * output — "0% Spread, low to high" — so an indexOf over the raw file finds
 * the comment rather than the JSX and asserts against prose. That has now
 * caught three source-reading tests on this site; the rule is that a test
 * about what a reader sees must not read the parts a reader cannot.
 */
const stripComments = s => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const src = stripComments(
  readFileSync(path.join(process.cwd(), 'components', 'RecordView.jsx'), 'utf8'));

test('a single filed sale is not called a range, a median or a spread', () => {
  for (const label of ['Observed range', 'Median price', 'Spread, low to high']) {
    const i = src.indexOf(label);
    assert.notEqual(i, -1, `"${label}" is gone — this test needs rewriting, not deleting`);
    /* Each must sit on the many-sales side of a decision about rv.n. Looking
       backwards is enough: the guard is written just above the label. */
    const before = src.slice(Math.max(0, i - 420), i);
    assert.match(before, /rv\.n === 1/,
      `"${label}" renders without asking whether there is more than one sale`);
  }
});

test('the transaction count is not pluralised on one', () => {
  assert.match(src, /Filed transaction\{rv\.n === 1 \? '' : 's'\}/,
    'the count reads "1 Filed transactions" again');
});

test('a spread of zero is not printed as a finding', () => {
  const i = src.indexOf('Spread, low to high');
  const around = src.slice(Math.max(0, i - 420), i + 60);
  assert.match(around, /kpinone/,
    'a one-sale record prints a computed 0% spread, which reads as a tight market');
});

test('the note under the list does not promise a spread that is not there', () => {
  const i = src.indexOf('Why a range, not one number');
  assert.notEqual(i, -1);
  const before = src.slice(Math.max(0, i - 600), i);
  assert.match(before, /rv\.n === 1/,
    'the "the spread above is the real one" note renders even when there is one sale');
});
