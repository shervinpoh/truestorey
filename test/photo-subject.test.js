/**
 * The photograph has to be about the article and about nowhere in particular.
 *
 * Two rules pull against each other here, and both have to hold.
 *
 * A stock photograph cannot show the block, plot or project a piece is about,
 * so the proper noun must never reach Unsplash. Search "Marina Gardens Lane"
 * and whatever comes back will be read as a picture of Marina Gardens Lane.
 *
 * But the first version of that rule searched nothing but the city — five
 * fixed terms, skyline and public housing among them — so a piece on lease
 * decay and a piece on stamp duty drew from the same pool and the editorial
 * page filled with Marina Bay.
 *
 * These pin the resolution: the subject decides the query, the article's own
 * words never do, and a photograph that names somewhere other than Singapore
 * cannot illustrate a Singapore article.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { photograph, subjectFor, SUBJECTS } from '../lib/photo.js';

const photo = (over = {}) => ({
  urls: { regular: 'https://images.unsplash.com/x' },
  user: { name: 'A Photographer', links: { html: 'https://unsplash.com/@x' } },
  links: { download_location: 'https://api.unsplash.com/photos/x/download' },
  alt_description: 'a photograph', tags: [], ...over,
});

/* A search that answers with whatever it is given, and records the URL. */
function stub(results) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ results }) };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test('the article’s own words never reach the search', async () => {
  process.env.UNSPLASH_ACCESS_KEY = 'test-key';
  const s = stub([photo({ tags: [{ title: 'crane' }] })]);
  try {
    await photograph('Two Prime GLS Sites Open At Marina Gardens Lane And Orchard Boulevard');
    assert.ok(s.calls.length, 'no search was made at all');
    for (const url of s.calls) {
      const q = decodeURIComponent(url);
      for (const word of ['marina', 'gardens', 'orchard', 'boulevard', 'prime']) {
        assert.doesNotMatch(q.toLowerCase(), new RegExp(word),
          `"${word}" reached Unsplash — the photograph will be read as a picture of the place:\n${q}`);
      }
    }
  } finally { s.restore(); }
});

test('the subject decides the query, so two pieces are not illustrated alike', async () => {
  process.env.UNSPLASH_ACCESS_KEY = 'test-key';
  const seen = [];
  for (const about of ['a bto waiting period', 'a 99-year leasehold', 'absd on a second property']) {
    const s = stub([photo()]);
    try { await photograph(about); seen.push(decodeURIComponent(s.calls[0])); }
    finally { s.restore(); }
  }
  assert.strictEqual(new Set(seen).size, seen.length,
    'three different subjects produced the same search — the pool is fixed again:\n' + seen.join('\n'));
});

/*
 * The thing lane exists because keys and cranes claim nothing about where
 * they are. It is only safe while the second half holds: a photograph that
 * names somewhere else is still a lie at the top of the page, whatever the
 * lane. Without this the relevance fix quietly reintroduces the problem the
 * Singapore filter was written to stop.
 */
test('a photograph naming another city cannot illustrate a Singapore piece', async () => {
  process.env.UNSPLASH_ACCESS_KEY = 'test-key';
  const s = stub([
    photo({ user: { name: 'Wrong Country', links: {} }, tags: [{ title: 'Hong Kong' }] }),
    photo({ user: { name: 'Wrong Country', links: {} }, location: { country: 'Japan' } }),
    photo({ user: { name: 'Wrong Country', links: {} }, description: 'downtown Dubai at night' }),
  ]);
  try {
    const got = await photograph('a 99-year leasehold');
    assert.strictEqual(got, null,
      `a photograph of ${'Hong Kong, Japan or Dubai'} was accepted for a Singapore article`);
  } finally { s.restore(); }
});

test('a photograph naming nowhere is fine in the thing lane', async () => {
  process.env.UNSPLASH_ACCESS_KEY = 'test-key';
  const s = stub([photo({ alt_description: 'a set of house keys on a wooden table' })]);
  try {
    const got = await photograph('a 99-year leasehold');
    assert.ok(got, 'keys on a table were rejected; nothing will ever illustrate a lease piece');
    assert.strictEqual(got.subject, 'lease');
  } finally { s.restore(); }
});

test('the place lane still demands Singapore', async () => {
  process.env.UNSPLASH_ACCESS_KEY = 'test-key';
  const s = stub([photo({ alt_description: 'apartment blocks at dusk', tags: [{ title: 'Seoul' }] })]);
  try {
    const sub = subjectFor('hdb resale flat prices');
    assert.strictEqual(sub.lane, 'place', 'an HDB piece is no longer in the place lane');
    assert.strictEqual(await photograph('hdb resale flat prices'), null,
      'apartment blocks in Seoul were accepted for an HDB article');
  } finally { s.restore(); }
});

/*
 * The finding kinds are hyphenated — town-move, land-award, floor-premium,
 * sun-approval — and every pattern in photo.js is written in words. Without
 * the split they match nothing, silently, and every desk piece falls through
 * to the general lane looking exactly as it did before. This reads the kinds
 * out of findings.js rather than listing them, so adding a sixth finding with
 * no picture to go with it fails here rather than shipping a skyline.
 */
test('every finding kind reaches a subject of its own', () => {
  const src = readFileSync(new URL('../lib/findings.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const kinds = [...new Set([...src.matchAll(/kind:\s*'([a-z-]+)'/g)].map(m => m[1]))];
  assert.ok(kinds.length >= 3, `only found ${kinds.length} finding kinds; this test is guarding nothing`);
  for (const k of kinds) {
    assert.notStrictEqual(subjectFor(k).id, 'general',
      `the finding kind "${k}" matches no subject, so its pieces all get the same stock photograph`);
  }
});

/*
 * A tag list is a bag of related terms, not a statement of subject. The en
 * bloc piece carries an ABSD tag, and matching title and tags as one string
 * put it in the tax lane — a collective sale illustrated with a photograph of
 * somebody signing a contract. The title decides; the tags only get a say if
 * the title matched nothing at all.
 */
test('a supporting tag cannot outrank the title', () => {
  const title = 'En Bloc Fatigue: Why Mega Developments Are Becoming Strata Titled Prisons';
  const tags = 'En Bloc Collective Sale ABSD Mega Developments';
  assert.strictEqual(subjectFor(title, tags).id, 'enbloc',
    'an ABSD tag pulled an en bloc piece into the stamp duty lane');

  /* And the tags still work when the title says nothing. A headline is
     allowed to be stylish; that must not cost the piece its picture. */
  assert.strictEqual(subjectFor('The Quiet Arithmetic Nobody Runs', 'absd stamp duty').id, 'tax',
    'a title that names no subject stopped falling back to its tags');
});

test('no subject searches for a place that is not Singapore', () => {
  for (const s of SUBJECTS) {
    assert.ok(s.queries.length, `subject "${s.id}" has no query`);
    for (const q of s.queries) {
      if (s.lane === 'place') {
        assert.match(q, /singapore/i, `place-lane query "${q}" does not say Singapore`);
      } else {
        assert.doesNotMatch(q, /singapore|hong kong|london|new york|dubai|tokyo/i,
          `thing-lane query "${q}" names a place; the lane exists because it does not`);
      }
    }
  }
});

/**
 * Two articles carried the same photograph, and a duplicate check said there
 * were fifteen distinct images.
 *
 * The check compared header_image_url as a string. Unsplash varies the query
 * on every request — ixid is different each time — so one photograph behind
 * two URLs does not match itself. Both new-launch pieces drew the same floor
 * plan and nothing noticed.
 *
 * It is the photo id or it is nothing.
 */
test('a photograph is identified by its id, not the URL it arrived on', async () => {
  const { photoId } = await import('../lib/photo.js');
  const a = 'https://images.unsplash.com/photo-1721244654210-a505a99661e9?crop=entropy&ixid=AAA&w=1080';
  const b = 'https://images.unsplash.com/photo-1721244654210-a505a99661e9?fit=max&ixid=ZZZ&q=80';
  assert.notStrictEqual(a, b, 'the fixture is wrong: these must differ as strings');
  assert.strictEqual(photoId(a), photoId(b),
    'two URLs for one photograph no longer resolve to the same id');
  assert.strictEqual(photoId(null), null, 'a missing image should be no id, not a crash');
});

test('a photograph already in use is not handed out again', async () => {
  process.env.UNSPLASH_ACCESS_KEY = 'test-key';
  const url = n => `https://images.unsplash.com/photo-${n}?ixid=x`;
  const one = {
    urls: { regular: url('aaa111') }, user: { name: 'P', links: {} }, links: {},
    alt_description: 'a set of house keys', tags: [],
  };
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: [one] }) });
  try {
    const { photograph, photoId } = await import('../lib/photo.js');
    const free = await photograph('a 99-year leasehold');
    assert.strictEqual(photoId(free.header_image_url), 'aaa111');

    /* The only qualifying result is spoken for, and both the subject query and
       the general fallback return it, so the honest answer is none. */
    const taken = await photograph('a 99-year leasehold', '', new Set(['aaa111']));
    assert.strictEqual(taken, null,
      'a photograph already on another article was handed out a second time');
  } finally { globalThis.fetch = real; }
});
