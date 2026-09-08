/**
 * The feed handing back N copies of one list, and the launch that really did
 * sell N identical units.
 *
 * Kew Drive arrived as three project entries in one batch: KEW VALE with 36
 * transactions and 36 distinct, KEW GROVE with 4 and 4, and LANDED HOUSING
 * DEVELOPMENT with 33 and 11 — three copies of everything. The page listed the
 * same terrace three times, and a 1,335.6 sqm detached at S$16,300,000 three
 * times in one month.
 *
 * The dangerous fix is "drop rows that appear twice". Identical sales are real:
 * a launch sells identical units at one price in one month and URA files each
 * separately, so that rule would delete real transactions, understate volume
 * and drag every median on the site. What separates the two is whether the
 * repetition is UNIFORM — measured across all 3,857 entries of one download,
 * named projects repeat some rows (9.1% non-integer ratios) and the landed
 * pseudo-project repeats all of them (22.7% exactly x2, 10.0% exactly x3).
 *
 * These assertions are about that distinction, because loosening it is what
 * would quietly start deleting sales.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeEntry, MIN_DISTINCT_TO_COLLAPSE } from '../scripts/ingest-ura.mjs';

const t = (price, area, date = '0625') => ({
  contractDate: date, price, area, propertyType: 'Terrace', typeOfSale: '3',
  floorRange: '-', tenure: '99 yrs lease commencing from 1994', district: '16', noOfUnits: 1,
});

const entry = transaction => ({ project: 'LANDED HOUSING DEVELOPMENT', street: 'X', transaction });

test('an entry repeated whole collapses to one copy', () => {
  const three = [t(3000000, 212.6), t(2800000, 212.9), t(2740000, 213.2)];
  assert.equal(dedupeEntry(entry([...three, ...three, ...three])).length, 3);
  assert.equal(dedupeEntry(entry([...three, ...three])).length, 3);
});

test('a launch selling identical units keeps every one of them', () => {
  // Some rows repeat, others do not: a non-integer ratio, and real.
  const mixed = [t(1850000, 60), t(1850000, 60), t(1850000, 60), t(1990000, 70), t(2100000, 80)];
  assert.equal(dedupeEntry(entry(mixed)).length, 5,
    'a partially repeated entry is a real launch and must be left whole');
});

test('the collapse needs enough distinct sales to rule out coincidence', () => {
  // Two identical apartments filed twice is x2 and is plausibly real.
  const two = [t(1850000, 60), t(1850000, 60)];
  assert.equal(dedupeEntry(entry(two)).length, 2);
  const pair = [t(1850000, 60), t(1990000, 70)];
  assert.equal(dedupeEntry(entry([...pair, ...pair])).length, 4,
    `below ${MIN_DISTINCT_TO_COLLAPSE} distinct sales an exact ratio can be chance`);
  assert.ok(MIN_DISTINCT_TO_COLLAPSE >= 3, 'the floor must not drop below three');
});

test('rows that differ in any published field are different sales', () => {
  // Same price and month, different floor band: two units, not one filed twice.
  const a = { ...t(1850000, 60), floorRange: '06-10' };
  const b = { ...t(1850000, 60), floorRange: '11-15' };
  const c = { ...t(1850000, 60), floorRange: '16-20' };
  assert.equal(dedupeEntry(entry([a, b, c, a, b, c])).length, 3);
  assert.equal(dedupeEntry(entry([a, b, c])).length, 3, 'three distinct bands must all survive');
});

test('an entry too short to judge is returned untouched', () => {
  assert.equal(dedupeEntry(entry([t(1, 1)])).length, 1);
  assert.equal(dedupeEntry({ transaction: [] }).length, 0);
  assert.equal(dedupeEntry(null).length, 0);
});
