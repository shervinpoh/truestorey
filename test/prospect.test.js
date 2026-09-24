/**
 * Where the next sellers are. Every case here is built from invented sales in
 * a temporary folder: the lists are rules about dates and prices, and a test
 * that read tonight's real data would fail tomorrow night.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prospect, _clearCache } from '../lib/consult/prospect.js';

const hdbRow = (month, town, block, street, type, price, lease) => ({
  month, town, flatType: type, block, street, storeyRange: '07 TO 09', areaSqm: 93,
  leaseCommence: lease, price, psf: price / (93 * 10.7639),
});
const privRow = (project, date, typeOfSale, propertyType = 'Condominium', district = '19') => ({
  project, district, marketSegment: 'OCR', propertyType, typeOfSale, contractDate: date,
  street: 'X', tenure: '99 yrs lease commencing from 2021', floorRange: '06-10', areaSqm: 90, price: 1.5e6, psf: 1550,
});

function fixture() {
  const hdb = { monthsBack: 36, rows: [
    // A: completed 2021; first resale ever arrives Aug 2026 — its MOP has just opened.
    hdbRow('2026-08', 'PUNGGOL', '301A', 'PUNGGOL DR', '4 ROOM', 620000, 2021),
    hdbRow('2026-09', 'PUNGGOL', '301A', 'PUNGGOL DR', '4 ROOM', 630000, 2021),
    // B: an old block; its 4-room high is set this month.
    ...['2024-01', '2024-06', '2025-03', '2025-11'].map(m => hdbRow(m, 'BEDOK', '12', 'BEDOK NTH', '4 ROOM', 480000, 1985)),
    hdbRow('2026-09', 'BEDOK', '12', 'BEDOK NTH', '4 ROOM', 560000, 1985),
    // C: old block whose first sale in the window is recent — not an MOP opening.
    hdbRow('2026-07', 'BEDOK', '99', 'BEDOK STH', '3 ROOM', 400000, 1990),
    // the window reaches back to Oct 2023
    hdbRow('2023-10', 'TAMPINES', '1', 'TAMPINES ST 1', '5 ROOM', 600000, 1988),
  ] };
  const priv = { rows: [
    // P1: bought new Aug 2023, never resold — duty lapsed Aug 2026, not completed.
    ...[1, 2, 3, 4].map(() => privRow('PROJECT ONE', '0823', '1')),
    // P2: bought Aug 2025 — the 4-year schedule applies, so nothing lapses until 2029.
    ...[1, 2, 3].map(() => privRow('PROJECT TWO', '0825', '1')),
    // P2 also: bought Sep 2022 — lapsed a year ago, outside the window.
    ...[1, 2, 3].map(() => privRow('PROJECT TWO', '0922', '3')),
    // P3: resales in Sep 2023 — lapsing now, and a completed project.
    ...[1, 2, 3].map(() => privRow('PROJECT THREE', '0923', '3')),
    // An EC bought new in Aug 2023: its MOP governs, not SSD.
    ...[1, 2, 3].map(() => privRow('EC ONE', '0823', '1', 'Executive Condominium')),
    // "now" for the private data
    privRow('ANYWHERE', '0926', '3'),
  ] };
  const mop = { caveat: 'earliest possible', towns: { PUNGGOL: { town: 'PUNGGOL', byYear: {
    2026: { list: [
      { block: '310A', street: 'PUNGGOL WAY', town: 'PUNGGOL', units: 200, earliestMop: 2026, yearCompleted: 2021, resalesSeen: 0 },
      { block: '301A', street: 'PUNGGOL DR', town: 'PUNGGOL', units: 180, earliestMop: 2026, yearCompleted: 2021, resalesSeen: 2 },
    ] },
    2027: { list: [{ block: '320B', street: 'PUNGGOL FIELD', town: 'PUNGGOL', units: 150, earliestMop: 2027, yearCompleted: 2022, resalesSeen: 0 }] },
  } } } };
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prospect-'));
  fs.mkdirSync(path.join(d, 'data'));
  for (const [n, v] of [['hdb.json', hdb], ['private.json', priv], ['mop.json', mop]]) fs.writeFileSync(path.join(d, 'data', n), JSON.stringify(v));
  _clearCache();
  return d;
}

test('a young block whose first-ever resale has just been filed is an MOP opening; an old block is not', () => {
  const p = prospect({ root: fixture() });
  const labels = p.opened.rows.map(r => r.label);
  assert.ok(labels.includes('Blk 301A PUNGGOL DR'));
  assert.ok(!labels.includes('Blk 99 BEDOK STH'), 'a 1990 block\'s first sale in the window is the window\'s edge, not an opening');
  const a = p.opened.rows.find(r => r.label === 'Blk 301A PUNGGOL DR');
  assert.equal(a.firstMonth, '2026-08');
  assert.match(a.says, /first resale here was filed in 2026-08: a 4-room for S\$620,000/);
});

test('a new high for a flat type in the block is found, with the gap to the previous high', () => {
  const p = prospect({ root: fixture() });
  const b = p.records.rows.find(r => r.label === 'Blk 12 BEDOK NTH');
  assert.ok(b, 'the new 4-room high was missed');
  assert.equal(b.price, 560000);
  assert.equal(b.previous, 480000);
  assert.match(b.says, /highest of 5 4-room sales/);
  assert.match(b.says, /S\$80,000 above the next/);
});

test('blocks reaching MOP soon are the ones nobody has resold in yet', () => {
  const p = prospect({ root: fixture() });
  const labels = p.mopSoon.rows.map(r => r.label);
  assert.ok(labels.includes('Blk 310A PUNGGOL WAY'));
  assert.ok(labels.includes('Blk 320B PUNGGOL FIELD'), 'next year is in the list too');
  assert.ok(!labels.includes('Blk 301A PUNGGOL DR'), 'a block that has already resold is past this stage');
});

test('seller\'s stamp duty follows the schedule of the PURCHASE date', () => {
  /* Bought before 4 Jul 2025: three years. On or after: four. A purchase in
     Aug 2025 does not lapse in 2026 however it is counted. */
  const p = prospect({ root: fixture() });
  const names = p.ssd.rows.map(r => r.project);
  assert.ok(names.includes('PROJECT ONE'));
  assert.ok(names.includes('PROJECT THREE'));
  assert.ok(!names.includes('PROJECT TWO'), 'a 2025 purchase is on the four-year schedule; a 2022 one lapsed long ago');
});

test('an executive condominium is left out: its MOP decides when it can be sold, not SSD', () => {
  const p = prospect({ root: fixture() });
  assert.ok(!p.ssd.rows.some(r => r.project === 'EC ONE'));
});

test('a project with no resale filed is flagged as a likely sub-sale; a resold one is not', () => {
  const p = prospect({ root: fixture() });
  const one = p.ssd.rows.find(r => r.project === 'PROJECT ONE');
  const three = p.ssd.rows.find(r => r.project === 'PROJECT THREE');
  assert.equal(one.completed, false);
  assert.match(one.says, /sub-sale/);
  assert.equal(three.completed, true);
  assert.ok(!/sub-sale/.test(three.says));
});

test('a town filter narrows the HDB lists and leaves the condo list alone', () => {
  const root = fixture();
  const all = prospect({ root });
  const bedok = prospect({ root, town: 'BEDOK' });
  assert.ok(bedok.opened.rows.every(r => r.town === 'BEDOK'));
  assert.ok(bedok.records.rows.every(r => r.town === 'BEDOK'));
  assert.ok(bedok.mopSoon.rows.every(r => r.town === 'BEDOK'));
  assert.equal(bedok.ssd.total, all.ssd.total);
});

test('every row carries a line to open with, and no row carries a code', () => {
  const p = prospect({ root: fixture() });
  for (const l of ['opened', 'records', 'mopSoon', 'ssd']) {
    for (const r of p[l].rows) {
      assert.ok(typeof r.says === 'string' && r.says.length > 40, `${l}: no line`);
      assert.ok(!/undefined|NaN|null/.test(r.says), `${l}: ${r.says}`);
    }
  }
});

test('with no data on disk it says so rather than throwing', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prospect-empty-'));
  _clearCache();
  assert.equal(prospect({ root: d }).ok, false);
  _clearCache();
});
