/**
 * Primary 1 data, read from MOE's own page. What each school's "reach" is
 * rests entirely on reading MOE's sentence correctly, so every wording MOE
 * used in the 2025 exercise is pinned here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reachOf, ratioOf, moeKey, nameKey } from '../lib/p1.js';

const row = (copy, ballot = true, vacancies = 50) => ({ vacancies, applicants: 80, ballot, copy });

test('MOE’s wording is read into the right step', () => {
  const cases = [
    ['Conducted for: Singapore Citizen children residing within 1km of the school.', true, 'ballot1'],
    ['Conducted for: Singapore Citizen children residing between 1km and 2km of the school.', true, 'ballot12'],
    ['Conducted for: Singapore Citizen children residing outside 2km of the school.', true, 'within2'],
    ['No balloting was conducted. Places were offered only to Singapore Citizen children residing within 1km of the school.', false, 'within1'],
    ['No balloting was conducted. Places were offered only to Singapore Citizen children residing within 2km of the school.', false, 'within2'],
    ['No balloting was conducted. Places were offered to all Singapore Citizen children.', false, 'open'],
    ['No balloting was conducted. Places were offered to all Singapore Citizen children, and Permanent Resident children residing within 1km of the school.', false, 'open'],
    ['', false, 'open'],
  ];
  for (const [copy, ballot, key] of cases) assert.equal(reachOf(row(copy, ballot)).key, key, copy || '(no wording)');
  const pr = reachOf(row('Conducted for: Permanent Resident children residing within 1km of the school.'));
  assert.equal(pr.key, 'open', 'a PR-only ballot means every citizen got a place');
  assert.equal(pr.pr, true, 'and it must still say a PR ballot happened');
  assert.equal(reachOf(row('', false, 0)).key, 'none');
  assert.equal(reachOf(row('Something MOE has never written before', true)).step, null, 'new wording must read as unread, not as a colour');
  assert.equal(ratioOf({ vacancies: 49, applicants: 118 }), 2.41);
  assert.equal(ratioOf({ vacancies: 0, applicants: 5 }), null);
});

test('every school MOE lists resolves to a school with a coordinate', () => {
  let p1;
  try { p1 = JSON.parse(readFileSync(new URL('../data/p1.json', import.meta.url), 'utf8')); } catch { return; }
  const pts = JSON.parse(readFileSync(new URL('../data/amenities.json', import.meta.url), 'utf8'))
    .layers.schools.points.filter(s => /PRIMARY|P1/.test(s.level));
  const keys = new Set(pts.map(s => nameKey(s.name)));
  for (const [year, schools] of Object.entries(p1.years)) {
    const missing = Object.keys(schools).filter(n => !keys.has(moeKey(n)));
    assert.deepEqual(missing, [], `${year}: MOE schools with no coordinate — add an exact alias in lib/p1.js`);
    assert.ok(Object.keys(schools).length >= 150, `${year}: only ${Object.keys(schools).length} schools`);
  }
});
