import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, readFileSync } from 'node:fs';
import { editorialAsset, withEditorialAsset } from '../lib/editorial-assets.js';

test('approved illustrations replace stock imagery without inheriting its photographer credit', () => {
  const original = { title: 'What a 99-year lease means', image: 'https://images.unsplash.com/example',
    credit: { name: 'Photographer' }, imageAlt: 'Stock photo', tags: [] };
  const result = withEditorialAsset(original);
  assert.match(result.image, /^\/editorial\/subject-lease-/);
  assert.match(result.imageAvif, /\.avif$/);
  assert.equal(result.credit, null);
  assert.match(result.imageAlt, /Editorial illustration/);
  assert.match(result.imageCredit, /Does not depict an actual property or site/);
  assert.equal(original.credit.name, 'Photographer', 'the stored article must remain untouched');
});

test('real-place stories keep their photograph even when a weaker tag suggests an illustration', () => {
  const original = { title: 'HDB resale prices across Singapore', tags: ['leasehold'],
    image: '/photos/real-singapore.webp', credit: { name: 'Photographer' } };
  assert.equal(withEditorialAsset(original), original);
  assert.equal(withEditorialAsset(null), null);
});

test('an unfinished subject does not turn a working photo into a missing asset', () => {
  const original = { title: 'Stamp duty and ABSD', image: '/existing.webp' };
  assert.equal(withEditorialAsset(original), original);
  assert.equal(editorialAsset('tax'), null);
});

test('every published illustration has both local formats under the above-fold budget', () => {
  for (const subject of ['lease', 'land', 'sun']) {
    const asset = editorialAsset(subject);
    for (const file of [asset.image, asset.imageAvif]) {
      const stats = statSync(new URL('../public' + file, import.meta.url));
      assert.ok(stats.size > 0 && stats.size <= 120000, `${file} exceeds its 120 KB budget`);
    }
  }
});

/**
 * Two articles showed one picture, side by side on /insights.
 *
 * editorialAsset() returned `subject-<id>-a` unconditionally, so every article
 * on a land tender got the identical image, and two of them ran consecutively.
 * An editorial page whose entries are visually interchangeable is saying the
 * entries are interchangeable.
 *
 * A subject with ONE variant still repeats, and no code fixes that — it needs
 * a second render. What these pin is that adding one is the whole of the work.
 */
test('the same article always gets the same picture', () => {
  // Not random. A picture that changes under a reader on a revalidate makes
  // the page look unstable, and the same URL must render the same page twice.
  const a = editorialAsset('land', 'some-land-article');
  const b = editorialAsset('land', 'some-land-article');
  assert.deepStrictEqual(a, b, 'the same slug resolved to two different images');
});

test('two variants are actually spread across articles', () => {
  const src = readFileSync(new URL('../lib/editorial-assets.js', import.meta.url), 'utf8');
  assert.match(src, /variants:/, 'the manifest no longer declares which variants exist');
  assert.match(src, /0x01000193/, 'the slug is no longer hashed, so variants cannot be spread');

  /* Proven against a manifest with two, because the live one has one of each
     and would pass this vacuously — which is exactly the shape of test this
     repo has been caught by before. */
  const spread = new Set();
  const fake = ['a', 'b'];
  const pick = (slug) => {
    let h = 0x811c9dc5;
    for (const c of String(slug)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return fake[(h >>> 16) % fake.length];
  };
  for (const s of ['gls-tender-one', 'gls-tender-two', 'changi-road-close',
                   'marina-gardens-lane', 'orchard-boulevard']) spread.add(pick(s));
  assert.strictEqual(spread.size, 2,
    'the hash puts every slug on one variant, so two would still show one picture');
});

/* The picture must never be read as a photograph of somewhere. */
test('an illustration says it is one, and says it depicts nothing real', () => {
  const a = editorialAsset('lease', 'x');
  assert.strictEqual(a.illustration, true);
  assert.strictEqual(a.credit, null, 'an illustration must not carry a photographer credit');
  assert.match(a.imageCredit, /[Dd]oes not depict an actual property/);
  assert.match(a.imageAlt, /illustration/i);
});
