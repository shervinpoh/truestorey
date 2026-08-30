import test from 'node:test';
import assert from 'node:assert/strict';
import { newSince, markOf, byMonth, digestSubject } from '../lib/watch.js';

const row = (month, price, storey = '04 TO 06') => ({ month, price, storeyRange: storey, flatType: '4 ROOM' });

test('a new watch establishes its mark and reports nothing', () => {
  const r = newSince([row('2026-06', 500000), row('2026-07', 520000)], null);
  assert.equal(r.firstRun, true);
  assert.deepEqual(r.fresh, []);
  assert.deepEqual(r.mark, { month: '2026-07', n: 1 });
});

test('a later month is news', () => {
  const rows = [row('2026-06', 500000), row('2026-07', 520000), row('2026-08', 540000)];
  const { fresh } = newSince(rows, { month: '2026-07', n: 1 });
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].month, '2026-08');
});

/* HDB registers late: a June sale can appear in the June figures weeks after
 * June was last reported. A watermark that only remembers the latest month
 * never looks back and silently drops it. */
test('a late registration in the month already reported is still news', () => {
  const rows = [row('2026-07', 500000), row('2026-07', 520000), row('2026-07', 540000)];
  const { fresh } = newSince(rows, { month: '2026-07', n: 1 });
  assert.equal(fresh.length, 2, 'the two rows added to an already-reported month were missed');
});

/* data/hdb.json is a 36-month rolling window, so a block can gain two sales
 * and lose two older ones. A count-only watermark reports nothing at all. */
test('the rolling window does not hide news behind a flat total', () => {
  const before = [row('2023-09', 400000), row('2026-07', 520000)];
  const mark = markOf(before);
  // Same total: 2023-09 fell off the back, 2026-08 arrived.
  const after = [row('2026-07', 520000), row('2026-08', 545000)];
  const { fresh } = newSince(after, mark);
  assert.equal(after.length, before.length, 'the fixture must keep the count flat to be the test');
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].month, '2026-08');
});

/* A revision that removes a row must never produce a negative slice, and must
 * never re-report rows that were already sent. */
test('a month that shrinks reports nothing rather than re-reporting', () => {
  const { fresh } = newSince([row('2026-07', 500000)], { month: '2026-07', n: 3 });
  assert.deepEqual(fresh, []);
});

test('nothing new reports nothing', () => {
  const rows = [row('2026-06', 500000), row('2026-07', 520000)];
  const { fresh } = newSince(rows, markOf(rows));
  assert.deepEqual(fresh, []);
});

/* The same data must give the same answer on every run — HDB publishes no
 * transaction id, so "which two of the five are new" is decided by a fixed
 * sort rather than by arrival order. */
test('the answer is deterministic whatever order the rows arrive in', () => {
  const rows = [row('2026-07', 540000), row('2026-07', 500000), row('2026-07', 520000)];
  const a = newSince(rows, { month: '2026-07', n: 1 }).fresh.map(r => r.price);
  const b = newSince([...rows].reverse(), { month: '2026-07', n: 1 }).fresh.map(r => r.price);
  assert.deepEqual(a, b);
});

test('fresh rows come back newest first', () => {
  const rows = [row('2026-06', 1), row('2026-07', 2), row('2026-08', 3)];
  const { fresh } = newSince(rows, { month: '2026-05', n: 0 });
  assert.deepEqual(fresh.map(r => r.month), ['2026-08', '2026-07', '2026-06']);
});

test('an empty block has an empty mark and never crashes', () => {
  assert.deepEqual(markOf([]), { month: null, n: 0 });
  assert.deepEqual(newSince([], null).fresh, []);
  assert.deepEqual(newSince(undefined, { month: '2026-07', n: 1 }).fresh, []);
});

test('byMonth groups newest month first', () => {
  const g = byMonth([row('2026-08', 1), row('2026-07', 2), row('2026-08', 3)]);
  assert.deepEqual(g.map(x => x.month), ['2026-08', '2026-07']);
  assert.equal(g[0].rows.length, 2);
});

/* CEA PG 02-11 s3.1 — a market claim must be substantiated. A subject line is
 * the least substantiable place on earth, so it states a count and a place. */
test('the subject line states a count and a place and nothing else', () => {
  assert.equal(digestSubject('406 Ang Mo Kio Ave 10', [row('2026-08', 1)]),
    '1 sale filed at 406 Ang Mo Kio Ave 10');
  assert.equal(digestSubject('406 Ang Mo Kio Ave 10', [row('2026-08', 1), row('2026-08', 2)]),
    '2 sales filed at 406 Ang Mo Kio Ave 10');
  assert.equal(digestSubject('x', []), null, 'no news must not produce a subject');
  for (const bad of ['undervalued', 'bargain', 'hot', 'soar', 'expert', 'best']) {
    assert.ok(!digestSubject('406 Ang Mo Kio Ave 10', [row('2026-08', 1)]).toLowerCase().includes(bad));
  }
});

/* ── the surfaces that collect an address ───────────────────────────────────
 *
 * Read from source for the reason test/motion.test.js gives: node:test against
 * three dependencies, and Node does not strip JSX.
 */
import { readFileSync } from 'node:fs';
const src = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

/* The mobile field was deleted rather than reworded on 30 Aug 2026. It invited
 * a number for a channel the same form promised never to use, and collecting a
 * number with no purpose behind it is a problem on its own terms. */
test('no form on this site asks for a phone number', () => {
  for (const f of ['components/LeadForm.jsx', 'components/WatchBlock.jsx']) {
    const s = src(f);
    assert.doesNotMatch(s, /inputMode="tel"/, `${f} still has a telephone input`);
    assert.doesNotMatch(s, /autoComplete="tel"/, `${f} still autofills a phone number`);
  }
});

test('the lead form no longer promises a channel it also asks for', () => {
  const s = src('components/LeadForm.jsx');
  assert.doesNotMatch(s, /would rather be reached that way/);
  // One tick exists, so the copy must not refer to two.
  assert.doesNotMatch(s, /neither box/);
});

/* PDPA s14(2): what is stored must be what was displayed. Both the form and
 * the server import the wording from lib/consent.js rather than retyping it. */
test('every consent surface imports its wording rather than retyping it', () => {
  for (const f of ['components/WatchBlock.jsx', 'components/LeadForm.jsx', 'app/api/watch/route.js']) {
    assert.match(src(f), /CONSENT_COPY/, `${f} does not import the consent wording`);
  }
  // And the promise the tick makes is the thing the digest actually delivers.
  assert.match(src('lib/consent.js'), /updates on my block/);
});

/* Rule 4 — an inbound message is not consent. The tick is, and it starts off. */
test('the consent tick is never pre-checked and is required', () => {
  assert.match(src('components/WatchBlock.jsx'), /useState\(false\)/);
  assert.match(src('app/api/watch/route.js'), /body\.consent !== true/);
});

/* A row that nobody confirmed must never be mailed: anyone can type anyone's
 * address into a form, and this table pairs an address with a home. */
test('a watch sends nothing until the address itself confirms', () => {
  assert.match(src('lib/supabase/rest.js'), /confirmed_at=not\.is\.null/);
  assert.match(src('app/api/watch/route.js'), /confirmed_at: null/);
});

/* PDPA s16 — on withdrawal, stop using the data. The only way to be sure. */
test('unsubscribing deletes the row rather than flagging it', () => {
  // The whole of deleteWatch, so the assertion does not depend on the order
  // the query string and the method happen to appear in.
  const fn = /export async function deleteWatch[\s\S]*?\n}/.exec(src('lib/supabase/rest.js'))?.[0] || '';
  assert.match(fn, /unsub_token/);
  assert.match(fn, /method: 'DELETE'/);
  assert.doesNotMatch(fn, /PATCH|deleted_at|active:\s*false/, 'withdrawal must delete, not flag');
  // Gmail and Yahoo POST to the header URL on the reader's behalf.
  assert.match(src('app/api/watch/unsubscribe/route.js'), /export async function POST/);
  assert.match(src('lib/email.js'), /List-Unsubscribe-Post/);
});

/* Rule 2 and rule 7: the digest reports filed sales and never values a flat. */
test('the digest carries its source and makes no market claim', () => {
  const s = src('lib/digest.js');
  assert.match(s, /meta\.source/);
  assert.match(s, /not a valuation/);
  for (const bad of ['undervalued', 'overvalued', 'bargain', 'best deal', 'specialist']) {
    assert.doesNotMatch(s.toLowerCase().replace(/^ \*.*$/gm, ''), new RegExp(bad),
      `the digest can render the word "${bad}"`);
  }
});

/* An exit code is a claim, not evidence — the lesson `sync` taught this repo.
 * A send that fails must not move the watermark past the news it failed on. */
test('the watermark only moves after a send that succeeded', () => {
  const s = src('scripts/send-digest.mjs');
  const fail = s.indexOf('failed++');
  const mark = s.indexOf('await markWatchSent(w.id, mark);\n    console.log');
  assert.ok(fail > 0 && mark > fail, 'markWatchSent must come after the failure path returns');
  assert.match(s, /if \(failed\) process\.exit\(1\)/);
});
