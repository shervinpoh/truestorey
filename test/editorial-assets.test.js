import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
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
