import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuantum, sizeBand } from '../lib/quantum.js';
import { readFileSync } from 'node:fs';

const h = (price, areaSqm = 82, month = '2025-04', town = 'BISHAN') =>
  ({ price, areaSqm, month, town });
const p = (price, areaSqm = 82, contractDate = '0425', marketSegment = 'RCR',
  propertyType = 'Condominium', noOfUnits = 1) =>
  ({ price, areaSqm, contractDate, marketSegment, propertyType, noOfUnits });

test('a size band has an exact lower edge and never accepts an implausible area', () => {
  assert.equal(sizeBand(79.9), 60);
  assert.equal(sizeBand(80), 80);
  assert.equal(sizeBand(19), null);
  assert.equal(sizeBand(400), null);
});

test('whole prices are grouped by place, size and year, with thin cohorts withheld', () => {
  const prices = Array.from({ length: 20 }, (_, i) => 500_000 + i * 10_000);
  const q = buildQuantum({
    hdbRows: [...prices.map(x => h(x)), h(999_999, 102), h(999_999, 82, '2024-04'),
      h(999_999, 82, '2025-04', 'BEDOK')],
  });
  assert.equal(q.hdb.rows.length, 1);
  assert.deepEqual(q.hdb.rows[0].slice(0, 4), ['BISHAN', 80, 2025, 20]);
  assert.equal(q.hdb.rows[0][5], 595_000, 'median must be derived from those twenty filed prices');
  assert.ok(q.hdb.rows[0][4] < q.hdb.rows[0][5]);
  assert.ok(q.hdb.rows[0][6] > q.hdb.rows[0][5]);
});

test('private regions exclude ECs, landed and bulk deals from condo price cohorts', () => {
  const base = Array.from({ length: 20 }, (_, i) => p(1_000_000 + i * 10_000));
  const q = buildQuantum({ privateRows: [...base,
    p(9_000_000, 82, '0425', 'RCR', 'Executive Condominium'),
    p(9_000_000, 82, '0425', 'RCR', 'Terrace'),
    p(9_000_000, 82, '0425', 'RCR', 'Condominium', 2),
  ] });
  assert.equal(q.private.rows.length, 1);
  assert.equal(q.private.rows[0][3], 20);
  assert.deepEqual(q.private.period, { from: '2025-04', to: '2025-04' });
});

test('the published cohorts carry source periods and no below-threshold slice', () => {
  const q = JSON.parse(readFileSync(new URL('../data/quantum.json', import.meta.url)));
  assert.ok(q.hdb.rows.length > 0 && q.private.rows.length > 0);
  assert.ok(q.hdb.period.from && q.hdb.period.to && q.private.period.from && q.private.period.to);
  assert.ok(q.source.hdb && q.source.private);
  for (const row of [...q.hdb.rows, ...q.private.rows]) {
    assert.ok(row[3] >= q.minSales);
    assert.ok(row[4] <= row[5] && row[5] <= row[6]);
  }
});
