import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm, relax, isProjectName, indexProjects, resolveProject, linkSites, landRate, ERRATA }
  from '../lib/land.js';

/**
 * The join between a land sale and the development built on it.
 *
 * Every failure this guards has already happened once. The matcher is
 * deliberately unable to guess, so most of these assert that it REFUSES
 * something a fuzzy matcher would have accepted.
 */

const projects = JSON.parse(readFileSync(new URL('../data/projects.json', import.meta.url), 'utf8'));
const hdb = JSON.parse(readFileSync(new URL('../data/sources/hdb-sites-sold.json', import.meta.url), 'utf8'));
const map = indexProjects(projects);
const linked = linkSites(hdb.sites, map);

/* ── normalising ───────────────────────────────────────────────────────────── */

test('normalising strips punctuation and case but not words', () => {
  assert.equal(norm('The Wisteria'), 'THE WISTERIA');
  assert.equal(norm('#1 Loft'), '1 LOFT');
  // "@" is a word in these names and both sources spell it both ways.
  assert.equal(norm('Arc @Tampines'), norm('ARC AT TAMPINES'));
});

test('relaxing drops the article and the category, and nothing else', () => {
  assert.equal(relax('The Miltonia Residences'), 'MILTONIA');
  assert.equal(relax('Bishan Park Condominium'), 'BISHAN PARK');
  // A category word INSIDE the name is part of the name.
  assert.equal(relax('Eden Residences Capitol'), 'EDEN RESIDENCES CAPITOL');
});

test('HDB prose is not a project name', () => {
  for (const s of ['NA', 'N.A.', 'Landed Housing', 'Landed Properties (No project name)', '', null, '-'])
    assert.equal(isProjectName(s), false, `${JSON.stringify(s)} was read as a name`);
  assert.equal(isProjectName('Grandeur 8'), true);
});

/* ── matching ──────────────────────────────────────────────────────────────── */

test('a compound name resolves through its residential half only', () => {
  const r = resolveProject('Bedok Mall & Bedok Residences', map);
  assert.equal(r?.href, '/condo/bedok-residences');
  assert.equal(r.via, 'half');
});

test('an ambiguous name resolves to nothing at all', () => {
  // Two records normalising the same way must kill the key rather than let
  // whichever was indexed first win — it would be wrong half the time and
  // would look identical to being right.
  const m = indexProjects({ condo: [
    { label: 'PARK VIEW', href: '/condo/park-view', n: 3 },
    { label: 'Park-View', href: '/condo/parkview-2', n: 4 },
  ] });
  assert.equal(resolveProject('Park View', m), null);
});

test('a name that is only nearly right is not matched', () => {
  // "The Eden" and "Eden Park" are both real and are not the same place.
  const m = indexProjects({ condo: [{ label: 'EDEN PARK', href: '/condo/eden-park', n: 9 }] });
  assert.equal(resolveProject('The Eden', m), null);
  assert.equal(resolveProject('Edenn Park', m), null, 'edit distance must not be a matcher');
});

test('every erratum names a project that exists, and is still needed', () => {
  for (const [wrong, right] of ERRATA) {
    assert.ok(map.get(right), `errata points at ${right}, which is not a project here`);
    assert.equal(map.get(wrong), undefined,
      `${wrong} now matches directly — delete its errata line rather than leaving two routes`);
  }
});

/* ── the real data ─────────────────────────────────────────────────────────── */

test('the join does not quietly shrink', () => {
  // 190 at the time of writing. A drop means a rename upstream or a matcher
  // regression, and both are worth a red test rather than a silent -30.
  assert.ok(linked.byHref.size >= 185,
    `only ${linked.byHref.size} sites resolve to a record; it was 190`);
});

test('every link points at a record that exists', () => {
  const hrefs = new Set([...projects.condo, ...projects.landed].map(r => r.href));
  for (const [href] of linked.byHref) assert.ok(hrefs.has(href), `${href} is not a record`);
});

test('a winner that wrapped into the project column is repaired', () => {
  // HDB's Ang Mo Kio S2a printed the winner across two cells, and the
  // continuation landed in the project name: "Grandeur 8 Chip Eng Leong
  // Enterprise Pte Ltd". Caught by the bid appendix naming the same winner in
  // full, which is the only reason it was findable at all.
  const s = hdb.sites.find(x => /Ang Mo Kio S2a/.test(x.site));
  assert.equal(s.project, 'Grandeur 8');
  assert.match(s.winner, /Chip Eng Leong Enterprise Pte Ltd$/);
});

test('no winner is left with a dangling conjunction', () => {
  // The tell that a name was cut off mid-consortium.
  for (const s of hdb.sites)
    assert.doesNotMatch(String(s.winner || ''), /(&|\band)\s*$/i,
      `${s.site} — winner ends mid-name: ${JSON.stringify(s.winner)}`);
});

test('a project name is a name and not a swallowed table', () => {
  // Two rows once held 39,690 and 57,897 characters here. The tests at the
  // time asserted the field EXISTED, which it did.
  for (const s of hdb.sites) {
    if (!s.project) continue;
    assert.ok(s.project.length <= 60, `${s.site} — project is ${s.project.length} chars`);
    assert.doesNotMatch(s.project, /Tenderer|Tender Bid|LEGEND|S\/N/i,
      `${s.site} — project carries table furniture: ${s.project.slice(0, 60)}`);
  }
});

/* ── the derived rate ──────────────────────────────────────────────────────── */

test('a rate needs a basis, and says so when it has none', () => {
  assert.equal(landRate({ price: 1e8, gfaSqm: null }), null);
  assert.equal(landRate({ price: null, gfaSqm: 4000 }), null);
});

test('a rate is per square metre and per square foot of the same GFA', () => {
  const r = landRate({ price: 1_000_000, gfaSqm: 1000 });
  assert.equal(r.psm, 1000);
  // A square foot is 0.0929 sq m, so a square foot costs that fraction of one.
  assert.ok(Math.abs(r.psf - 92.90304) < 1e-6, `psf came out ${r.psf}`);
  assert.equal(r.ceiling, false);
});

test('a maximum GFA is flagged, because the rate is then a floor', () => {
  assert.equal(landRate({ price: 1e6, gfaSqm: 1000, gfaIsCeiling: true }).ceiling, true);
});
