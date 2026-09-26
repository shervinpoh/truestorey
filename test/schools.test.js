/**
 * The school finder: MOE's reading joined to the homes around each school.
 * The failures worth guarding are the ones this repo has already had
 * elsewhere — a page shipping a whole dataset, a distance that stops saying it
 * is straight-line, a flag that silently falls off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { primarySchools, schoolBySlug, homesNear, withP1, landAround, SIZE_BANDS, HDB_TYPES, tenureShort } from '../lib/schools.js';
import { nearby, recordByHref } from '../lib/data/query.js';

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const data = primarySchools();

test('the index ships the schools, and a school page ships only its own homes', () => {
  /* /mop and /market once serialised whole datasets to print four numbers. */
  const index = src('app/schools/page.jsx');
  assert.doesNotMatch(index, /homesNear|map\.json|private\.json/, '/schools ships homes; they belong on each school\'s page');
  const one = src('app/schools/[slug]/page.jsx');
  assert.match(one, /homesNear\(s\)/);
  assert.doesNotMatch(one, /primarySchools\(\)\.list(?!\.)|map\.json/, 'a school page ships another dataset');
});

test('every distance is labelled straight-line, and MOE’s own measure is named', () => {
  for (const f of ['app/schools/page.jsx', 'app/schools/[slug]/page.jsx', 'components/SchoolHomes.jsx']) {
    assert.match(src(f), /[Ss]traight-line/, `${f} shows a distance without saying it is straight-line`);
  }
  for (const f of ['app/schools/page.jsx', 'app/schools/[slug]/page.jsx']) {
    assert.match(src(f), /SchoolQuery/, `${f} does not point to OneMap for an address's real category`);
    assert.match(src(f), /not a place/i, `${f} no longer says a past exercise is not a place`);
  }
});

test('every school MOE lists has one page, and the two-track flag survives the join', () => {
  if (!data) return;
  const slugs = data.list.map(s => s.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'two schools share a page');
  assert.ok(slugs.length >= 150);
  const tracks = data.list.filter(s => s.twoTrack).map(s => s.name);
  assert.equal(tracks.length, 12, `the 2027 two-track flag reached ${tracks.length} schools, not 12`);
});

test('the homes around a school are within 2 km, nearest first, and filter only on what the data holds', () => {
  const s = data && data.list[0];
  if (!s) return;
  const homes = homesNear(s);
  assert.ok(homes.length > 0);
  for (let i = 0; i < homes.length; i++) {
    const h = homes[i];
    assert.ok(h.m <= 2000, `${h.label} is ${h.m} m away`);
    if (i) assert.ok(h.m >= homes[i - 1].m, 'not nearest first');
    const allowed = h.kind === 'hdb' ? HDB_TYPES : SIZE_BANDS.map(b => b.key);
    for (const k of Object.keys(h.types || {})) assert.ok(allowed.includes(k), `${h.label} filters on "${k}"`);
  }
  const land = landAround(s.lat, s.lon);
  assert.equal(land.box.length, 4);
});

test('a home page’s nearby schools carry MOE’s reading and a link, and nothing else changes', () => {
  const rec = recordByHref('/condo/artra');
  const near = rec && nearby(rec);
  if (!near?.primary || !data) return;
  const tagged = withP1(near);
  const all = [...tagged.primary.within1, ...tagged.primary.within2];
  assert.ok(all.some(s => s.p1?.slug), 'no nearby school was matched to its MOE reading');
  for (const s of all.filter(x => x.p1)) assert.ok(schoolBySlug(s.p1.slug), `${s.name} links to a school page that does not exist`);
  assert.equal(tagged.rail, near.rail, 'withP1 touched something other than the school lists');
});

test('tenure reads the way a buyer says it', () => {
  assert.equal(tenureShort('Freehold'), 'Freehold');
  assert.equal(tenureShort('99 yrs lease commencing from 2016'), '99-year lease from 2016');
  assert.equal(tenureShort(''), null);
});
