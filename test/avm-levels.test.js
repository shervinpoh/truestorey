/**
 * A nearby condominium is not a comparable.
 *
 * On the HDB side "nearby" works — blocks in a town really are alike, and the
 * estimator was tuned and backtested there. Private breaks it. 8 SAINT THOMAS
 * trades around 2,990 psf; LA CRYSTAL, four hundred metres away and the same
 * size, trades around 2,190. Distance, size and recency call them neighbours.
 *
 * Asked for a 97 sqm unit at 8 Saint Thomas, the estimator found two of the
 * building's own sales inside its size band and thirty-four strangers, let
 * the strangers outvote it 62/38, and returned 2,276 psf — below the lowest
 * price that building has ever filed. Measured across private projects, the
 * error against a building's own median runs 2.9% when its own sales carry
 * the weight and 14-16% when neighbours outvote them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordByHref } from '../lib/data/query.js';
import { estimate, _clearLevels } from '../lib/consult/avm.js';
import { forProject } from '../lib/consult/privatescan.js';

const REC = recordByHref('/condo/8-saint-thomas');

test('a premium building is not dragged below its own floor by its neighbours', { skip: !REC && 'record not held' }, () => {
  _clearLevels();
  const filed = REC.recent.map(x => x.psf).filter(Boolean);
  const lowestEverFiled = Math.min(...filed);

  const off = estimate(REC, { areaSqft: 1044, floor: 3, useLevels: false });
  const on = estimate(REC, { areaSqft: 1044, floor: 3, useLevels: true });

  assert.ok(off.psf < lowestEverFiled,
    'the unlevelled estimate no longer reproduces the bug; this test is measuring nothing');
  assert.ok(on.psf > off.psf, 'the level restatement did not lift the estimate');
  assert.ok(on.psf >= lowestEverFiled * 0.98,
    `levelled estimate ${on.psf} is still below what the building has ever filed (${lowestEverFiled})`);
});

test('the restatement runs on the measured level, in the published direction', { skip: !REC && 'record not held' }, () => {
  /* A building measured ABOVE its district standing in for one measured
     BELOW it must be marked down, and the other way round. Getting the sign
     wrong would look like a working feature and double the error. */
  const target = forProject('8 SAINT THOMAS');
  const cheap = forProject('LA CRYSTAL');
  assert.ok(target && cheap, 'the levels this test relies on are not built');
  assert.ok(target.gap > cheap.gap, 'the two reference buildings no longer straddle; pick others');

  const e = estimate(REC, { areaSqft: 1044, floor: 3 });
  const c = e.comparables.find(x => /LA CRYSTAL/i.test(x.label || ''));
  assert.ok(c?.levelFactor > 1, 'a cheaper building standing in for a dearer one must be marked UP');
  assert.ok(Math.abs(c.psf - c.psfPreLevel * c.levelFactor) <= 1, 'the factor is not what was applied');
});

test('a level is only used inside the district it was measured in', () => {
  /* The level is a residual from one district's own fit, so a same-named
     project elsewhere is a different measurement. The pool for 8 Saint Thomas
     in D09 picked up a D23 project called ESPA and used its level. */
  _clearLevels();
  const e = estimate(REC, { areaSqft: 1044, floor: 3 });
  const d = String(REC.district).padStart(2, '0');
  for (const c of e.comparables.filter(x => x.levelFactor)) {
    const p = forProject(c.label);
    assert.ok(p && String(p.district).padStart(2, '0') === d,
      `${c.label} was levelled using a project outside D${d}`);
  }
});

test('the adjustment is switchable, so it can be ablated and measured', () => {
  const a = estimate(REC, { areaSqft: 1044, floor: 3, useLevels: false });
  const b = estimate(REC, { areaSqft: 1044, floor: 3, useLevels: true });
  assert.notEqual(a.psf, b.psf);
  assert.equal(a.evidence.levelAdjusted, null);
  assert.ok(b.evidence.levelAdjusted.restated > 0);
});

test('every estimate says how much of itself came from the building', () => {
  /* The estimator cannot refuse on a thin own-address share without gutting
     coverage, so it publishes the share instead. A reader who can see that
     38% of the answer came from the building can weigh it; one who cannot is
     the reader who loses an argument with somebody who knows the block. */
  const e = estimate(REC, { areaSqft: 1044, floor: 3 });
  assert.ok(e.evidence.ownShare >= 0 && e.evidence.ownShare <= 1);
  assert.ok(e.evidence.ownShare < 0.6, 'this lookup is meant to be neighbour-heavy');
});

test('an HDB lookup is untouched by any of this', () => {
  /* The levels are a private-only correction and HDB is where the 2.99%
     backtest lives. Nothing here may move it. */
  const hdb = recordByHref('/hdb/ang-mo-kio/591a-ang-mo-kio-st-51');
  if (!hdb) return;
  const a = estimate(hdb, { areaSqft: 1000, floor: 10, useLevels: false });
  const b = estimate(hdb, { areaSqft: 1000, floor: 10, useLevels: true });
  assert.equal(a.psf, b.psf);
  assert.equal(b.evidence.levelAdjusted, null);
});
