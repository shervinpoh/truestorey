/**
 * A landed house is addressed by its street.
 *
 * ── THE FAILURE THIS FIXES ─────────────────────────────────────────────────
 * Records used to be keyed on URA's project name: anything filed as "LANDED
 * HOUSING DEVELOPMENT" became a street page, anything with a name became a
 * project page. That left 5,929 of 8,860 landed houses — two thirds — reachable
 * only under an estate name, and 225 streets with no page at all. Searching
 * "Cashew Crescent" returned nothing while its eighteen terrace and
 * semi-detached sales sat under "CASHEW VILLAS" at a /condo/ URL, which is the
 * wrong namespace for a landed estate as well as the wrong address.
 *
 * ── THE SPLIT IS URA'S OWN propertyType, NOT THE PROJECT NAME ──────────────
 * A Terrace, Semi-detached or Detached is a house: it belongs to its street.
 * A STRATA Terrace, Semi-detached or Detached is a unit in a development with
 * shared property — Parc Clematis has six among 1,062 apartments — and belongs
 * with that development, because it is not comparable to a freehold house on
 * the same road and one page holding both would say it was.
 *
 * Reversing either half is a one-line edit that looks like tidying.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { indexProjects, resolveProject } from '../lib/land.js';

const read = (...p) => JSON.parse(readFileSync(path.join(process.cwd(), ...p), 'utf8'));
const priv = read('data', 'private.json');
const projects = read('data', 'projects.json');
const search = read('data', 'search.json');

const STRATA = /^Strata/i;
const HOUSE = /Terrace|Semi-detached|Detached/i;
const isHouse = r => HOUSE.test(r.propertyType) && !STRATA.test(r.propertyType);

const landedRecords = (() => {
  const out = {};
  for (const f of readdirSync(path.join(process.cwd(), 'data', 'records', 'landed'))) {
    Object.assign(out, read('data', 'records', 'landed', f));
  }
  return out;
})();

test('every street with a landed house has a page', () => {
  const streets = new Set(priv.rows.filter(isHouse).map(r => r.street));
  const have = new Set(Object.values(landedRecords).map(r => r.street));
  const missing = [...streets].filter(s => !have.has(s));
  assert.deepEqual(missing.slice(0, 8), [],
    `${missing.length} streets have filed landed sales and no page. `
    + 'That is the bug this file exists for: a buyer searching the street they '
    + 'know finds nothing while the transactions sit under an estate name.');
});

test('Cashew Crescent, the case that surfaced it', () => {
  const r = landedRecords['cashew-crescent'];
  assert.ok(r, '/landed/cashew-crescent is gone');
  /* The street page holds EVERY terrace and semi-detached sale filed on the
     street — that is what the bug took away. This used to assert "at least
     18", the count on the day it was written; data/private.json is a rolling
     window, so one sale aged out, the count became 17, and the failed test
     kept the nightly refresh from committing any data at all. The count moves.
     The rule does not: every house sale on the street is on the street's page. */
  const filed = priv.rows.filter(x => isHouse(x) && x.street === 'CASHEW CRESCENT').length;
  assert.ok(filed > 0, 'no house sales on Cashew Crescent in the window — nothing left to check');
  assert.equal(r.n, filed, `the page holds ${r.n} of the ${filed} house sales filed on the street`);
  assert.deepEqual(r.estates, ['CASHEW VILLAS'],
    'the estate name is how a reader who was told "Cashew Villas" finds this page');
  assert.ok(search.entries.some(e => e.h === '/landed/cashew-crescent'),
    'the street is not in the search index');
});

test('strata landed stays with its development', () => {
  /* A strata terrace inside a condo is not a house on a street. Parc Clematis
     has six among 1,062 apartments; moving them to Jalan Lempeng would put
     them beside freehold houses and imply they are the same market. */
  const strataStreets = new Set(priv.rows
    .filter(r => STRATA.test(r.propertyType)).map(r => r.street));
  for (const r of Object.values(landedRecords)) {
    const types = r.propertyTypes || [];
    assert.ok(!types.some(t => STRATA.test(t)),
      `${r.href} carries ${types.filter(t => STRATA.test(t)).join(', ')}. `
      + 'Strata landed belongs on its development page, not on a street page.');
  }
  assert.ok(strataStreets.size > 0, 'no strata landed in the data at all — check the filter');
});

test('a house is never counted on two pages', () => {
  /* Records are a partition, not overlapping views. If a sale appeared on both
     a street page and a project page, every district median built from
     "the median of the projects' or streets' own medians" would count it
     twice — build-map.mjs says so in its own comment. */
  const houses = priv.rows.filter(isHouse).length;
  const onStreets = Object.values(landedRecords).reduce((t, r) => t + r.n, 0);
  assert.equal(onStreets, houses,
    `${houses} landed houses in the data but ${onStreets} counted across street pages. `
    + 'A mismatch means sales are duplicated or dropped, not re-homed.');
});

test('an estate name still resolves, so /land’s join survives', () => {
  /* GLS sites are matched to records BY NAME. Dissolving 443 estate pages
     broke eighteen of those links until estate names were indexed against the
     street they sit on. test/land.test.js guards the count; this guards the
     mechanism, because the count can be met while the route is wrong. */
  const map = indexProjects(projects);
  const hit = resolveProject('Cashew Villas', map);
  assert.ok(hit, 'an estate name no longer resolves to anything');
  assert.equal(hit.href, '/landed/cashew-crescent',
    'an estate should resolve to the street its houses are on');
  const withEstates = projects.landed.filter(r => r.estates?.length);
  assert.ok(withEstates.length > 300,
    `only ${withEstates.length} street records carry estate names; there were 418. `
    + 'projects.json has stopped carrying them and the /land join will decay.');
});

test('the page says which estate a street’s houses are in', () => {
  const stripComments = s => s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const jsx = stripComments(readFileSync(
    path.join(process.cwd(), 'components', 'RecordPage.jsx'), 'utf8'));
  /* The GATE, not just the identifier. A first version asserted /rec\.estates/
     and passed after the condition was replaced with `false`, because
     `rec.estates.map(...)` still sat in the unreachable branch. An assertion
     that survives its own feature being switched off is not an assertion. */
  assert.match(jsx, /rec\.estates\?\.length/,
    'the record page stopped printing the estate, so moving a house to its street loses the name it was sold under');
});

test('the build still keys a house on its property type, not its project name', () => {
  /* The data assertions above read BUILT OUTPUT, so a revert in the build
     script passes until someone rebuilds — and by then the damage is in
     data/. This reads the script, which is the only way to catch the edit
     itself. The revert is one line and looks like tidying. */
  const src = readFileSync(path.join(process.cwd(), 'scripts', 'build-index.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const key = /const projKey = r =>([^;]*);/.exec(src);
  assert.ok(key, 'projKey is gone from build-index.mjs');
  assert.match(key[1], /isHouse\(r\)/,
    'projKey no longer routes on isHouse(). Keying on the project name again is what '
    + 'left two thirds of landed houses unreachable by the street they are on.');
  assert.ok(!/r\.project === (GENERIC_)?LANDED\b/.test(key[1]),
    'projKey is back to testing the project name');
  assert.match(src, /const isHouse = r =>[^;]*!STRATA\.test/,
    'isHouse stopped excluding strata, so strata units will be moved onto street pages');
});

test('every street page holds exactly the house sales filed on that street', () => {
  /* The general form of the Cashew Crescent check, over all of them. Exact
     equality held on all 1,014 streets when this was written, and it cannot
     drift as the window rolls because both sides are rebuilt from the same
     rows. */
  const byStreet = new Map();
  for (const x of priv.rows) if (isHouse(x)) byStreet.set(x.street, (byStreet.get(x.street) || 0) + 1);
  const wrong = Object.values(landedRecords)
    .filter(r => r.n !== (byStreet.get(r.street) || 0))
    .map(r => `${r.href}: page ${r.n}, filed ${byStreet.get(r.street) || 0}`);
  assert.deepEqual(wrong.slice(0, 8), [], `${wrong.length} street page(s) disagree with the sales filed on them`);
});
