/**
 * The daily desk piece.
 *
 * The model receives a finding that has already been measured and writes
 * around it. These tests are about the seams — the places where a figure
 * could get invented, a localhost URL could reach production, or the caveat
 * could quietly stop being mandatory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(path.join(process.cwd(), 'scripts', 'desk.mjs'), 'utf8');

test('the model is told the figures are fixed and may not add to them', () => {
  assert.match(src, /THE FIGURES ARE FIXED/, 'the constraint that keeps a model from assigning a number is gone');
  assert.match(src, /may not add, estimate/i);
  assert.match(src, /topFinding\(\)/, 'the story is no longer chosen by arithmetic');
});

test('the caveat is not optional', () => {
  // A finding carries a caveat when the measurement cannot separate two
  // explanations — a median moving because prices moved, or because the mix
  // did. A piece that omits it is misleading by arithmetic.
  assert.match(src, /THE CAVEAT IS NOT OPTIONAL/);
  assert.match(src, /CAVEAT \(must appear in the piece\)/);
});

test('a quiet day files nothing', () => {
  assert.match(src, /Nothing scored high enough[\s\S]{0,60}process\.exit\(0\)/,
    'the generator no longer exits cleanly when there is nothing to write');
});

/**
 * .env.local points the site URL at localhost. The chart is embedded as an
 * absolute URL, so filing from a laptop would bake http://localhost:3000 into
 * a row and render a broken image for every reader — visible only after
 * publishing.
 */
test('it refuses to file a localhost chart URL', () => {
  assert.match(src, /localhost\|127\\\.0\\\.0\\\.1/,
    'the localhost guard is gone; a laptop run can now publish broken images');
  const guard = src.slice(src.indexOf('!DRY &&'), src.indexOf('!DRY &&') + 400);
  assert.match(guard, /process\.exit\(1\)/, 'the guard warns but does not stop');
});

test('the chart is built from measured values, not by the model', () => {
  // A model asked to build the chart URL would be writing figures into a
  // query string, which is assigning numbers by another route.
  assert.match(src, /function chartFor/);
  assert.match(src, /\{\{CHART\}\}/, 'the placeholder the model may use is gone');
  assert.doesNotMatch(src, /"chart_url"|chartUrl.*from the model/i);
});

test('the source is the subject page, where every figure can be checked', () => {
  assert.match(src, /source_urls: \[`\$\{SITE\}\$\{finding\.href\}`\]/,
    'the piece no longer cites where its figures can be verified');
});

test('the three failure modes of the writer are told apart', () => {
  // claude() returns null with no key, { error } on a failure, { text } on
  // success. Collapsing those into one message sends somebody looking for a
  // network fault when the key is simply missing.
  assert.match(src, /ANTHROPIC_API_KEY is not set/);
  assert.match(src, /reply\.error/);
  assert.match(src, /did not return usable JSON/);
});

/**
 * The schedule is separate from the data refresh on purpose: that job must go
 * red on whether the DATA refreshed, and a model having a bad morning turning
 * it red is how the SORA signal was lost — a fortnight of identical failures
 * nobody reads.
 */
test('the desk runs on its own schedule, after the data it reads', () => {
  const wf = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'desk.yml'), 'utf8');
  const refresh = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'refresh-data.yml'), 'utf8');

  const hourOf = y => Number(/cron: '(\d+) (\d+)/.exec(y)?.[2]);
  assert.ok(hourOf(wf) > hourOf(refresh),
    'the desk runs before the refresh it reads from, so it would write about yesterday');

  assert.doesNotMatch(refresh, /npm run desk/,
    'the writer is back inside the data job; a bad morning will now fail the refresh');
  assert.match(wf, /npm run desk/);
});

test('the schedule files a draft and cannot publish', () => {
  const wf = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'desk.yml'), 'utf8');
  assert.doesNotMatch(wf, /studio\/publish|status.*published/i,
    'the scheduled job can publish; a person pressing a button is the whole point of drafts');
});

/**
 * The longest bar ran to the canvas edge and its own value label fell off —
 * "907 psf" rendered as "9(" on the first chart anybody looked at. The longest
 * bar is by definition the one the chart exists to show, so the clipped label
 * was always the one that mattered.
 */
test('the chart reserves room for the value at the end of the longest bar', () => {
  const chart = readFileSync(path.join(process.cwd(), 'app', 'chart', 'route.js'), 'utf8');
  assert.match(chart, /const VALUE = \d+/, 'no space is reserved for the value labels');
  assert.match(chart, /const track = W - PAD \* 2 - LABEL - VALUE/,
    'the track is back to filling the canvas, so the longest label clips again');

  // The geometry, checked rather than trusted.
  /* No RegExp constructor. `\\d` inside a template literal reaches it as an
     escaped backslash rather than a digit class — the same double-escaping
     that made test/blindspot.test.js pass while matching nothing, found this
     morning and reproduced here within the hour. A literal cannot do it. */
  const nums = Object.fromEntries([...chart.matchAll(/\b([A-Z]+) = (\d+)/g)].map(m => [m[1], Number(m[2])]));
  const num = n => { assert.ok(nums[n] !== undefined, `${n} is no longer a plain constant`); return nums[n]; };
  const W = num('W'), PAD = num('PAD'), LABEL = num('LABEL'), VALUE = num('VALUE');
  const longestBarEnds = PAD + LABEL + (W - PAD * 2 - LABEL - VALUE);
  assert.ok(W - longestBarEnds >= 60,
    `only ${W - longestBarEnds}px left after the longest bar — a value label needs more`);
});

/**
 * The photograph is atmosphere, and must never look like evidence.
 *
 * A stock image cannot show the block an article is about, and one that looks
 * like it might is worse than none. The search terms are general on purpose —
 * the city, not the subject.
 */
test('the photograph is searched by the city, never by the subject', () => {
  const fn = /async function photograph\(\)[\s\S]*?\n\}/.exec(src);
  assert.ok(fn, 'photograph() moved — check this test still describes it');
  assert.doesNotMatch(fn[0], /finding\.|subject|\$\{f\./,
    'the photo query is built from the article subject; a stock image must not imply it shows the place');
  assert.match(fn[0], /singapore/i);
});

test('a missing key costs the photograph, not the article', () => {
  const fn = /async function photograph\(\)[\s\S]*?\n\}/.exec(src)[0];
  assert.match(fn, /if \(!key\) return null/, 'no key now throws instead of filing without a picture');
  assert.match(fn, /catch/, 'an Unsplash outage would take the whole run down');
});

test("Unsplash's two terms travel with the photo", () => {
  // Credit with a link, and a ping to the download endpoint on every use.
  // The webhook honours both and drops the image if the credit is missing —
  // this only has to pass the fields through, and forgetting one silently
  // breaks the licence rather than the build.
  for (const field of ['unsplash_photographer_name', 'unsplash_photographer_profile_url',
                       'unsplash_download_location']) {
    assert.ok(src.includes(field), `${field} is not being sent; the licence terms are not met`);
  }
});

test('the desk workflow passes the key through', () => {
  const wf = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'desk.yml'), 'utf8');
  assert.match(wf, /UNSPLASH_ACCESS_KEY:\s+\$\{\{ secrets\.UNSPLASH_ACCESS_KEY \}\}/,
    'the scheduled run has no key, so every piece it files will be unillustrated');
});
