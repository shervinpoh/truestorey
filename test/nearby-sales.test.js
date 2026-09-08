/**
 * A cap counted as if it were a market.
 *
 * The per-band totals came out of the first build as 20, 40, 60, 140, 180 —
 * exact multiples of twenty, because comps.json keeps at most twenty sales per
 * address and 1,551 of its 13,162 records sit exactly at that limit. "180
 * sales within 1,000 m" would have been false AND falsely precise, which is
 * the worse of the two.
 *
 * So the shape enforces the distinction: `projects` is exact and is what the
 * page leads on, `indexed` is what the file holds and is never presented as a
 * count of sales that happened, and `atCap` says how many addresses have sold
 * more than is counted. Renaming `indexed` back to `sales` is the edit that
 * quietly turns a cap into a census.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { nearbySales, BANDS, ROW_CAP, PER_PROJECT_CAP } from '../lib/comps/nearbySales.js';

const comps = JSON.parse(readFileSync(path.join(process.cwd(), 'data', 'comps.json'), 'utf8'));
const anyCondo = Object.keys(comps.records).find(h => h.startsWith('/condo/')
  && nearbySales({ href: h }, comps));

test('a record with no coordinate or no neighbours gets nothing, not an empty shape', () => {
  assert.equal(nearbySales({ href: '/condo/does-not-exist' }, comps), null);
  assert.equal(nearbySales(null, comps), null);
  assert.equal(nearbySales({ href: anyCondo }, { records: {} }), null);
});

test('the sale figure is never presented as a count of sales that happened', () => {
  const d = nearbySales({ href: anyCondo }, comps);
  for (const b of d.counts) {
    assert.equal(b.sales, undefined,
      'a field named `sales` reads as a census; it is capped at ' + PER_PROJECT_CAP + ' per address');
    assert.ok(Number.isInteger(b.indexed));
    assert.ok(Number.isInteger(b.projects));
    assert.ok(b.atCap <= b.projects);
  }
  assert.equal(d.perProjectCap, PER_PROJECT_CAP, 'the cap must travel with the counts');
});

test('bands are nested, so a wider radius can never hold less', () => {
  const d = nearbySales({ href: anyCondo }, comps);
  assert.deepEqual(d.bands, [...d.bands].sort((a, b) => a - b));
  for (let i = 1; i < d.counts.length; i++) {
    assert.ok(d.counts[i].projects >= d.counts[i - 1].projects,
      `${d.counts[i].radius}m holds fewer projects than ${d.counts[i - 1].radius}m`);
    assert.ok(d.counts[i].indexed >= d.counts[i - 1].indexed);
  }
});

test('only the same kind is counted', () => {
  // HDB blocks outnumber condos around most addresses by an order of
  // magnitude; folding them in would make the count a statement about how
  // much HDB is nearby rather than about this market.
  const d = nearbySales({ href: anyCondo }, comps);
  const self = comps.records[anyCondo];
  for (const r of d.rows) {
    assert.equal(comps.records[r.href].kind, self.kind);
    assert.notEqual(r.href, anyCondo, 'the record must not appear among its own neighbours');
  }
});

test('rows are newest first and bounded', () => {
  const d = nearbySales({ href: anyCondo }, comps);
  assert.ok(d.rows.length <= ROW_CAP);
  for (let i = 1; i < d.rows.length; i++) {
    assert.ok(d.rows[i].month <= d.rows[i - 1].month, 'rows are not in newest-first order');
  }
  const widest = d.bands[d.bands.length - 1];
  for (const r of d.rows) assert.ok(r.m <= widest, `${r.m}m is outside the widest band`);
});

test('the payload stays small enough to ship twice', () => {
  // App Router puts a server component's props in the RSC payload as well as
  // the markup. /mop and /market each shipped a whole dataset once already.
  let worst = 0;
  const hrefs = Object.keys(comps.records).filter(h => h.startsWith('/condo/'));
  for (const h of hrefs.filter((_, i) => i % 40 === 0)) {
    const d = nearbySales({ href: h }, comps);
    if (d) worst = Math.max(worst, JSON.stringify(d).length);
  }
  assert.ok(worst < 25000, `worst payload is ${worst} bytes; the counts-plus-capped-rows shape `
    + 'exists precisely so this cannot grow with the density of the neighbourhood');
});

test('every band the component can select has a matching count', () => {
  const d = nearbySales({ href: anyCondo }, comps);
  assert.equal(d.counts.length, d.bands.length);
  assert.deepEqual(d.counts.map(c => c.radius), BANDS);
});
