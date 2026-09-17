import test from 'node:test';
import assert from 'node:assert/strict';
import { titleCase, slug, hdbHref } from '../lib/name.js';

test('shouting source data is calmed down', () => {
  assert.equal(titleCase('TELOK BLANGAH HILL PARK'), 'Telok Blangah Hill Park');
  assert.equal(titleCase('MARIS STELLA HIGH SCHOOL'), 'Maris Stella High School');
  assert.equal(titleCase('JALAN SEMBILANG PARK'), 'Jalan Sembilang Park');
});

test('a partly-cased label is fixed word by word, not judged as a whole', () => {
  // The lowercase "lk" in "Blk" sinks any whole-string uppercase ratio, which
  // is how this label used to escape unconverted.
  assert.equal(titleCase('Blk 275A BISHAN ST 24'), 'Blk 275A Bishan St 24');
  assert.equal(titleCase('Blk 406 ANG MO KIO AVE 10'), 'Blk 406 Ang Mo Kio Ave 10');
});

test('already mixed-case names are returned untouched', () => {
  for (const n of ['Tiong Bahru Market', 'Shunfu Road Blk 320 (Shunfu Mart)', 'iShine Centre', 'McNair Road']) {
    assert.equal(titleCase(n), n);
  }
});

test('acronyms survive', () => {
  assert.equal(titleCase("CHIJ ST. NICHOLAS GIRLS' SCHOOL"), "CHIJ St. Nicholas Girls' School");
  assert.equal(titleCase('BISHAN MRT STATION'), 'Bishan MRT Station');
  assert.ok(titleCase('PUNGGOL LRT STATION').includes('LRT'));
});

test('a small word is only small in the middle', () => {
  assert.equal(titleCase('THE SAIL @ MARINA BAY'), 'The Sail @ Marina Bay');
  assert.equal(titleCase('BANK OF SINGAPORE'), 'Bank of Singapore');
});

test('empty and odd input does not throw', () => {
  assert.equal(titleCase(''), '');
  assert.equal(titleCase(null), null);
  assert.equal(titleCase('   '), '   ');
  assert.equal(titleCase('123'), '123');
});

/* ── the join key ───────────────────────────────────────────────────────────
 *
 * Four copies of this slug existed, and lib/blindspot/measure.js carried one
 * without the ampersand rule — so for any name containing "&" it built a
 * different href from the one the geocoder and /hdb use. No current HDB street
 * has an ampersand, which is why coverage still measured honestly; the failure
 * would have been a block resolving everywhere except in the code that checks
 * whether blocks resolve.
 */
test('the ampersand rule survives, so two different names cannot share an href', () => {
  assert.notStrictEqual(slug('A & B'), slug('A B'));
  assert.strictEqual(slug('A & B'), 'a-and-b');
});

test('the block href is the one geo.json is keyed by', () => {
  assert.strictEqual(hdbHref('ANG MO KIO', '406', 'ANG MO KIO AVE 10'),
    '/hdb/ang-mo-kio/406-ang-mo-kio-ave-10');
  assert.strictEqual(hdbHref('KALLANG/WHAMPOA', '1A', 'JLN TENTERAM'),
    '/hdb/kallang-whampoa/1a-jln-tenteram');
});

/* Every upcoming-MOP block must resolve to a coordinate through this exact
 * function. These are the blocks that have never sold — the set a geocoder
 * walking transaction records missed 694 of, once. */
test('every upcoming-MOP block still resolves through the shared href', async () => {
  const fs = await import('node:fs');
  const url = new URL('../data/mop.json', import.meta.url);
  if (!fs.existsSync(url)) return;                       // data not ingested here
  const m = JSON.parse(fs.readFileSync(url, 'utf8'));
  const geo = JSON.parse(fs.readFileSync(new URL('../data/geo.json', import.meta.url), 'utf8')).records;
  const y0 = m.generatedForYear;
  let total = 0, placed = 0;
  for (const t of Object.values(m.towns)) for (const y of Object.values(t.byYear || {})) {
    for (const b of y.list || []) {
      if (b.earliestMop < y0 || b.earliestMop > y0 + 4) continue;
      total++;
      if (geo[hdbHref(b.town, b.block, b.street)]) placed++;
    }
  }
  assert.ok(total > 0, 'no upcoming blocks found');
  // Not asserted at 100%: coverage is a measurement, and the floor is what
  // makes /mop's map worth drawing at all.
  assert.ok(placed / total > 0.9, `only ${placed}/${total} upcoming MOP blocks resolve`);
});

/* ── one step up ────────────────────────────────────────────────────────────
 *
 * The back link is derived from the path, so its label goes through titleCase
 * — which only repairs text that is SHOUTING, by design. A slug is lowercase,
 * so it shipped as "Back to ang mo kio" until it was shouted at first.
 */
test('the back link names where it goes, cased like a place', async () => {
  const { parentOf } = await import('../lib/nav.js');
  assert.deepEqual(parentOf('/hdb/ang-mo-kio/406-ang-mo-kio-ave-10'),
    { href: '/hdb/ang-mo-kio', label: 'Ang Mo Kio' });
  assert.deepEqual(parentOf('/hdb/kallang-whampoa/1a-jln-tenteram'),
    { href: '/hdb/kallang-whampoa', label: 'Kallang Whampoa' });
  assert.equal(parentOf('/condo/the-sail-marina-bay').href, '/condo');
  assert.equal(parentOf('/insights/some-note').label, 'Insights');
  assert.equal(parentOf('/plan').label, 'Home');
});

/* Home has nothing above it, and a back control there is a control that lies. */
test('the homepage has no step up', () => {
  return import('../lib/nav.js').then(({ parentOf }) => {
    assert.equal(parentOf('/'), null);
    assert.equal(parentOf(''), null);
  });
});

/**
 * An address pasted from somewhere else.
 *
 * People do not type an address into a property site; they paste one, from
 * Google Maps, a listing portal or a message. Every one of those carries a
 * tail the filed label does not have — "570 ANG MO KIO AVE 3, Singapore
 * 560123" — and the search is a substring match over that label, so every
 * pasted address matched NOTHING. The address was right, the block exists,
 * and the box said "No matches."
 *
 * Only the tail is trimmed. "Singapore" is a real word inside project names —
 * The Residences at W Singapore Sentosa Cove — so stripping it everywhere
 * would break the searches it appears in legitimately.
 */
import { search as searchRecords } from '../lib/data/query.js';

test('an address pasted with a country and postal code still finds the block', () => {
  const plain = searchRecords('570 ANG MO KIO AVE 3', { limit: 1 })[0];
  assert.ok(plain, 'the control query stopped working');

  for (const pasted of [
    '570 ANG MO KIO AVE 3, Singapore 560123',
    '570 Ang Mo Kio Ave 3, Singapore',
    '570 ANG MO KIO AVE 3 S560123',
    '570 ANG MO KIO AVE 3, Republic of Singapore',
  ]) {
    const hit = searchRecords(pasted, { limit: 1 })[0];
    assert.ok(hit, `"${pasted}" found nothing`);
    assert.equal(hit.href, plain.href, `"${pasted}" resolved to the wrong record`);
  }
});

test('a project whose own name contains Singapore is still findable', () => {
  const hits = searchRecords('Singapore', { limit: 5 });
  assert.ok(hits.length, 'trimming ate a legitimate one-word query');
  assert.ok(hits.some(h => /SINGAPORE/i.test(h.label)),
    'the tail-trim is stripping Singapore from the middle of names, not just the end');
});

test('trimming never turns a query into nothing', () => {
  // A bare postal code cannot be answered — no record carries one — but it
  // must fail as a search, not become an empty string that matches anything.
  assert.deepEqual(searchRecords('560123', { limit: 3 }), []);
  assert.deepEqual(searchRecords('zzzznotathing', { limit: 3 }), []);
});

/**
 * A street word written the other way.
 *
 * HDB abbreviates ("JLN TENAGA", "BT BATOK"), URA's landed streets are in full
 * ("JALAN ANTOI"), and a reader types whichever they know. "649 Jalan" and
 * "22 cashew" were real failed searches in the analytics table.
 */
test('a street word finds its abbreviation, in both directions', () => {
  const at = q => searchRecords(q, { limit: 3 }).map(h => h.href);
  assert.ok(at('649 Jalan').includes('/hdb/bedok/649-jln-tenaga'), '"649 Jalan" no longer finds Blk 649 JLN TENAGA');
  assert.ok(at('649 Jalan Tenaga').includes('/hdb/bedok/649-jln-tenaga'));
  assert.ok(at('Jln Antoi').includes('/landed/jalan-antoi'), 'an abbreviation no longer finds a street filed in full');
  assert.ok(at('Bukit Batok Street 21').length, 'full words no longer find an abbreviated HDB street');
  assert.ok(searchRecords('Commonwealth Close', { limit: 1 })[0]?.label.includes("C'WEALTH CL"),
    "C'WEALTH is split in two by norm() and has to be joined before mapping");
});

test('mapping street words never breaks a name typed halfway', () => {
  /* "Normanton Pa" is a prefix of NORMANTON PARK and of nothing in
     NORMANTON PK. The plain match has to run first and unchanged. */
  assert.equal(searchRecords('Normanton Pa', { limit: 1 })[0]?.label, 'NORMANTON PARK');
  assert.ok(searchRecords("St George's Lane", { limit: 1 })[0]?.label.includes("ST. GEORGE'S LANE"),
    'ST as Saint was mapped as a street word');
});

test('a house number on a landed street finds the street, never an HDB block', () => {
  assert.equal(searchRecords('22 cashew', { limit: 1 })[0]?.href, '/landed/cashew-crescent',
    'URA publishes no house numbers, so "22 cashew" must fall back to the street');
  assert.equal(searchRecords('22 Cashew Crescent', { limit: 1 })[0]?.href, '/landed/cashew-crescent');
  assert.equal(searchRecords('570 ang mo kio', { limit: 1 })[0]?.href, '/hdb/ang-mo-kio/570-ang-mo-kio-ave-3',
    'an HDB block number was set aside although the block exists');
  assert.deepEqual(searchRecords('22 cashew', { kind: 'HDB', limit: 3 }), [],
    'the landed fallback leaked into an HDB-only search');
  assert.deepEqual(searchRecords('9999 nothingstreet', { limit: 3 }), []);
});
