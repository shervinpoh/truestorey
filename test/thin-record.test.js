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
  assert.match(src, /rv\.n === 1 \? 'The one filed sale' : 'Observed range'/,
    'the range label no longer distinguishes one sale from a distribution');

  const branch = src.match(/rv\.n === 1\s*\? <>([\s\S]*?)<\/>\s*: <>/);
  assert.ok(branch, 'could not find the one-sale rendering branch');
  assert.match(branch[1], /one filed transaction/,
    'the one-sale evidence is no longer described as one transaction');
  const copy = branch[1].replace(/\{[^}]*\}/g, '');
  assert.doesNotMatch(copy, /range|median|spread/i,
    'one filed sale is again being described with a distribution statistic');
});

test('the transaction count is not pluralised on one', () => {
  assert.match(src, /one filed transaction/,
    'the one-sale branch no longer uses a singular transaction label');
  assert.match(src, /\{rv\.n\} filed transactions/,
    'the many-sale branch no longer says how many filings support it');
});

test('a spread of zero is not printed as a finding', () => {
  assert.match(src, /const spread = rv\.n === 1\s*\? null\s*:/,
    'a one-sale record computes a 0% spread, which reads as a tight market');
  const branch = src.match(/rv\.n === 1\s*\? <>([\s\S]*?)<\/>\s*: <>([\s\S]*?)<\/>\}/);
  assert.ok(branch, 'could not find both record-summary branches');
  assert.doesNotMatch(branch[1], /\{spread\}/,
    'the one-sale branch prints a spread even though none can be measured');
  assert.match(branch[2], /\{spread\}% low to high/,
    'the many-sale branch no longer explains the observed spread');
});

test('the first screen does not repeat the same filed figures in a KPI strip', () => {
  assert.doesNotMatch(src, /className="kpi3"/,
    'the record summary again repeats price, count and spread beneath the same evidence');
  assert.doesNotMatch(src, /<p className="meta">/,
    'a second metadata line again repeats the masthead and summary');
  assert.match(src, /className="r record-range"/,
    'the supporting evidence is no longer consolidated beside the headline figure');
});

test('the note under the list does not promise a spread that is not there', () => {
  const i = src.indexOf('Why a range, not one number');
  assert.notEqual(i, -1);
  const before = src.slice(Math.max(0, i - 600), i);
  assert.match(before, /rv\.n === 1/,
    'the "the spread above is the real one" note renders even when there is one sale');
});
