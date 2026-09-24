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
 *
 * ── WHY NOTHING HERE NAMES A PROPERTY ─────────────────────────────────────
 * The first version of this file pinned Parc Clematis: "its evidence band
 * collapses, and it gets widened". The next night's refresh aged that one
 * sale out of the window, the estimate declined to run at all, three tests
 * failed — and a failed test in CI skips the data commit, so the live site
 * kept the previous day's data. A test that freezes one property's current
 * numbers is a test of the calendar. These sweep real lookups and assert the
 * RULE, so they hold on whatever the data says tonight.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recordByHref } from '../lib/data/query.js';
import { estimate, clientSafe, VERSION } from '../lib/consult/avm.js';
import { errorFor } from '../lib/consult/error.js';

const TABLE = JSON.parse(fs.readFileSync(new URL('../data/avm-error.json', import.meta.url), 'utf8'));

/* One sweep, shared by every test below: a spread of real private records,
   priced at an ordinary size and storey. Built once because it is the slow
   part. */
const SWEEP = (() => {
  const rows = JSON.parse(fs.readFileSync(new URL('../data/search.json', import.meta.url), 'utf8'))
    .entries.filter(r => r.t === 'P');
  const out = [];
  for (let i = 0; i < rows.length && out.length < 300; i += 5) {
    const rec = recordByHref(rows[i].h); if (!rec) continue;
    let e; try { e = estimate(rec, { areaSqft: 1044, floor: 8 }); } catch { continue; }
    if (e.ok && e.error) out.push({ rec, e });
  }
  return out;
})();

test('the sweep is large enough to mean something', () => {
  assert.ok(SWEEP.length > 150, `only ${SWEEP.length} private lookups ran`);
});

test('no published range is ever a single figure', () => {
  for (const { rec, e } of SWEEP) {
    assert.ok(e.band.psfHigh > e.band.psfLow, `${rec.label}: ${e.band.psfLow}–${e.band.psfHigh} psf`);
    assert.ok(e.band.priceHigh > e.band.priceLow, `${rec.label}: one price published`);
  }
});

test('where the evidence alone collapses, the range is widened and says so', (t) => {
  const collapsed = SWEEP.filter(({ e }) => e.band.evidencePsfLow === e.band.evidencePsfHigh);
  /* Whether any lookup collapses depends on tonight's data. When none does
     there is nothing to check here, and the test above still guards the rule. */
  if (!collapsed.length) { t.skip('no lookup in this sweep collapses on the current data'); return; }
  for (const { rec, e } of collapsed) {
    assert.equal(e.band.widened, true, `${rec.label} collapsed and was not widened`);
    assert.match(e.band.basis, /could not define a spread/);
  }
});

test('no side of any published range sits closer to the point than the measured median miss', () => {
  const tol = 1.5; // rounding to whole psf
  for (const { rec, e } of SWEEP) {
    assert.ok(e.psf - e.band.psfLow >= e.psf * e.error.medianPct - tol,
      `${rec.label}: low side ${e.psf - e.band.psfLow} psf inside the ${(100 * e.error.medianPct).toFixed(1)}% median miss`);
    assert.ok(e.band.psfHigh - e.psf >= e.psf * e.error.medianPct - tol,
      `${rec.label}: high side ${e.band.psfHigh - e.psf} psf inside the ${(100 * e.error.medianPct).toFixed(1)}% median miss`);
  }
});

test('evidence that is already wider than the miss is left exactly as the comparables said', () => {
  const untouched = SWEEP.filter(({ e }) => !e.band.widened);
  assert.ok(untouched.length >= 10, `only ${untouched.length} unwidened lookups to check`);
  for (const { e } of untouched) {
    assert.equal(e.band.psfLow, e.band.evidencePsfLow);
    assert.equal(e.band.psfHigh, e.band.evidencePsfHigh);
  }
});

test('the error table is keyed on the raw evidence spread, not the widened band', () => {
  /* Feeding the widened width back into errorFor would move the lookup into a
     bin that describes a different shape of evidence — the table grading the
     band it had just set. */
  for (const { e } of SWEEP.filter(x => x.e.band.widened).slice(0, 40)) {
    const direct = errorFor({ kind: 'PRIVATE', bandPct: e.band.rawPct, effN: e.effectiveN, ownShare: e.evidence.ownShare });
    assert.equal(e.error.bin, direct.bin);
    assert.equal(e.error.medianPct, direct.medianPct);
  }
});

test('evidence weighing about one sale is graded against lookups that were just as thin', () => {
  /* The lowest tercile averaged 0.5 to 2.3 effective sales. At the bottom of
     it the private p90 was 13.8% against the bin's 8.4%, so "tight" was being
     printed on lookups whose own history said "workable". */
  assert.ok(Number.isFinite(TABLE.cuts.thinEffN), 'the error table has no thin tier — rebuild it');
  assert.ok(TABLE.thin?.PRIVATE, 'no private thin tier in the table');
  assert.equal(errorFor({ kind: 'PRIVATE', bandPct: 0, effN: 0.9 }).bin, 'PRIVATE|thin');
  assert.notEqual(errorFor({ kind: 'PRIVATE', bandPct: 0, effN: 3 }).bin, 'PRIVATE|thin');
});

test('the error table describes the estimator that is running', () => {
  /* v7 changed how private comparables are weighed. A table built on v6
     describes a method that no longer exists while still printing numbers
     that look authoritative. */
  assert.equal(TABLE.estimator, VERSION, `table built for ${TABLE.estimator}, running ${VERSION} — rebuild it`);
});

test('the nine-in-ten range is the calibrated p90 in dollars, and survives client-safe mode', () => {
  assert.ok(TABLE.calibration.p90Coverage > 0.85 && TABLE.calibration.p90Coverage < 0.95,
    `p90 coverage ${TABLE.calibration.p90Coverage} — the nine-in-ten claim no longer holds`);
  for (const { rec, e } of SWEEP) {
    assert.ok(e.band.outer, `${rec.label}: no outer range`);
    assert.ok(e.band.outer.priceLow <= e.band.priceLow && e.band.outer.priceHigh >= e.band.priceHigh,
      `${rec.label}: the nine-in-ten range must contain the half-of-sales range`);
    /* At least the calibrated p90 either side; wider only where the evidence
       itself is wider, so the statement is conservative, never incoherent. */
    assert.ok(e.band.outer.psfLow <= Math.round(e.psf * (1 - e.error.p90Pct)) + 1);
    assert.ok(e.band.outer.psfHigh >= Math.round(e.psf * (1 + e.error.p90Pct)) - 1);
    /* A range, not a point, so a client may see it. */
    const safe = clientSafe(e);
    assert.ok(safe.band.outer, 'client-safe mode dropped the outer range');
    assert.equal(safe.psf, undefined);
  }
});

test('the page and the client document both say when a range was widened', () => {
  const ui = fs.readFileSync(new URL('../scripts/consult-ui.html', import.meta.url), 'utf8');
  assert.match(ui, /The comparables alone could not define a range/);
  assert.match(ui, /typical error of this method/);
  assert.match(ui, /This is one figure, not a range/);
});

test('evidence carried mostly by other buildings is graded against lookups that were too', () => {
  /* Before this tier existed, private lookups where the building's own sales
     were under 30% of the weight were told "nine in ten within 13.8%", and
     two in three came in inside it. Neither effN nor the band sees where the
     weight came from. */
  assert.deepEqual(TABLE.cuts.own, [0.3, 0.6]);
  const low = errorFor({ kind: 'PRIVATE', bandPct: 0.02, effN: 3, ownShare: 0.1 });
  const part = errorFor({ kind: 'PRIVATE', bandPct: 0.02, effN: 3, ownShare: 0.45 });
  const own = errorFor({ kind: 'PRIVATE', bandPct: 0.02, effN: 3, ownShare: 0.95 });
  assert.equal(low.bin, 'PRIVATE|lowOwn');
  assert.equal(part.bin, 'PRIVATE|partOwn');
  assert.ok(!/Own$/.test(own.bin), 'a building carried by its own sales must not get a neighbour tier');
  assert.ok(low.p90Pct > part.p90Pct && part.p90Pct > own.p90Pct,
    'the less of the answer is the building itself, the wider the honest error must be');
});

test('the nine-in-ten claim holds in every regime, not just on average', () => {
  /* The overall figure once read 90.2% while one regime sat at 66%. */
  for (const [k, v] of Object.entries(TABLE.calibration.byOwnShare)) {
    if (!v.n || v.n < 100) continue;
    assert.ok(v.p90Coverage > 0.83 && v.p90Coverage < 0.96,
      `${k}: ${(100 * v.p90Coverage).toFixed(1)}% under the predicted p90 over ${v.n} lookups`);
  }
  assert.match(TABLE.calibration.method, /fold/, 'calibration must be graded on lookups the table never saw');
});
