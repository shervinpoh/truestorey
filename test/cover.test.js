/**
 * A photograph of the place an article is about — and nothing that could
 * pass for one without being one.
 *
 * Shervin, 25 Sep: the photos were not nice and not relevant. They were stock
 * photographs of objects, by design (lib/photo.js). lib/cover.js replaces them
 * with Wikimedia Commons photographs taken near the place, chosen from those
 * that pass fixed rules.
 *
 * What these guard, each a way it could go wrong:
 *  · a photograph reaching a page without its credit, or with a credit link
 *    somebody else wrote (the credit travels in the URL — see lib/cover.js);
 *  · a licence that does not allow this use, a restricted file, a bus, a
 *    marketer's ad copy or a photograph of Johor passing as "the area";
 *  · the model choosing something the rules had refused, or its answer being
 *    trusted when it cannot be read;
 *  · a caption that lets the photograph read as the property;
 *  · the same scene on two articles because Commons holds it twice;
 *  · a place resolved from anything but this site's own geocodes.
 *
 * No network: Commons and the model are stubbed. The place tests read data/
 * and assert rules that hold on any day's data (CLAUDE.md, 18–23 Sep).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  refusals, describe as caption, coverFrom, readCover, coverId, findCover, subjectQuery, RELATION,
} from '../lib/cover.js';
import { placeOf, RADIUS } from '../lib/place.js';
import { withEditorialAsset } from '../lib/editorial-assets.js';
import { fromRow } from '../lib/articles.js';

const root = process.cwd();
const code = (...p) => readFileSync(path.join(root, ...p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

/* A Commons page as the API returns it, with the fields that matter. */
let n = 0;
function page({ title = `File:Photo ${++n}.jpg`, width = 4000, height = 3000, licence = 'CC BY-SA 4.0',
  description = 'HDB blocks along a street in Singapore', taken = '2023-05-01 10:00:00', artist = 'A Photographer',
  restrictions = '', categories = ['Public housing in Singapore'], mime = 'image/jpeg' } = {}) {
  const hash = String(n % 10);
  const file = title.replace(/^File:/, '').replace(/ /g, '_');
  return {
    title, categories: categories.map(c => ({ title: `Category:${c}` })),
    imageinfo: [{
      width, height, mime,
      url: `https://upload.wikimedia.org/wikipedia/commons/${hash}/${hash}a/${file}`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash}/${hash}a/${file}/1280px-${file}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      extmetadata: {
        LicenseShortName: { value: licence },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
        ImageDescription: { value: description },
        DateTimeOriginal: { value: taken },
        Artist: { value: `<a href="//commons.wikimedia.org/wiki/User:X">${artist}</a>` },
        Restrictions: { value: restrictions },
      },
    }],
  };
}

test('only licences that allow commercial use with credit pass', () => {
  for (const ok of ['CC BY-SA 4.0', 'CC BY 2.0', 'CC BY-SA 3.0 sg', 'CC0', 'Public domain']) {
    assert.deepEqual(refusals(page({ licence: ok })), [], `${ok} was refused`);
  }
  for (const no of ['CC BY-NC 2.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 4.0', 'GFDL', 'Fair use', '', 'All rights reserved']) {
    assert.ok(refusals(page({ licence: no })).some(r => /^licence/.test(r)), `${no || 'no licence'} passed`);
  }
});

test('a photograph whose subject is not a place does not pass, however near it was taken', () => {
  /* The Punggol geosearch returned fifty-two buses. */
  const cases = {
    bus: { title: 'File:SBS3478L Go-Ahead Singapore 43 16-05-2024.jpg', description: 'Bus service 43' },
    food: { description: 'Black coffee and tea in a white cup' },
    interior: { description: 'View of the platforms at TE13 Orchard Boulevard station' },
    people: { description: 'Portrait of residents at a ceremony' },
    advert: { description: 'Introducing Tampines EC, a luxurious brand new development near the MRT' },
    abroad: { description: 'Johor Bahru skyline seen from Woodlands' },
    restricted: { restrictions: 'personality' },
    small: { width: 1200, height: 800 },
    portrait: { width: 3000, height: 4000 },
    stale: { taken: '2006-03-01' },
    diagram: { mime: 'image/svg+xml' },
  };
  for (const [name, over] of Object.entries(cases)) {
    assert.ok(refusals(page(over)).length > 0, `a ${name} photograph passed`);
  }
});

test('the caption is the file\'s own first sentence, cleaned, never its camera notes', () => {
  const d = v => caption(page({ description: v }));
  assert.equal(d('Panorama view of HDB at Punggol Waterway in 2018. Taken with Xperia XZ Premium.'),
    'Panorama view of HDB at Punggol Waterway in 2018');
  assert.equal(d('View at St. Andrew\'s Road near Blk 5. Second sentence here.'), 'View at St. Andrew\'s Road near Blk 5');
  assert.equal(d('Parc Central EC is located at Tampines Ave 10 , near the MRT . More.'),
    'Parc Central EC is located at Tampines Ave 10, near the MRT');
  /* A description the reader cannot read, or one that says nothing, gives
     way to the file name — without its Panoramio, Flickr or timestamp debris. */
  assert.equal(caption(page({ title: 'File:Gardens by the Bay - panoramio (41).jpg', description: '這張照片在濱海灣花園拍攝。' })),
    'Gardens by the Bay');
  assert.equal(caption(page({ title: 'File:Bidadari HDB flats 20211207 134153.jpg', description: 'Architecture' })),
    'Bidadari HDB flats');
  assert.equal(caption(page({ title: 'File:Aerial Marina Bay Singapore (36365629480) (2).jpg', description: '' })),
    'Aerial Marina Bay Singapore');
  assert.ok(caption(page({ description: 'x '.repeat(200) })).length <= 141);
});

test('a cover survives the trip through a URL, and its image loads without the fragment', () => {
  const url = coverFrom(page({ artist: 'Zhè Kāng 康', description: 'Reclaimed land by Marina Gardens Drive' }),
    { place: { name: 'Marina Gardens Lane' } });
  assert.match(url, /^https:\/\/upload\.wikimedia\.org\/.+#cover=[A-Za-z0-9_-]+$/);
  const c = readCover(url);
  assert.equal(c.src, url.split('#')[0]);
  assert.equal(c.by, 'Zhè Kāng 康', 'a non-Latin author name was mangled on the way through');
  assert.equal(c.licence, 'CC BY-SA 4.0');
  assert.match(c.page, /^https:\/\/commons\.wikimedia\.org\/wiki\//);
  assert.match(c.licenceUrl, /^https:\/\/creativecommons\.org\//);
  assert.equal(c.shows, 'Reclaimed land by Marina Gardens Drive');
  assert.equal(c.taken, 'May 2023');
  assert.equal(c.relation, RELATION.area);
  assert.equal(readCover('https://images.unsplash.com/photo-123'), null, 'an Unsplash URL was read as a cover');
  assert.equal(readCover(null), null);
});

test('a Commons image whose credit is missing or forged is refused, not shown bare', () => {
  const src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1280px-X.jpg';
  const frag = o => `${src}#cover=${Buffer.from(JSON.stringify(o)).toString('base64url')}`;
  const good = { v: 1, shows: 'A street', by: 'Someone', licence: 'CC BY 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:X.jpg', relation: 'area' };
  assert.ok(readCover(frag(good)).src);
  for (const [why, url] of Object.entries({
    'no fragment': src,
    'not base64': `${src}#cover=%%%`,
    'not JSON': `${src}#cover=${Buffer.from('nope').toString('base64url')}`,
    'script link': frag({ ...good, page: 'javascript:alert(1)' }),
    'plain http': frag({ ...good, page: 'http://commons.wikimedia.org/wiki/File:X.jpg' }),
    'another site': frag({ ...good, page: 'https://evil.example/wiki/File:X.jpg' }),
    'a licence that does not allow it': frag({ ...good, licence: 'CC BY-NC 4.0' }),
  })) {
    assert.deepEqual(readCover(url), { refused: true }, `${why}: a Commons image was accepted`);
  }
  /* A licence link to anywhere but the licence is dropped, not followed. */
  assert.equal(readCover(frag({ ...good, licenceUrl: 'javascript:alert(1)' })).licenceUrl, null);
  assert.equal(readCover(frag({ ...good, relation: 'the property itself' })).relation, RELATION.area,
    'a stored relation could rewrite the caption\'s disclaimer');
});

test('the page shows no image at all when a Commons credit cannot be read', () => {
  const src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/1280px-X.jpg';
  const base = { slug: 'x', title: 'Bedok tender', content_html: '<p>text</p>', status: 'published' };
  assert.equal(fromRow({ ...base, header_image_url: src }).image, null, 'an uncredited Commons photograph reached the page');
  const good = coverFrom(page({}), { place: { name: 'Bedok' } });
  const post = fromRow({ ...base, header_image_url: good,
    unsplash_photographer_name: 'Stale Credit', unsplash_photographer_profile_url: 'https://unsplash.com/@x' });
  assert.equal(post.image, good.split('#')[0]);
  assert.equal(post.credit, null, 'an Unsplash credit left on the row credited a stranger for a Commons photograph');
  assert.ok(post.cover?.by);
  const stock = fromRow({ ...base, header_image_url: 'https://images.unsplash.com/photo-1', unsplash_photographer_name: 'P' });
  assert.equal(stock.cover, null);
  assert.equal(stock.credit.name, 'P', 'the Unsplash path stopped crediting its photographer');
});

test('a photograph of the place outranks an illustration of the topic', () => {
  const cover = readCover(coverFrom(page({}), { place: { name: 'New Upper Changi Road' } }));
  /* "tender" puts this in the land lane, which has a Blender illustration. */
  const post = { title: 'New Upper Changi Road tender closing', slug: 'x', tags: [], image: cover.src, cover };
  assert.equal(withEditorialAsset(post), post);
  const bare = { title: 'New Upper Changi Road tender closing', slug: 'x', tags: [], image: 'https://images.unsplash.com/p' };
  assert.match(withEditorialAsset(bare).image, /^\/editorial\//, 'the illustration no longer replaces stock photographs');
});

test('the caption always says what the photograph is not', () => {
  assert.match(RELATION.area, /not a photograph of any particular property/);
  assert.match(RELATION.subject, /not a photograph of any property this piece discusses/);
  const cap = code('components', 'CoverCaption.jsx');
  for (const part of [/\{cover\.relation\}/, /\{cover\.by\}/, /\{cover\.licence\}/, /Wikimedia Commons/, /href=\{cover\.page\}/]) {
    assert.match(cap, part, `the caption dropped ${part}`);
  }
  assert.match(code('app', 'insights', '[slug]', 'page.jsx'), /<CoverCaption cover=\{post\.cover\} \/>/);
  assert.match(code('components', 'StudioQueue.jsx'), /<CoverCaption cover=/, 'the review queue shows a photograph without the caption readers will see');
});

test('two frames of one scene count as one photograph', () => {
  const u = f => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${f}/1280px-${f}`;
  assert.equal(coverId(u('497A_and_497D%2C_Tampines_Street_45.jpg')), coverId(u('497A_and_497D%2C_Tampines_Street_45_(2).jpg')));
  assert.equal(coverId(u('Bidadari_HDB_flats_20211207_134153.jpg')), coverId(u('Bidadari_HDB_flats_20211207_140002.jpg')));
  assert.notEqual(coverId(u('Aerial_Marina_Bay_Singapore_(36365629480).jpg')), coverId(u('Gardens_by_the_Bay_(36715210496).jpg')));
  assert.equal(coverId('https://images.unsplash.com/photo-1'), null);
});

/* ── the choice, with Commons and the model stubbed ─────────────────────── */

function stubCommons(pages) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('https://commons.wikimedia.org/w/api.php')) {
      const q = new URL(u).searchParams;
      const list = q.get('generator') === 'geosearch' ? pages : [];
      return new Response(JSON.stringify({ query: { pages: list } }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } });
  };
  return () => { globalThis.fetch = real; };
}
const PLACE = () => ({ name: 'Bedok', kind: 'area', lat: 1.32, lon: 103.93, radius: 1500 });

test('the model chooses only among photographs the rules passed', async () => {
  const bus = page({ title: 'File:SBS1234A bus.jpg', description: 'A bus on Bedok North Road' });
  const good = [page({ title: 'File:Bedok flats one.jpg' }), page({ title: 'File:Bedok flats two.jpg' })];
  const restore = stubCommons([bus, ...good]);
  try {
    let shown = [];
    const claude = async (sys, msgs) => {
      shown = msgs[0].content.filter(c => c.type === 'image');
      /* Prose first, then the answer — the shape that was misread at 60 tokens. */
      return { text: 'My first thought was {"pick": 1}, but Photograph 2 is better composed.\n{"pick": 2}' };
    };
    const out = await findCover({ title: 'Bedok resale prices', slug: 'bedok' }, { placeOf: PLACE, claude });
    assert.equal(shown.length, 2, 'the model was shown a photograph the rules had refused');
    assert.equal(readCover(out.url).shows, 'HDB blocks along a street in Singapore');
    assert.equal(out.how, 'chooser');
    assert.match(out.url, /Bedok_flats_two/, 'the LAST pick in the reply was not the one used');
  } finally { restore(); }
});

test('an unreadable or failed choice falls back to the rules; a refusal is final', async () => {
  const restore = stubCommons([page({ title: 'File:A.jpg' }), page({ title: 'File:B.jpg' })]);
  try {
    const garbled = await findCover({ title: 'Bedok', slug: 'b' },
      { placeOf: PLACE, claude: async () => ({ text: 'Photograph 1 shows a' }) });
    assert.ok(garbled.url && /unreadable/.test(garbled.how), 'a cut-off reply was treated as an answer');
    const failed = await findCover({ title: 'Bedok', slug: 'b' },
      { placeOf: PLACE, claude: async () => ({ error: 'Anthropic 529' }) });
    assert.ok(failed.url && /529/.test(failed.how));
    const none = await findCover({ title: 'Bedok', slug: 'b' }, { placeOf: PLACE, claude: null });
    assert.ok(none.url && none.how === 'score', 'no key should still produce a photograph from the rules');
    const refused = await findCover({ title: 'Bedok', slug: 'b' },
      { placeOf: PLACE, claude: async () => ({ text: '{"pick": null}' }) });
    assert.equal(refused.url, null, 'the model refused every photograph and one was used anyway');
  } finally { restore(); }
});

test('a photograph already on another article is not chosen again', async () => {
  const a = page({ title: 'File:Same scene.jpg' }), b = page({ title: 'File:Same scene (2).jpg' }), c = page({ title: 'File:Other.jpg' });
  const restore = stubCommons([a, b, c]);
  try {
    const avoid = new Set([coverId(a.imageinfo[0].thumburl)]);
    const out = await findCover({ title: 'Bedok', slug: 'b' }, { placeOf: PLACE, avoid, claude: null });
    assert.match(out.url, /Other/, 'a second frame of a photograph already in use was chosen');
  } finally { restore(); }
});

test('a piece with no place is illustrated by the kind of housing it names first', () => {
  assert.equal(subjectQuery('new launch vs resale price gap'), 'condominium Singapore');
  assert.equal(subjectQuery('hdb private decoupling'), 'HDB flats Singapore');
  assert.equal(subjectQuery('bto prime plus standard'), 'HDB flats Singapore');
  assert.equal(subjectQuery('rent normalization leveraged landlords'), null);
});

/* ── places, from this site's own data ──────────────────────────────────── */

test('every GLS site named in a title resolves to that site\'s own coordinate', (t) => {
  const sites = JSON.parse(readFileSync(path.join(root, 'data', 'gls.json'), 'utf8')).sites
    .filter(s => Number.isFinite(s.lat) && !String(s.name).includes('/'));
  if (!sites.length) return t.skip('no geocoded GLS sites in data/gls.json today');
  for (const s of sites) {
    const name = s.name.replace(/\(.*?\)/g, '').trim();
    const p = placeOf({ title: `What the ${name} tender tells you`, slug: '' });
    assert.ok(p, `${name}: not resolved`);
    assert.equal(p.kind, 'site', `${name}: resolved as ${p.kind}`);
    /* Two parcels can share a name ("Media Circle" and "Media Circle (Parcel
       B)"), so the coordinate is one of that name's, not necessarily this one. */
    const same = sites.filter(x => x.name.replace(/\(.*?\)/g, '').trim() === name);
    assert.ok(same.some(x => x.lat === p.lat && x.lon === p.lon), `${name}: resolved to somebody else's coordinate`);
    assert.equal(p.radius, RADIUS.site);
  }
});

test('the more specific place wins, and the first-named of two', () => {
  const bedok = placeOf({ title: 'New Upper Changi Road tender closing', slug: 'new-upper-changi-road-tender-closing-bedok' });
  assert.equal(bedok?.name, 'New Upper Changi Road', 'a town beat the GLS site in it');
  assert.equal(bedok.area, 'Bedok', 'the site did not learn which planning area it stands in');
  /* Named first, and still not the answer: the site is more specific. */
  assert.equal(placeOf({ title: 'Bedok: what the New Upper Changi Road tender tells you' })?.name,
    'New Upper Changi Road', 'a town named first beat the GLS site inside it');
  const two = placeOf({ title: 'Marina Gardens Lane and Orchard Boulevard tenders' });
  assert.equal(two?.name, 'Marina Gardens Lane');
});

test('a phrase that looks like a place and is not resolves to nothing', () => {
  assert.equal(placeOf({ title: 'What the Pioneer Generation package means for your CPF' }), null);
  assert.equal(placeOf({ title: 'Freehold versus 99-year leasehold', slug: 'freehold-vs-99-year' }), null);
  assert.equal(placeOf({}), null);
});

test('a link to one of this site\'s pages resolves exactly, with no name-matching', (t) => {
  const geo = JSON.parse(readFileSync(path.join(root, 'data', 'geo.json'), 'utf8')).records || {};
  const [href, g] = Object.entries(geo).find(([h, v]) => h.startsWith('/hdb/') && v?.match === 'good') || [];
  if (!href) return t.skip('no geocoded HDB block in data/geo.json today');
  const rec = placeOf({ title: 'Anything at all', sources: [`https://truestorey.vercel.app${href}`] });
  assert.equal(rec.kind, 'record');
  assert.deepEqual([rec.lat, rec.lon], [g.lat, g.lon]);
  const townSlug = href.split('/')[2];
  const town = placeOf({ title: 'Anything at all', sources: [`https://truestorey.vercel.app/hdb/${townSlug}`] });
  assert.equal(town.kind, 'town');
  assert.ok(Math.abs(town.lat - 1.35) < 0.15 && Math.abs(town.lon - 103.82) < 0.25, 'a town centre fell outside Singapore');
});

test('intake chooses a photograph, and still drops one that cannot be credited', () => {
  const route = code('app', 'api', 'webhook', 'article', 'route.js');
  assert.match(route, /await findCover\(/, 'the webhook no longer chooses a photograph');
  assert.match(route, /export const maxDuration = 60;/);
  assert.match(route, /commons \? !commons\.refused/, 'a Commons image with no readable credit would be stored');
  assert.match(route, /status: 'draft',/, 'intake stopped filing drafts only');
});
