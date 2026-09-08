/**
 * The rules that were only ever written in prompts.
 *
 * Every phrase below was already forbidden — in lib/ai/*, in app/api/ai/* and
 * in the Make blueprint's system prompt. A model kept them most of the time,
 * and an article went out under a CEA registration number saying "Do Not Buy",
 * "guaranteed" and "the only safe way", with no sources recorded, because the
 * queue warned and published anyway.
 *
 * This repo has learned that once already: /neighbourhood's RULE 1 refused
 * Manchester on every probe and then answered it from the live route, which is
 * why scope moved into lib/scope.js BEFORE the model is called. Same shape
 * here, at the one moment that matters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROHIBITED, scanLanguage, publishBlockers, similarity, duplicateOf, tokens }
  from '../lib/compliance.js';

test('the phrases that made one article unpublishable are all caught', () => {
  const found = id => scanLanguage(`<p>${id}</p>`).map(h => h.id);
  assert.ok(found('Do Not Buy this one').includes('directive'));
  assert.ok(found('returns are guaranteed').includes('guarantee'));
  assert.ok(found('the only safe way to do it').includes('only-safe'));
  assert.ok(found('a mathematical impossibility').includes('certainty'));
  assert.ok(found('this block is undervalued').includes('undervalued'));
  assert.ok(found('ask a property specialist').includes('specialist'));
  assert.ok(found('the best deal in the estate').includes('best-deal'));
  assert.ok(found('pulled from REALIS').includes('realis'));
});

test('a phrase split by markup is still found', () => {
  // The pipeline emits HTML, so a rule that only reads text nodes would miss
  // "<em>guaranteed</em>" inside a sentence it otherwise scans.
  assert.ok(scanLanguage('<p>returns are <em>guaranteed</em> here</p>')
    .some(h => h.id === 'guarantee'));
});

test('ordinary prose is not blocked', () => {
  const clean = '<p>URA filed 1,305 private transactions in August 2026. The median psf in '
    + 'District 19 was S$1,636 over the period shown. An index is a market; a home is one home.</p>';
  assert.deepEqual(scanLanguage(clean), []);
});

test('an article with no sources cannot be published', () => {
  const base = { title: 'A quiet quarter', content_html: '<p>Filed figures.</p>' };
  assert.deepEqual(publishBlockers({ ...base, source_urls: ['https://www.ura.gov.sg/x'] }), []);
  assert.equal(publishBlockers({ ...base, source_urls: [] })[0].id, 'no-sources');
  assert.equal(publishBlockers({ ...base, source_urls: null })[0].id, 'no-sources');
  // An array of empty strings is not sources.
  assert.equal(publishBlockers({ ...base, source_urls: ['', null] })[0].id, 'no-sources');
});

test('every prohibited entry states its reason', () => {
  for (const p of PROHIBITED) {
    assert.ok(p.id && p.re instanceof RegExp, `${p.id} is malformed`);
    assert.ok(p.why && p.why.length > 20, `${p.id} does not say why`);
  }
});

/* ── the same story, filed three times ─────────────────────────────────────── */

const MARINA = [
  'Marina Gardens Lane, Orchard Boulevard GLS launch 2026',
  'Marina Gardens Lane / Orchard Boulevard GLS tenders',
  'URA Marina Gardens Lane Orchard Boulevard GLS 2H2026',
];
const OTHERS = [
  'New Upper Changi Road tender closing in Bedok',
  'BTO Prime Plus Standard resale premium 2026',
  'Freehold vs 99-year leasehold: debunking the premium',
  'Rent normalization 2026 and leveraged landlords',
];

test('three framings of one tender are recognised as one story', () => {
  for (let i = 0; i < MARINA.length; i++) {
    for (let j = i + 1; j < MARINA.length; j++) {
      assert.ok(similarity(MARINA[i], MARINA[j]) >= 0.5,
        `${MARINA[i]} vs ${MARINA[j]} scored below the threshold`);
    }
  }
});

test('unrelated stories are nowhere near the threshold', () => {
  const all = [...MARINA.slice(0, 1), ...OTHERS];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const s = similarity(all[i], all[j]);
      assert.ok(s < 0.3, `${all[i]} vs ${all[j]} scored ${s.toFixed(2)} — too close for comfort`);
    }
  }
});

test('the duplicate check reports which story it repeats', () => {
  const existing = MARINA.slice(0, 2).map((title, i) => ({ id: i, slug: `s${i}`, title, status: 'published' }));
  const hit = duplicateOf(MARINA[2], existing);
  assert.ok(hit, 'the third framing was not caught');
  assert.ok(hit.score >= 0.5);
  assert.ok(existing.some(e => e.slug === hit.slug));
  assert.equal(duplicateOf(OTHERS[0], existing), null, 'an unrelated story must pass');
  assert.equal(duplicateOf('Anything', []), null, 'an empty queue duplicates nothing');
});

test('a title of only stopwords matches nothing', () => {
  // Otherwise two contentless titles would look identical and block each other.
  assert.equal(tokens('the a of in on').size, 0);
  assert.equal(similarity('the a of', 'in on at'), 0);
});
