/**
 * MOE's Phase 2C Two-Track Scheme, and the one way it goes quietly wrong.
 *
 * Announced 10 Sep 2026, effective from the 2027 registration exercise. At
 * twelve schools Phase 2C places split equally into a ≤2km track and a >2km
 * track with neither having priority, so distance stops ordering that phase
 * there. This site publishes a count of primary schools inside a 1km band on
 * the stated basis that distance orders Phases 2A/2B/2C, which is why the
 * twelve have to be marked.
 *
 * ── THE FAILURE THIS GUARDS ────────────────────────────────────────────────
 * The list is hand-entered from a PDF annex and matched by exact name against
 * data/amenities.json, which comes from data.gov.sg. If a name changes
 * upstream — a school renames, MOE respells an apostrophe — the match drops
 * silently and the site goes back to telling a reader that distance orders a
 * phase where MOE has said it does not. The ingest throws on a mismatch; this
 * catches the same thing without a network call, and catches the case where
 * someone edits the source file and never re-runs the ingest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (...p) => JSON.parse(readFileSync(path.join(process.cwd(), ...p), 'utf8'));
const src = read('data', 'sources', 'p1-two-track.json');
const schools = read('data', 'amenities.json').layers.schools.points;

test('every school on MOE’s list exists in the amenities layer, by exact name', () => {
  assert.equal(src.schools.length, 12, 'MOE named twelve schools; the source file disagrees');
  const byName = new Map(schools.map(s => [s.name.toUpperCase(), s]));
  const missing = src.schools.map(s => s.name).filter(n => !byName.has(n.toUpperCase()));
  assert.deepEqual(missing, [],
    'These are on MOE’s two-track list and not in data/amenities.json under that name. '
    + 'Either the upstream name changed or the source file has a typo — fix the source file. '
    + 'Leaving it unmatched makes the site claim distance orders Phase 2C where it does not.');
});

test('the flag is actually set on those twelve and on nobody else', () => {
  const flagged = schools.filter(s => s.p1TwoTrack).map(s => s.name.toUpperCase()).sort();
  const expected = src.schools.map(s => s.name.toUpperCase()).sort();
  assert.deepEqual(flagged, expected,
    'data/amenities.json’s flags have drifted from data/sources/p1-two-track.json. '
    + 'Re-run `npm run ingest:amenities`, which applies them.');
});

test('the flag survives into the precomputed nearby data the pages actually read', () => {
  /* Amenities.jsx does not call nearFor at request time — block pages read
     data/near/<type>/<town>.json, written by scripts/build-nearby.mjs. The
     flag was correct in amenities.json and absent from every page for exactly
     this reason: the intermediate build had not been re-run. */
  const near = read('data', 'near', 'hdb', 'marine-parade.json');
  const blk = near['74-marine-dr'];
  assert.ok(blk, 'Blk 74 Marine Dr is gone from the Marine Parade shard');
  const within1 = blk.primary?.within1 || [];
  const flagged = within1.filter(s => s.p1TwoTrack);
  assert.ok(flagged.length >= 3,
    `Blk 74 Marine Dr sits inside 1km of Tao Nan, CHIJ (Katong) and Tanjong Katong Primary, `
    + `all three on MOE's list, and only ${flagged.length} carry the flag. `
    + 'Run `node scripts/build-nearby.mjs` after changing amenities.');
});

test('the source file records where the list came from and when it bites', () => {
  /* Rule 6. A flag that changes what a reader believes about school priority
     is a published claim, and a claim needs its source. */
  for (const k of ['publishedBy', 'sourceUrl', 'announcedAt', 'effectiveFrom']) {
    assert.ok(src[k], `data/sources/p1-two-track.json lost ${k}`);
  }
  assert.match(src.sourceUrl, /^https:\/\/www\.moe\.gov\.sg\//, 'the source must be MOE itself');
  assert.match(src.effectiveFrom, /2027/, 'the effective exercise is no longer stated');
});

test('the component names the scheme, its date, and what is unchanged', () => {
  const stripComments = s => s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const jsx = stripComments(readFileSync(
    path.join(process.cwd(), 'components', 'Amenities.jsx'), 'utf8'));
  assert.match(jsx, /p1TwoTrack/, 'Amenities stopped reading the flag');
  assert.match(jsx, /2027 registration exercise/,
    'the note no longer says which exercise this starts from — a reader would think it applies now');
  assert.match(jsx, /Phases 2A and 2B are unchanged/,
    'the note stopped saying what is NOT affected, which is most of the framework');
  assert.match(jsx, /moe\.gov\.sg\/news\/press-releases\/20260910/,
    'the note lost its link to the announcement');
});
