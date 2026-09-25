/**
 * The unit itself: the agent's adjustment, and the measured limits beside it.
 *
 * Asked whether facing, layout and corner-or-corridor could be priced, the
 * answer was that no public record says which unit sold — so the tool may
 * not put a number on any of them, and the agent's own adjustment is shown
 * against how far units on the same floors have actually sold apart.
 *
 * Every sale here is invented in a temporary folder. The limits are rules
 * about grouping and arithmetic; a test that read tonight's real sales would
 * fail the night a block filed another, and that blocks the data refresh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unitSpread, unitAdjust, parsePct, clientUnit, FACTORS, MIN_GROUPS, MAX_ADJUST, _clearCache } from '../lib/consult/unit.js';
import { redact } from '../lib/consult/redact.js';

const hdbRow = (block, psf, { month = '2026-02', model = 'Model A', area = 93, storey = '07 TO 09', town = 'BEDOK', street = 'BEDOK NTH' } = {}) => ({
  month, town, flatType: '4 ROOM', block, street, storeyRange: storey, areaSqm: area, model,
  leaseCommence: 1990, price: psf * area * 10.7639, psf,
});
const privRow = (project, psf, { tos = '3', date = '0226', floor = '06-10', area = 90, type = 'Condominium', district = '15' } = {}) => ({
  project, street: 'X ROAD', district, marketSegment: 'RCR', propertyType: type, tenure: 'Freehold',
  typeOfSale: tos, contractDate: date, floorRange: floor, areaSqm: area, price: psf * area * 10.7639, psf, noOfUnits: 1,
});

function fixture({ hdb = [], priv = [] } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-'));
  fs.mkdirSync(path.join(d, 'data'));
  fs.writeFileSync(path.join(d, 'data', 'hdb.json'), JSON.stringify({ rows: hdb }));
  fs.writeFileSync(path.join(d, 'data', 'private.json'), JSON.stringify({ rows: priv }));
  _clearCache();
  return d;
}

/* Ten same-floor pairs in one block, each 100 and 110 psf. */
const tenPairs = (block, lo = 100, hi = 110, extra = {}) =>
  Array.from({ length: MIN_GROUPS }, (_, i) => [
    hdbRow(block, lo, { ...extra, area: 90 + i }), hdbRow(block, hi, { ...extra, area: 90 + i }),
  ]).flat();

const hdbRec = (block = '1', street = 'BEDOK NTH', town = 'BEDOK') => ({ kind: 'HDB', block, street, town });

test('the limit is one unit against the typical one, not the gap between two', () => {
  /* Two sales 10% apart: each sits ~4.9% from their mean, and the mean was
     estimated from those two, so the honest distance is √2 times that — 6.9%,
     about the pair gap over √2. Reading the pair gap itself would call a
     typical unit twice as unusual as it is. */
  const root = fixture({ hdb: tenPairs('1') });
  const s = unitSpread(hdbRec(), { root });
  assert.equal(s.ran, true);
  assert.equal(s.scope, 'block');
  const expected = Math.exp(Math.abs(Math.log(110) - (Math.log(100) + Math.log(110)) / 2) * Math.SQRT2) - 1;
  assert.ok(Math.abs(s.typical - expected) < 0.0002, `${s.typical} vs ${expected}`);
  assert.ok(s.typical < 0.1, 'the pair gap is not the limit');
});

test('a block with too few same-floor sales widens to its town, and says so', () => {
  const root = fixture({ hdb: [
    ...tenPairs('2'),
    hdbRow('1', 100), hdbRow('1', 104),
  ] });
  const s = unitSpread(hdbRec('1'), { root });
  assert.equal(s.scope, 'town');
  assert.match(s.widened, /1 same-floor group at this block/);
  assert.match(s.says, /^Across HDB blocks in Bedok,/);
});

test('a maisonette and an apartment of one size on one floor are not compared', () => {
  /* Different layouts are different homes; their gap is not a unit's position. */
  const pairs = Array.from({ length: MIN_GROUPS }, (_, i) => [
    hdbRow('3', 100, { area: 140 + i, model: 'Maisonette' }), hdbRow('3', 130, { area: 140 + i, model: 'Apartment' }),
  ]).flat();
  const root = fixture({ hdb: [...pairs, ...tenPairs('4')] });
  const s = unitSpread(hdbRec('3'), { root });
  assert.notEqual(s.scope, 'block', 'no same-layout pairs exist at block 3, so it cannot be measured there');
});

test('launch prices and resales are never mixed; a new project reads its own price list', () => {
  const launch = Array.from({ length: MIN_GROUPS }, (_, i) => [
    privRow('NEW ONE', 2000, { tos: '1', area: 80 + i }), privRow('NEW ONE', 2040, { tos: '1', area: 80 + i }),
  ]).flat();
  const districtResales = Array.from({ length: MIN_GROUPS }, (_, i) => [
    privRow(`OLD ${i}`, 1500), privRow(`OLD ${i}`, 1650),
  ]).flat();
  const root = fixture({ priv: [...launch, ...districtResales] });
  const s = unitSpread({ kind: 'PRIVATE', project: 'NEW ONE', label: 'NEW ONE', district: '15' }, { root });
  assert.equal(s.basis, 'developer price list');
  assert.ok(s.typical < 0.02, 'a 2% launch ladder must not be read through a 10% resale spread');
  const old = unitSpread({ kind: 'PRIVATE', project: 'OLD 1', label: 'OLD 1', district: '15' }, { root });
  assert.equal(old.scope, 'district');
});

test('a landed home says it was not measured rather than borrowing a condo figure', () => {
  const s = unitSpread({ kind: 'PRIVATE', landed: true, label: 'X', district: '15' }, { root: fixture() });
  assert.equal(s.ran, false);
  assert.match(s.why, /landed/i);
});

/* ── the adjustment ─────────────────────────────────────────────────────── */

test('a minus sign survives: -3, −3 and "-3%" are all minus three percent', () => {
  /* The panel's numeric reader strips everything but digits and points, so a
     typed "-3" reached the server as +3 — the one failure this field cannot
     have. The text is parsed here instead. */
  for (const v of ['-3', '−3', '-3%', ' -3 ', '–3']) assert.equal(parsePct(v), -0.03, JSON.stringify(v));
  assert.equal(parsePct('+2.5'), 0.025);
  assert.equal(parsePct(''), 0);
  assert.ok(Number.isNaN(parsePct('abc')));
  assert.ok(Number.isNaN(parsePct('3-')));
});

test('the panel sends the adjustment as typed, not through the unsigned reader', () => {
  const ui = fs.readFileSync(new URL('../scripts/consult-ui.html', import.meta.url), 'utf8');
  const fn = ui.slice(ui.indexOf('function unitInput()'), ui.indexOf('function unitInput()') + 600);
  assert.ok(fn.length > 100, 'unitInput() is gone — the adjustment is being read somewhere else');
  assert.doesNotMatch(fn, /\bnum\(|toNum\(/, 'toNum drops the minus sign: -3% would arrive as +3%');
});

const est = { ok: true, band: { psfLow: 600, psfHigh: 640, priceLow: 790000, priceHigh: 842000 } };
const spread = { ran: true, typical: 0.02, oneInFour: 0.04, oneInTen: 0.06, where: 'this block' };

test('nothing entered is no adjustment at all', () => {
  assert.equal(unitAdjust(est, {}, spread), null);
  assert.equal(unitAdjust(est, { pct: '', factors: [], note: '  ' }, spread), null);
});

test('the adjustment moves a copy; the measured range is left exactly as it was', () => {
  const before = JSON.stringify(est);
  const u = unitAdjust(est, { pct: '3', factors: ['corner'] }, spread);
  assert.equal(JSON.stringify(est), before);
  assert.equal(u.band.priceLow, 814000);
  assert.equal(u.band.priceHigh, 867000);
  assert.equal(u.basis, 'judgement');
});

test('past what one unit in ten does, it says so; past a fifth it refuses', () => {
  assert.equal(unitAdjust(est, { pct: '3' }, spread).beyond, null);
  assert.equal(unitAdjust(est, { pct: '5' }, spread).beyond, 'oneInFour');
  const far = unitAdjust(est, { pct: '-8' }, spread);
  assert.equal(far.beyond, 'oneInTen');
  assert.match(far.caution, /one unit in ten/i);
  const silly = unitAdjust(est, { pct: String(100 * MAX_ADJUST + 1) }, spread);
  assert.equal(silly.ok, false);
  assert.match(silly.why, /different property/);
});

test('ticking only good things and moving the price down is queried', () => {
  assert.match(unitAdjust(est, { pct: '-2', factors: ['corner', 'view'] }, spread).mismatch, /Check the sign/);
  assert.equal(unitAdjust(est, { pct: '-2', factors: ['corner', 'westSun'] }, spread).mismatch, null);
});

test('no factor carries a number: the tool never prices corner or facing itself', () => {
  /* A language model never assigns a number, and nor does a lookup table
     somebody filled in from memory. The factors are reasons, not rates. */
  for (const f of FACTORS) {
    for (const [k, v] of Object.entries(f)) assert.notEqual(typeof v, 'number', `${f.key}.${k} is a number`);
  }
  const ticked = unitAdjust(est, { factors: FACTORS.map(f => f.key) }, spread);
  assert.equal(ticked.pct, 0);
  assert.deepEqual(ticked.band, { psfLow: 600, psfHigh: 640, priceLow: 790000, priceHigh: 842000 });
});

/* ── who sees it ────────────────────────────────────────────────────────── */

test('the adjustment stays off a client copy unless the agent switched it on', () => {
  const report = u => ({ record: {}, input: {}, estimate: est, unit: u, generatedAt: 'x' });
  const off = redact(report(unitAdjust(est, { pct: '3' }, spread)));
  assert.equal(off.unit, undefined);
  assert.ok(off.withheld.some(w => /adjustment for the unit/.test(w)));

  const on = redact(report(unitAdjust(est, { pct: '-9', factors: ['corner'], onReport: true }, spread)));
  assert.ok(on.unit?.ok);
  assert.equal(on.unit.caution, undefined, 'the caution is the agent\'s working');
  assert.equal(on.unit.mismatch, undefined, 'so is the sign check');
  assert.ok(!on.withheld.some(w => /adjustment for the unit/.test(w)));
});

test('a refused adjustment never reaches a client, switched on or not', () => {
  assert.equal(clientUnit(unitAdjust(est, { pct: '40', onReport: true }, spread)), null);
});
