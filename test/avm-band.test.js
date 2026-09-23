/**
 * A range is never one figure.
 *
 * PARC CLEMATIS at 1,044 sqft printed "2,490–2,490 psf · S$2,599,560 –
 * S$2,599,560": one sale carried 90% of the weight, so the weighted 25th,
 * 50th and 75th percentiles all landed on it. Across private lookups 3.6%
 * collapsed to one number and 9.6% more came out under 2% wide — and each of
 * them was labelled "tight", the most confident word the tool has, because
 * the error bin averaged thin evidence with thicker.
 *
 * A zero-width range is not precision. It is the absence of any measured
 * spread printed as the most confident reading on the page, and it is a
 * single valuation number, which rule 2 keeps off anything a client sees.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recordByHref } from '../lib/data/query.js';
import { estimate, VERSION } from '../lib/consult/avm.js';
import { errorFor } from '../lib/consult/error.js';

const TABLE = JSON.parse(fs.readFileSync(new URL('../data/avm-error.json', import.meta.url), 'utf8'));
const PC = recordByHref('/condo/parc-clematis');

test('the case that was reported no longer prints a single figure', { skip: !PC && 'record not held' }, () => {
  const e = estimate(PC, { areaSqft: 1044, floor: 8 });
  assert.ok(e.ok);
  assert.ok(e.band.psfHigh > e.band.psfLow, `still one figure: ${e.band.psfLow}-${e.band.psfHigh}`);
  assert.ok(e.band.priceHigh > e.band.priceLow);
  assert.equal(e.band.widened, true, 'this lookup is the one that needed widening');
  /* And what the evidence said is kept, so the widening is visible. */
  assert.equal(e.band.evidencePsfLow, e.band.evidencePsfHigh, 'the evidence band is supposed to be the collapsed one');
});

test('no side of any published range sits closer to the point than the measured median miss', () => {
  /* Swept across real private records, because the failure lived in the
     records nobody had looked at. */
  const rows = JSON.parse(fs.readFileSync(new URL('../data/search.json', import.meta.url), 'utf8')).entries.filter(r => r.t === 'P');
  let checked = 0;
  for (let i = 0; i < rows.length && checked < 250; i += 7) {
    const rec = recordByHref(rows[i].h); if (!rec) continue;
    let e; try { e = estimate(rec, { areaSqft: 1044, floor: 8 }); } catch { continue; }
    if (!e.ok || !e.error) continue;
    checked++;
    const tol = 1.5; // rounding to whole psf
    assert.ok(e.psf - e.band.psfLow >= e.psf * e.error.medianPct - tol,
      `${rec.label}: low side ${e.psf - e.band.psfLow} psf inside the ${(100 * e.error.medianPct).toFixed(1)}% median miss`);
    assert.ok(e.band.psfHigh - e.psf >= e.psf * e.error.medianPct - tol,
      `${rec.label}: high side ${e.band.psfHigh - e.psf} psf inside the ${(100 * e.error.medianPct).toFixed(1)}% median miss`);
    assert.notEqual(e.band.psfLow, e.band.psfHigh, `${rec.label} published one figure`);
  }
  assert.ok(checked > 100, `only ${checked} lookups checked`);
});

test('evidence that is already wider than the miss is left exactly as the comparables said', () => {
  const rows = JSON.parse(fs.readFileSync(new URL('../data/search.json', import.meta.url), 'utf8')).entries.filter(r => r.t === 'P');
  let found = 0;
  for (let i = 0; i < rows.length && found < 20; i += 5) {
    const rec = recordByHref(rows[i].h); if (!rec) continue;
    let e; try { e = estimate(rec, { areaSqft: 1044, floor: 8 }); } catch { continue; }
    if (!e.ok || e.band.widened) continue;
    found++;
    assert.equal(e.band.psfLow, e.band.evidencePsfLow);
    assert.equal(e.band.psfHigh, e.band.evidencePsfHigh);
  }
  assert.ok(found >= 10, 'too few unwidened lookups to check the untouched case');
});

test('the error table is still keyed on the raw evidence spread, not the widened band', () => {
  /* Feeding the widened width back into errorFor would move the lookup into a
     bin that describes a different shape of evidence — the table grading the
     band it had just set. */
  const e = estimate(PC, { areaSqft: 1044, floor: 8 });
  const direct = errorFor({ kind: 'PRIVATE', bandPct: e.band.rawPct, effN: e.effectiveN ?? e.evidence.effectiveN });
  assert.equal(e.error.bin, direct.bin);
  assert.equal(e.error.medianPct, direct.medianPct);
});

test('evidence weighing about one sale is graded against lookups that were just as thin', () => {
  /* The lowest tercile averaged 0.5 to 2.3 effective sales. At the bottom of
     it the private p90 was 11.3% against the bin's 8.4%, so "tight" was being
     printed on lookups whose own history said "workable". */
  assert.ok(Number.isFinite(TABLE.cuts.thinEffN), 'the error table has no thin tier — rebuild it');
  assert.ok(TABLE.thin?.PRIVATE, 'no private thin tier in the table');
  const thin = errorFor({ kind: 'PRIVATE', bandPct: 0, effN: 0.9 });
  assert.equal(thin.bin, 'PRIVATE|thin');
  const thick = errorFor({ kind: 'PRIVATE', bandPct: 0, effN: 3 });
  assert.notEqual(thick.bin, 'PRIVATE|thin');
});

test('the error table describes the estimator that is running', () => {
  /* v7 changed how private comparables are weighed. A table built on v6
     describes a method that no longer exists while still printing numbers
     that look authoritative. */
  assert.equal(TABLE.estimator, VERSION, `table built for ${TABLE.estimator}, running ${VERSION} — run npm run build:avm-error`);
});

test('the page and the client document both say when a range was widened', () => {
  const ui = fs.readFileSync(new URL('../scripts/consult-ui.html', import.meta.url), 'utf8');
  assert.match(ui, /The comparables alone could not define a range/);
  assert.match(ui, /typical error of this method/);
  assert.match(ui, /This is one figure, not a range/);
});

test('the nine-in-ten range is the calibrated p90 in dollars, and survives client-safe mode', async () => {
  const e = estimate(PC, { areaSqft: 1044, floor: 8 });
  assert.ok(e.band.outer, 'no outer range');
  assert.ok(e.band.outer.priceLow < e.band.priceLow && e.band.outer.priceHigh > e.band.priceHigh,
    'the nine-in-ten range must contain the half-of-sales range');
  assert.equal(e.band.outer.psfLow, Math.round(e.psf * (1 - e.error.p90Pct)));
  /* It is a range, not a point, so a client may see it — and the p90 it is
     built from calibrates on lookups the table never saw. */
  assert.ok(TABLE.calibration.p90Coverage > 0.85 && TABLE.calibration.p90Coverage < 0.95,
    `p90 coverage ${TABLE.calibration.p90Coverage} — the nine-in-ten claim no longer holds`);
  const { clientSafe } = await import('../lib/consult/avm.js');
  const safe = clientSafe(e);
  assert.ok(safe.band.outer, 'client-safe mode dropped the outer range');
  assert.equal(safe.psf, undefined);
});
