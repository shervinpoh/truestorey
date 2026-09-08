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
import { PROHIBITED, scanLanguage, publishBlockers, similarity, duplicateOf, tokens,
         subject, DUPLICATE_AT } from '../lib/compliance.js';

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

/* ── the same story, filed three times ─────────────────────────────────────
   THESE ARE THE REAL TITLES. The first version of this test invented titles
   that happened to match the slugs, so it measured slug overlap and reported
   it as title overlap — the check looked calibrated and had never been run
   against anything the pipeline actually produced. A headline is meant to
   vary; the subject is not, and the pipeline puts the subject in the slug. */

const SAME_STORY = [
  { title: 'Two Prime GLS Sites Open, And The Timeline They Set',
    slug: 'marina-gardens-lane-orchard-boulevard-gls-launch-2026' },
  { title: 'What the Marina Gardens Lane and Orchard Boulevard tenders tell you',
    slug: 'marina-gardens-lane-orchard-boulevard-gls-tenders' },
  { title: 'Two Prime GLS Sites Go Live, and the Clock Starts',
    slug: 'ura-marina-gardens-lane-orchard-boulevard-gls-2h2026' },
];
const OTHERS = [
  { title: 'What the New Upper Changi Road tender closing tells a Bedok buyer',
    slug: 'new-upper-changi-road-tender-closing-bedok' },
  { title: 'The Legacy Premium: Why Pre-2024 Resale Flats Are Quietly Becoming Luxury Assets',
    slug: 'bto-prime-plus-standard-resale-premium-2026' },
  { title: 'En Bloc Fatigue: Why Mega Developments Are Becoming Strata Titled Prisons',
    slug: 'en-bloc-fatigue-mega-developments-strata-prisons' },
  { title: 'The Great Rent Normalization of 2026: Why Leveraged Landlords Are Bleeding Cash',
    slug: 'rent-normalization-2026-leveraged-landlords' },
];

test('a title-only comparison misses at least one of these pairs entirely', () => {
  /* The reason the check reads the slug. Not every pair is invisible to a
     title comparison — "Two Prime GLS Sites Open…" and "Two Prime GLS Sites
     Go Live…" share enough words to score 0.36 — but "What the Marina Gardens
     Lane and Orchard Boulevard tenders tell you" shares NOTHING with either,
     at 0.00, and would have been filed as a third copy. One hole is enough:
     the pipeline picks the framing, and nothing makes it pick a similar one. */
  const titleOnly = [];
  for (let i = 0; i < SAME_STORY.length; i++)
    for (let j = i + 1; j < SAME_STORY.length; j++)
      titleOnly.push(similarity(SAME_STORY[i].title, SAME_STORY[j].title));
  assert.ok(Math.min(...titleOnly) < 0.1,
    'a title-only check would have caught all three; the slug comparison could be dropped');
  assert.ok(titleOnly.some(s => s < DUPLICATE_AT),
    'at least one same-story pair must be invisible to titles alone');
});

test('three framings of one tender are caught on title and slug', () => {
  for (let i = 0; i < SAME_STORY.length; i++) {
    for (let j = i + 1; j < SAME_STORY.length; j++) {
      const s = similarity(subject(SAME_STORY[i]), subject(SAME_STORY[j]));
      assert.ok(s >= DUPLICATE_AT,
        `${SAME_STORY[i].slug} vs ${SAME_STORY[j].slug} scored ${s.toFixed(2)}`);
    }
  }
});

test('unrelated stories stay far below the threshold', () => {
  const all = [SAME_STORY[0], ...OTHERS];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const s = similarity(subject(all[i]), subject(all[j]));
      assert.ok(s <= 0.15,
        `${all[i].slug} vs ${all[j].slug} scored ${s.toFixed(2)} — too close to the threshold`);
    }
  }
});

test('the threshold sits in the gap, not on the edge of it', () => {
  // Same-story pairs measured at 0.33-0.45, unrelated at most 0.07. If a
  // change narrows that gap, this fails before anything reaches production.
  let worstSame = 1, bestOther = 0;
  for (let i = 0; i < SAME_STORY.length; i++)
    for (let j = i + 1; j < SAME_STORY.length; j++)
      worstSame = Math.min(worstSame, similarity(subject(SAME_STORY[i]), subject(SAME_STORY[j])));
  const all = [SAME_STORY[0], ...OTHERS];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      bestOther = Math.max(bestOther, similarity(subject(all[i]), subject(all[j])));
  assert.ok(bestOther < DUPLICATE_AT && DUPLICATE_AT < worstSame,
    `threshold ${DUPLICATE_AT} must sit between ${bestOther.toFixed(2)} and ${worstSame.toFixed(2)}`);
});

test('the duplicate check reports which story it repeats', () => {
  const existing = SAME_STORY.slice(0, 2).map((a, i) => ({ ...a, id: i, status: 'published' }));
  const hit = duplicateOf(SAME_STORY[2], existing);
  assert.ok(hit, 'the third framing was not caught');
  assert.ok(hit.score >= DUPLICATE_AT);
  assert.ok(existing.some(e => e.slug === hit.slug));
  assert.equal(duplicateOf(OTHERS[0], existing), null, 'an unrelated story must pass');
  assert.equal(duplicateOf({ title: 'Anything', slug: 'anything' }, []), null);
});

test('a bare title still works, for callers that have no slug', () => {
  const existing = [{ title: 'En Bloc Fatigue: Why Mega Developments Are Becoming Strata Titled Prisons',
                      slug: 'en-bloc-fatigue-mega-developments-strata-prisons' }];
  assert.ok(duplicateOf('En Bloc Fatigue: Why Mega Developments Are Becoming Strata Titled Prisons', existing));
});

test('a title of only stopwords matches nothing', () => {
  assert.equal(tokens('the a of in on').size, 0);
  assert.equal(similarity('the a of', 'in on at'), 0);
});
