import test from 'node:test';
import assert from 'node:assert/strict';
import { splitAnswer, parseBlocks, parseInline, citedIndexes } from '../lib/answer.js';

/**
 * These are the three things a reader actually saw on /neighbourhood on
 * 30 Aug 2026, screenshotted: asterisks around every emphasised phrase, bare
 * `[2][3][15]` after every sentence, and an offer of three things the tool
 * could write next with no way to accept any of them.
 *
 * The first fixture is that reply, pasted. If any of it reaches a page as
 * literal characters again, this goes red.
 */
const SCREENSHOT = `**East Coast** most commonly means the **Atlantic coastline of the United States**, stretching from **Maine to Florida**.[2][3][15]

In a narrower usage, it can also refer mainly to the **Northeast and Mid-Atlantic** cities and states, such as **Boston, New York, and Philadelphia**.[2][3]`;

/** Flatten blocks to the text a reader would see, citations excluded. */
const visible = t => parseBlocks(t)
  .flatMap(b => b.kind === 'p' || b.kind === 'h' ? b.spans
    : b.kind === 'table' ? [...b.head.flat(), ...b.rows.flat().flat()]
    : b.items.flat())
  .filter(s => s.t !== 'cite')
  .map(s => s.v).join('');

test('no asterisk survives to the page', () => {
  const out = visible(SCREENSHOT);
  assert.ok(!out.includes('*'), `asterisk leaked: ${out}`);
  assert.ok(out.includes('East Coast most commonly means'));
});

test('bold becomes bold rather than text', () => {
  const spans = parseInline('the **Atlantic coastline** of somewhere');
  assert.deepEqual(spans.map(s => s.t), ['text', 'b', 'text']);
  assert.equal(spans[1].v, 'Atlantic coastline');
});

test('a citation cluster becomes citations, not brackets', () => {
  const spans = parseInline('Maine to Florida.[2][3][15]');
  assert.deepEqual(spans.filter(s => s.t === 'cite').map(s => s.n), [2, 3, 15]);
  assert.ok(!spans.some(s => s.t === 'text' && s.v.includes('[')));
});

test('citedIndexes reports what the prose cited, in order, once each', () => {
  assert.deepEqual(citedIndexes(SCREENSHOT), [2, 3, 15]);
});

/* The sources panel listed all twenty results the provider returned, which put
 * Britannica and dictionary.com under "Sources" beside a claim from URA. */
test('an uncited source is not evidence for anything', () => {
  const cited = citedIndexes('Only this one matters.[4]');
  assert.deepEqual(cited, [4]);
  assert.equal(cited.length, 1);
});

test('an italic is not mistaken for a bullet, and vice versa', () => {
  assert.deepEqual(parseInline('an *emphasis* here').map(s => s.t), ['text', 'i', 'text']);
  const b = parseBlocks('* first item\n* second item');
  assert.equal(b[0].kind, 'ul');
  assert.equal(b[0].items.length, 2);
});

test('a markdown link keeps its href and loses its brackets', () => {
  const [span] = parseInline('[the HDB page](https://www.hdb.gov.sg/x)');
  assert.equal(span.t, 'link');
  assert.equal(span.href, 'https://www.hdb.gov.sg/x');
  assert.equal(span.v, 'the HDB page');
});

test('a table is a table, not a row of pipes', () => {
  const [b] = parseBlocks('| Town | Units |\n|---|---|\n| Bishan | 1,221 |\n| Tengah | 900 |');
  assert.equal(b.kind, 'table');
  assert.equal(b.head.length, 2);
  assert.equal(b.rows.length, 2);
  assert.equal(b.rows[0][0][0].v, 'Bishan');
});

test('headings render as headings', () => {
  const [b] = parseBlocks('## What was announced');
  assert.equal(b.kind, 'h');
  assert.equal(b.spans[0].v, 'What was announced');
});

/* ── the follow-up trailer ─────────────────────────────────────────────────── */

test('the trailer leaves the prose and becomes questions', () => {
  const { body, followUps } = splitAnswer(
    'Bishan town centre is being redeveloped.[1]\n\nFOLLOW-UPS: What is completing in Bishan? | Which MRT serves Bishan? | What did URA announce for Bishan?');
  assert.ok(!body.includes('FOLLOW-UPS'));
  assert.equal(followUps.length, 3);
  assert.equal(followUps[0], 'What is completing in Bishan?');
});

test('the model writes the marker in bold about half the time', () => {
  const { body, followUps } = splitAnswer('Answer.\n\n**FOLLOW-UPS:** One question here? | Another question here?');
  assert.equal(body, 'Answer.');
  assert.equal(followUps.length, 2);
});

/* A stream is read on every delta, so the parser sees the marker one letter at
 * a time. Printing "FOLLOW-U" mid-answer is the bug this fixes, arriving in
 * slow motion. */
test('a half-typed trailer is never shown', () => {
  for (const tail of ['FOL', 'FOLLOW', 'FOLLOW-UP', 'FOLLOW-UPS:']) {
    const { body } = splitAnswer(`Bishan is being redeveloped.\n${tail}`);
    assert.equal(body, 'Bishan is being redeveloped.', `leaked "${tail}"`);
  }
});

test('a dangling bold opener is dropped, not printed', () => {
  assert.equal(splitAnswer('The figure is **').body, 'The figure is');
  assert.equal(splitAnswer('Cited already.[1').body, 'Cited already.');
});

test('a fragment is not offered as a question', () => {
  const { followUps } = splitAnswer('Answer.\n\nFOLLOW-UPS: What is completing in Tengah? | yes | ');
  assert.deepEqual(followUps, ['What is completing in Tengah?']);
});

/* ── Singapore or nothing ──────────────────────────────────────────────────── */

/* Asked what house prices were doing in Manchester, the tracker answered in
 * full with UK ONS figures — under a CEA registration number, on a page whose
 * subheading promises Singapore. */
test('an off-island refusal is recognised and carries what was asked', () => {
  const { offIsland, body, followUps } = splitAnswer('OFF-ISLAND: house prices in Manchester, England');
  assert.equal(offIsland, 'house prices in Manchester, England');
  assert.equal(body, '');
  assert.deepEqual(followUps, []);
});

test('a half-arrived refusal never flashes as an answer', () => {
  assert.equal(splitAnswer('OFF-ISL').body, '');
  assert.equal(splitAnswer('OFF-ISLAND:').offIsland, 'that');
});

/* ── the route's own scoping ───────────────────────────────────────────────── */

test('the route anchors the question and forbids offering in prose', async () => {
  const src = await import('node:fs').then(fs =>
    fs.promises.readFile(new URL('../app/api/ai/neighbourhood/route.js', import.meta.url), 'utf8'));

  // Setting the search location to SG was tried and does NOT fix the wrong
  // country on its own; anchoring the query is what moves retrieval. If the
  // anchor ever goes, "East Coast" returns Maine to Florida again — and the
  // sources come back as Britannica and a dictionary.
  assert.match(src, /Read every place name here as the Singapore/);
  assert.match(src, /clean\[last\] = \{ role: 'user', content: clean\[last\]\.content \+ ANCHOR \}/);

  assert.match(src, /OFF-ISLAND: <one clause/);
  assert.match(src, /FOLLOW-UPS: question \| question \| question/);
  assert.match(src, /if you want, I can…/);
});
