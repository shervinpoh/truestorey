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
 * price that building had ever filed. So a neighbour's price is restated to
 * THIS building's measured level before it counts.
 *
 * Graded out of time — each building's level as it stood three years before
 * the sales being priced — the neighbour-carried private lookups went from
 * 10.8% median miss to 9.2%. Real, and not a rescue: those lookups are still
 * the weakest the tool makes, and the error table now says so for them.
 *
 * ── WHY NOTHING HERE PINS A PROPERTY'S CURRENT NUMBERS ────────────────────
 * The first version of this file asserted 8 Saint Thomas's live estimate. A
 * test like that fails the night the building files a sale — and a failed
 * test in CI skips the data commit, so the live site keeps yesterday's data.
 * These sweep real lookups and assert the mechanism, which holds on whatever
 * the data says tonight. The one named case below skips itself when the data
 * no longer reproduces it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recordByHref } from '../lib/data/query.js';
import { estimate, _clearLevels } from '../lib/consult/avm.js';

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const SCAN = JSON.parse(fs.readFileSync(new URL('../data/private-scan.json', import.meta.url), 'utf8'));
const LEVEL = new Map(SCAN.projects.map(p => [norm(p.project) + '|' + p.district, p.gap]));
const dk = rec => String(rec.district ?? '').padStart(2, '0');

/* Real private lookups, each priced with and without the restatement. */
const PAIRS = (() => {
  _clearLevels();
  const rows = JSON.parse(fs.readFileSync(new URL('../data/search.json', import.meta.url), 'utf8'))
    .entries.filter(r => r.t === 'P');
  const out = [];
  for (let i = 0; i < rows.length && out.length < 200; i += 6) {
    const rec = recordByHref(rows[i].h); if (!rec) continue;
    let on, off;
    try {
      on = estimate(rec, { areaSqft: 1044, floor: 8 });
      off = estimate(rec, { areaSqft: 1044, floor: 8, useLevels: false });
    } catch { continue; }
    if (on.ok && off.ok) out.push({ rec, on, off });
  }
  return out;
})();
const FIRED = PAIRS.filter(p => p.on.evidence.levelAdjusted?.restated > 0);

test('the sweep exercises the restatement often enough to test it', () => {
  assert.ok(PAIRS.length > 100, `only ${PAIRS.length} private lookups ran`);
  assert.ok(FIRED.length >= 15, `the restatement fired on only ${FIRED.length}`);
});

test('each restated neighbour moves by exactly the published factor', () => {
  /* (1 + this building's level) / (1 + that building's level), both from the
     same district's fit. A sign error here would look like a working feature
     and double the error it exists to remove. */
  for (const { rec, on } of FIRED) {
    const own = LEVEL.get(norm(rec.label) + '|' + dk(rec));
    for (const c of on.comparables.filter(x => x.levelFactor)) {
      const theirs = LEVEL.get(norm(c.label) + '|' + dk(rec));
      assert.ok(Number.isFinite(own) && Number.isFinite(theirs), `${c.label}: no level in D${dk(rec)}`);
      assert.ok(Math.abs(c.levelFactor - (1 + own) / (1 + theirs)) < 1e-9, `${rec.label} ← ${c.label}: wrong factor`);
      /* Both figures are rounded to whole psf, the pre-level one before the
         factor multiplies it, so the product can drift by half a dollar times
         the factor plus half a dollar — 1.1 psf at a 1.24 factor. Anything
         past that bound is a factor that was not the one applied. */
      const bound = 0.5 + 0.5 * c.levelFactor + 1e-9;
      assert.ok(Math.abs(c.psf - c.psfPreLevel * c.levelFactor) <= bound, `${rec.label} ← ${c.label}: factor not what was applied`);
    }
  }
});

test('a level is only ever used inside the district it was measured in', () => {
  /* The pool for 8 Saint Thomas in D09 once picked up a D23 project called
     ESPA and used its level: same name, different measurement. */
  for (const { rec, on } of FIRED) {
    for (const c of on.comparables.filter(x => x.levelFactor)) {
      assert.ok(LEVEL.has(norm(c.label) + '|' + dk(rec)), `${c.label} levelled from outside D${dk(rec)}`);
    }
    for (const c of on.comparables.filter(x => x.href === rec.href)) {
      assert.equal(c.levelFactor, null, 'a building is never restated against itself');
    }
  }
});

test('a building dearer than every neighbour it borrows from is never priced lower for it', () => {
  /* Monotone by construction: if every borrowed price only rises, a weighted
     quantile of them cannot fall. The case that prompted all of this was the
     opposite outcome — a premium building dragged below its own floor. */
  let up = 0, down = 0;
  for (const { rec, on, off } of FIRED) {
    const f = on.comparables.filter(c => c.levelFactor).map(c => c.levelFactor);
    if (f.every(x => x >= 1)) { up++; assert.ok(on.psf >= off.psf, `${rec.label}: ${off.psf} → ${on.psf}`); }
    if (f.every(x => x <= 1)) { down++; assert.ok(on.psf <= off.psf, `${rec.label}: ${off.psf} → ${on.psf}`); }
  }
  assert.ok(up + down > 0, 'no one-directional case in the sweep to check');
});

test('the restatement is switchable, so it can be ablated and measured', () => {
  for (const { on, off } of FIRED.slice(0, 20)) {
    assert.equal(off.evidence.levelAdjusted, null);
    assert.ok(on.evidence.levelAdjusted.restated > 0);
  }
});

test('every estimate says how much of itself came from the building', () => {
  for (const { rec, on } of PAIRS) {
    assert.ok(on.evidence.ownShare >= 0 && on.evidence.ownShare <= 1, `${rec.label}: ${on.evidence.ownShare}`);
  }
});

test('an HDB lookup is untouched by any of this', () => {
  /* The levels are a private-only correction and HDB is where the backtest
     lives. Nothing here may move it. */
  const rows = JSON.parse(fs.readFileSync(new URL('../data/search.json', import.meta.url), 'utf8'))
    .entries.filter(r => r.t === 'H');
  let n = 0;
  for (let i = 0; i < rows.length && n < 40; i += 97) {
    const rec = recordByHref(rows[i].h); if (!rec) continue;
    const a = estimate(rec, { areaSqft: 1000, floor: 10, useLevels: false });
    const b = estimate(rec, { areaSqft: 1000, floor: 10 });
    if (!a.ok || !b.ok) continue;
    n++;
    assert.equal(a.psf, b.psf, rec.label);
    assert.equal(b.evidence.levelAdjusted, null);
  }
  assert.ok(n >= 20, `only ${n} HDB lookups ran`);
});

test('8 Saint Thomas, the case that surfaced it — while the data still reproduces it', (t) => {
  const rec = recordByHref('/condo/8-saint-thomas');
  if (!rec) { t.skip('record no longer held'); return; }
  const off = estimate(rec, { areaSqft: 1044, floor: 3, useLevels: false });
  const on = estimate(rec, { areaSqft: 1044, floor: 3 });
  const lowest = Math.min(...rec.recent.map(x => x.psf).filter(Boolean));
  if (!off.ok || !on.ok || off.psf >= lowest) {
    t.skip('the current data no longer reproduces the original failure; the sweeps above still guard the rule');
    return;
  }
  assert.ok(on.psf >= lowest * 0.98, `levelled ${on.psf} is still below the building's lowest filed ${lowest}`);
});
