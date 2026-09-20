/**
 * Stacks. The premium a unit number buys, and the ways it can mislead.
 *
 * Every test here runs against a temp root rather than data/.realis.json,
 * because a licensed export is not in the repo and never will be — a test
 * that passes only on the machine holding the file is not a test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stackProfile, monthOf, MIN_SALES, VERSION } from '../lib/consult/stacks.js';

/** Writes a .realis.json store and returns a root to point stackProfile at. */
function root(rows) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-'));
  fs.mkdirSync(path.join(d, 'data'));
  fs.writeFileSync(path.join(d, 'data', '.realis.json'), JSON.stringify({ rows }));
  return d;
}
const sale = (stack, floor, psf, date, o = {}) => ({
  project: 'TESTVIEW RESIDENCES', stack, floor, psf, date,
  unit: `#${String(floor).padStart(2, '0')}-${stack}`,
  areaSqm: 100, propertyType: 'Condominium', ...o,
});
/** n sales in one stack, all in one recent month, so time never confounds. */
const full = (stack, psf, floors = [5, 15, 25]) => floors.map(f => sale(stack, f, psf, 'Jun-26'));

test('monthOf reads the formats REALIS actually ships, and refuses the rest', () => {
  assert.equal(monthOf('Mar-26'), '2026-03');
  assert.equal(monthOf('mar 26'), '2026-03');
  assert.equal(monthOf('03/26'), '2026-03');
  assert.equal(monthOf('2026-03-14'), '2026-03');
  /* A refusal must be null, not a guess — a wrong month silently restates a
     price by years of index and the figure still looks plausible. */
  for (const junk of ['', null, 'Q1 2026', 'Marchish', '13-26', 'xyz-26']) assert.equal(monthOf(junk), null);
});

test('a missing export is a reason, never a throw', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-empty-'));
  const r = stackProfile('ANYTHING', { root: d });
  assert.equal(r.ok, false);
  assert.match(r.reason, /No REALIS export/);
});

test('a project the export does not cover says so, and says what it does hold', () => {
  const r = stackProfile('SOME OTHER PLACE', { root: root(full('01', 2000)) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /holds 1 project/);
});

test('project names match across casing and spacing', () => {
  const d = root([...full('01', 2400), ...full('09', 1900)]);
  for (const name of ['TESTVIEW RESIDENCES', 'Testview  Residences', 'testview residences', 'Testview-Residences']) {
    assert.equal(stackProfile(name, { root: d }).ok, true, name);
  }
});

test('a stack below the minimum is not scored, and is counted rather than dropped', () => {
  /* Silent truncation reads as completeness — the panel must be able to say
     how many stacks it declined to price. */
  const thin = [sale('07', 5, 5000, 'Jun-26'), sale('07', 15, 5000, 'Jun-26')];
  const r = stackProfile('TESTVIEW RESIDENCES', { root: root([...full('01', 2000), ...full('09', 2000), ...thin]) });
  assert.equal(r.stacksSeen, 3);
  assert.equal(r.stacksScored, 2);
  assert.equal(r.thin, 1);
  assert.equal(r.stacks.length, 2);
  assert.ok(!r.stacks.some(s => s.stack === '07'), 'a 2-sale stack must not carry a premium');
  assert.ok(MIN_SALES >= 3);
});

test('premiums are measured against the project median and carry their direction', () => {
  const r = stackProfile('TESTVIEW RESIDENCES', {
    root: root([...full('01', 2400), ...full('05', 2000), ...full('09', 1600)]),
  });
  assert.equal(r.ok, true);
  assert.equal(r.projectMedianPsf, 2000);
  const by = Object.fromEntries(r.stacks.map(s => [s.stack, s]));
  assert.ok(by['01'].premium > 0.15, 'bay-facing stack above the project');
  assert.equal(Math.round(by['05'].premium * 1000) / 1000, 0);
  assert.ok(by['09'].premium < -0.15, 'carpark-facing stack below it');
  /* Sorted best first, because the spread is the finding. */
  assert.equal(r.stacks[0].stack, '01');
  assert.equal(r.stacks.at(-1).stack, '09');
  assert.match(r.says, /spread of/);
});

test('an old stack is restated, not read as cheap', () => {
  /* Two identical stacks, one that last sold years ago at a lower nominal
     psf. Without the index the old one looks like a discount that does not
     exist, which is the exact mistake a stack table would otherwise invite. */
  const old = ['Jan-19', 'Mar-19', 'Jun-19'].map((d, i) => sale('09', 5 + 10 * i, 1400, d));
  const now = full('01', 2000);
  const r = stackProfile('TESTVIEW RESIDENCES', { root: root([...now, ...old]) });
  const by = Object.fromEntries(r.stacks.map(s => [s.stack, s]));
  assert.ok(by['09'].medianPsf > 1400, `restated upward, got ${by['09'].medianPsf}`);
  assert.ok(r.restatedTo, 'the quarter everything was moved to is reported');
});

test('every scored stack shows the sales it was built from', () => {
  const r = stackProfile('TESTVIEW RESIDENCES', { root: root([...full('01', 2400), ...full('09', 1900)]) });
  for (const s of r.stacks) {
    assert.equal(s.sales.length, s.n);
    for (const x of s.sales) {
      assert.ok(x.unit && Number.isFinite(x.psf) && Number.isFinite(x.psfAdj));
      assert.ok(x.month, 'a sale with no readable month must still be shown');
    }
  }
});

test('the within-stack floor premium needs three stacks, and says so when it has not got them', () => {
  const two = stackProfile('TESTVIEW RESIDENCES', { root: root([...full('01', 2000), ...full('09', 2000)]) });
  assert.equal(two.floorPremium.ran, false);
  assert.match(two.floorPremium.why, /Three is the floor/);

  /* Three stacks, each priced 0.5% per floor above its own base. Nothing
     differs within a stack except height, which is the whole claim. */
  const rows = [];
  for (const [stack, base] of [['01', 2400], ['05', 2000], ['09', 1700]])
    for (const f of [5, 15, 25]) rows.push(sale(stack, f, base * (1 + 0.005 * (f - 5)), 'Jun-26'));
  const r = stackProfile('TESTVIEW RESIDENCES', { root: root(rows) });
  assert.equal(r.floorPremium.ran, true);
  assert.equal(r.floorPremium.pairs, 3);
  assert.ok(Math.abs(r.floorPremium.perFloorPct - 0.005) < 0.0005,
    `recovered ${r.floorPremium.perFloorPct} against a built-in 0.005`);
});

test('a floor span no single tower could have is flagged, not published quietly', () => {
  /* Two towers sharing a unit number merge into one stack and nothing in an
     export distinguishes them. The figure still prints; the caller is told. */
  const r = stackProfile('TESTVIEW RESIDENCES', {
    root: root([sale('01', 3, 2000, 'Jun-26'), sale('01', 40, 2000, 'Jun-26'), sale('01', 88, 2000, 'Jun-26'),
                ...full('09', 1900)]),
  });
  const s = r.stacks.find(x => x.stack === '01');
  assert.equal(s.possiblyTwoTowers, true);
  assert.equal(r.stacks.find(x => x.stack === '09').possiblyTwoTowers, false);
});

test('the version travels with the result', () => {
  const r = stackProfile('TESTVIEW RESIDENCES', { root: root(full('01', 2000)) });
  assert.equal(r.version, VERSION);
});

test('a stack that only sold on high floors is not read as a premium position', () => {
  /* The confound that would make this whole table wrong. Three stacks worth
     exactly the same per floor; one happens to have sold only near the top.
     Raw medians spread 13% and every point of it is height. Netting the
     within-stack floor premium out before comparing is what removes it —
     the same mistake the storey curve made when it measured building age. */
  const rows = [];
  const mk = (stack, floors) => floors.forEach(f =>
    rows.push(sale(stack, f, 2000 * (1 + 0.005 * (f - 5)), 'Jun-26')));
  mk('01', [3, 8, 13]); mk('05', [15, 20, 25]); mk('09', [30, 35, 40]);
  const r = stackProfile('TESTVIEW RESIDENCES', { root: root(rows) });

  assert.equal(r.heightNetted, true);
  assert.ok(Number.isFinite(r.levelledToFloor));
  const by = Object.fromEntries(r.stacks.map(s => [s.stack, s]));
  assert.ok(by['09'].medianPsf / by['01'].medianPsf - 1 > 0.10,
    'the raw medians really do spread, or this test proves nothing');
  for (const s of r.stacks) {
    assert.ok(Math.abs(s.premium) < 0.01,
      `stack ${s.stack} kept ${(100 * s.premium).toFixed(2)}% of height in its premium`);
  }
});

test('when the floor premium cannot be measured, the result says the premium still carries height', () => {
  /* Each stack sold on one floor only, so nothing pins height. The premiums
     still print — they are the best available — but heightNetted is false,
     and a caller that hides that is publishing a confounded number. */
  const rows = ['01', '05', '09'].flatMap(st => [0, 1, 2].map(i => sale(st, 20, 2000 + 100 * i, 'Jun-26')));
  const r = stackProfile('TESTVIEW RESIDENCES', { root: root(rows) });
  assert.equal(r.floorPremium.ran, false);
  assert.equal(r.heightNetted, false);
  assert.equal(r.levelledToFloor, null);
  assert.equal(r.stacks.length, 3);
});
