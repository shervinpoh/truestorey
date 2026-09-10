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
/* photograph() lives in lib/ so the backfill can reuse it — one fetch, one
   Singapore check, one place to get the licence terms right. */
const photoSrc = readFileSync(path.join(process.cwd(), 'lib', 'photo.js'), 'utf8');

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
/*
 * This used to read "searched by the city, never by the subject", and the
 * second half is the one that matters. A stock photograph cannot show the
 * block, plot or project a piece is about, so the article's own words must
 * never reach Unsplash — search "Marina Gardens Lane" and whatever comes back
 * gets read as a picture of Marina Gardens Lane.
 *
 * The first half was over-correction. Searching nothing but the city meant a
 * lease piece, a tender piece and a stamp duty piece drew from one pool of
 * five terms, and the editorial page filled with Marina Bay. The query now
 * comes from a fixed table keyed by subject, so it is still never built from
 * the article text. photo-subject.test.js proves that against a stubbed
 * search; this proves the query cannot be built from an argument at all.
 */
test('the query comes from the table, never from the article', () => {
  const fn = /export async function photograph\([\s\S]*?\n\}/.exec(photoSrc);
  assert.ok(fn, 'photograph() moved — check this test still describes it');
  const body = fn[0].replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.doesNotMatch(body, /encodeURIComponent\(\s*(about|also)\b/,
    'the article text is being encoded into the search URL');
  assert.match(body, /subjectFor\(about, also\)/,
    'the subject is no longer resolved from the table');
  assert.match(body, /pick\(\s*subject\.queries\s*\)/,
    'the query is no longer taken from the subject table');
});

test('a missing key costs the photograph, not the article', () => {
  const fn = /export async function photograph\([\s\S]*?\n\}/.exec(photoSrc)[0];
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
    assert.ok(src.includes(field) || photoSrc.includes(field),
      `${field} is not being sent; the licence terms are not met`);
  }
});

test('the desk workflow passes the key through', () => {
  const wf = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'desk.yml'), 'utf8');
  assert.match(wf, /UNSPLASH_ACCESS_KEY:\s+\$\{\{ secrets\.UNSPLASH_ACCESS_KEY \}\}/,
    'the scheduled run has no key, so every piece it files will be unillustrated');
});

/**
 * A search for "singapore hdb" returns apartment blocks, and plenty of them
 * are in Hong Kong, Kuala Lumpur or Seoul. On a site whose whole claim is that
 * its figures come from Singapore's own agencies, a photograph of somewhere
 * else is a small lie at the top of the page — and one a reader who knows the
 * city spots immediately.
 *
 * That rule now has two halves, because the picture is chosen by subject: a
 * photograph of a PLACE must be Singapore, and a photograph of a THING must
 * name nowhere else. test/photo-subject.test.js exercises both against a
 * stubbed search. These two only check that the machinery is still there,
 * because it is reachable from here and cheap to lose in a refactor.
 */
test('both halves of the country rule are still in the file', () => {
  const code = photoSrc.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.match(code, /\/search\/photos/,
    'back to /photos/random, which returns one loosely-matched photo with no way to check it');
  assert.match(code, /location\?\.country/, 'the location field is no longer checked');
  assert.match(code, /ELSEWHERE/,
    'the thing lane no longer rejects photographs that name another city');
  assert.match(code, /lane === 'place'[\s\S]{0,120}isSingapore/,
    'the place lane no longer requires Singapore');
});

/*
 * The place-lane terms still all name the city; the thing-lane terms
 * deliberately name nowhere, and photo-subject.test.js is what pins that.
 * This is only here for the stray non-ASCII character, which encodes into
 * the query string and quietly returns nothing.
 */
test('every search term is plain ASCII', () => {
  const block = /export const SUBJECTS = \[[\s\S]*?\n\];/.exec(photoSrc);
  assert.ok(block, 'the SUBJECTS table is gone; the picture is fixed again');
  const each = block[0].match(/'([^']+)'/g) || [];
  assert.ok(each.length >= 12, `only ${each.length} strings in the subject table; it has collapsed`);
  for (const t of each) assert.doesNotMatch(t, /[^\x00-\x7F]/,
    `${t} has a non-ASCII character in it; it will encode into the query and match nothing`);
});

/**
 * The first scheduled run came back 401.
 *
 * The secret was being sent as a body field, a shape copied from the Make
 * blueprint's notify call — which posts {"secret": …} to a different endpoint.
 * /api/webhook/article reads Authorization: Bearer and takes nothing from the
 * body but the article.
 *
 * Had it been accepted it would have been worse than a 401: body fields are
 * stored, so the secret would have been written onto the article row.
 */
test('the webhook secret travels as a header and never in the body', () => {
  assert.match(src, /authorization: `Bearer \$\{process\.env\.ARTICLE_WEBHOOK_SECRET/,
    'the secret is not being sent as a bearer token; the webhook will refuse it');
  /* Comments stripped: the note above the fix quotes {"secret": …} to explain
     what was wrong, and an unfiltered search finds the explanation. Fourth
     source-reading test today to match its own prose. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /secret: process\.env|"secret":/,
    'the secret is in the request body again — it would be stored on the row');
  assert.match(src, /body: JSON\.stringify\(row\)/, 'the body should carry the article and nothing else');
});
