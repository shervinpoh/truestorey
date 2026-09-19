/**
 * Test 2 and Test 3: is this gap explained by something the data can see?
 *
 * ── WHY A GAP IS NOT YET A FINDING ─────────────────────────────────────────
 * The AVM says an asking price sits 6.7% above comparable evidence. On its own
 * that sentence is worth very little, because a gap has four possible sources
 * and three of them are not opportunities:
 *
 *   1. NOISE         the AVM's own error on this shape of lookup
 *   2. ADJUSTED-FOR  floor, size, tenure, lease — already netted out upstream
 *   3. EXPLAINED     a risk the data CAN see: lease, supply, liquidity
 *   4. RESIDUAL      what is left ← the only one that is a finding
 *
 * Test 1 is arithmetic and lives in lib/consult/error.js: does the gap survive
 * the error measured for lookups like this one. This file is Tests 2 and 3.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * IT NEVER CONVERTS A RISK INTO A PERCENTAGE. "Supply risk explains 3% of the
 * discount" is the obvious output and it is fabricated: nothing published
 * anywhere says what a given MOP ratio is worth in price, and the rubric's
 * points are a risk ladder, not money. A number invented here would be far
 * more dangerous than the bare gap, because it would look like the answer.
 *
 * So Test 2 reports DIRECTION AND PRESENCE, in each check's own words. A
 * discount standing beside flagged risks is partly explained; a discount
 * standing beside nothing is the finding. The size of the residual is the size
 * of the gap — no more is claimed.
 *
 * ── THE PRICE CHECK IS EXCLUDED, AND THAT IS NOT AN OVERSIGHT ─────────────
 * The rubric's own `price` check is the percentile of the asking price within
 * its comparables — which is Test 1 restated. Letting it into Test 2 would
 * make the tool say "the price is high, and what explains it is that the price
 * is high". Circular, and it would fire on exactly the lookups where the
 * residual matters most.
 *
 * ── A CHECK THAT COULD NOT RUN IS NOT A CHECK THAT FOUND NOTHING ──────────
 * "Unexplained" means something quite different when six checks ran and all
 * were clear than when three could not run at all. The first is evidence; the
 * second is silence. `coverage` carries that distinction into the verdict and
 * every surface prints it, because absence of evidence reading as evidence of
 * safety is the exact failure this repo is organised against.
 */
import { analyse } from '../blindspot/analyse.js';
import { estimate } from './avm.js';

export const VERSION = '2026-09-residual-v1';

/** The rubric's non-price checks — the ones that can explain a gap without
 *  being the gap. See the note above on why `price` is not here. */
export const EXPLAINERS = ['lease', 'liquidity', 'supply', 'gls', 'view'];

/**
 * @param rec       the record
 * @param asking    the asking price in DOLLARS (not psf)
 * @param areaSqft  required — a gap needs a psf on both sides
 */
export function residual(rec, { asking, areaSqft, floor = null, asOf = new Date() } = {}) {
  if (!(Number(asking) > 0)) return { ok: false, reason: 'An asking price is required — this asks whether a price is explained, not what the home is worth.' };
  if (!(Number(areaSqft) > 0)) return { ok: false, reason: 'A floor area is required.' };

  const est = estimate(rec, { areaSqft, floor, asOf });
  if (!est.ok) return { ok: false, reason: est.reason, estimate: est };

  const askingPsf = Number(asking) / Number(areaSqft);
  const gapPct = (askingPsf - est.psf) / est.psf;
  const direction = gapPct >= 0 ? 'premium' : 'discount';

  /* ── TEST 1 ─────────────────────────────────────────────────────────── */
  const err = est.error;
  const test1 = err
    ? {
        ran: true,
        survives: Math.abs(gapPct) > err.medianPct,
        exceedsP90: Math.abs(gapPct) > err.p90Pct,
        typicalMiss: err.medianPct, tailMiss: err.p90Pct,
        trials: err.trials, bin: err.bin, basis: err.basis,
      }
    : { ran: false, why: 'No error table has been built, so whether this gap survives the noise is unmeasured — which is not the same as it surviving.' };

  /* ── TEST 2 ─────────────────────────────────────────────────────────── */
  const a = analyse({ href: rec.href, askPrice: Number(asking), areaSqft: Number(areaSqft), floor, now: asOf });
  const checks = (a?.checks || []).filter(c => EXPLAINERS.includes(c.key));
  const skipped = (a?.skipped || []).filter(c => EXPLAINERS.includes(c.key));

  const flagged = checks.filter(c => Number(c.points) > 0)
    .map(c => ({ key: c.key, title: c.title, points: c.points, max: c.max, finding: c.finding, source: c.source }));
  const clear = checks.filter(c => Number(c.points) === 0)
    .map(c => ({ key: c.key, title: c.title, finding: c.finding }));

  const coverage = {
    ran: checks.length,
    flagged: flagged.length,
    clear: clear.length,
    couldNotRun: skipped.map(c => ({ key: c.key, title: c.title, why: c.why || c.needs || 'not stated' })),
    complete: skipped.length === 0,
  };

  /* ── TEST 3: WHAT IS LEFT ───────────────────────────────────────────── */
  let code, says;
  if (!test1.ran) {
    code = 'unmeasured';
    says = 'The gap cannot be separated from the method’s own error, because no error table has been built.';
  } else if (!test1.survives) {
    code = 'noise';
    says = `${fmtPct(Math.abs(gapPct))} is inside the ${fmtPct(err.medianPct)} that half of lookups like this miss by anyway. `
         + 'This is not a finding.';
  } else if (direction === 'discount') {
    code = flagged.length ? 'discount-explained' : 'discount-unexplained';
    says = flagged.length
      ? `A ${fmtPct(Math.abs(gapPct))} discount that survives the noise, standing beside ${flagged.length} flagged `
        + `risk${flagged.length > 1 ? 's' : ''} the market can also see. Partly explained rather than cheap — `
        + 'the market may be pricing what is listed below.'
      : `A ${fmtPct(Math.abs(gapPct))} discount that survives the noise, and ${coverage.ran} checks found nothing `
        + 'that explains it. That gap is what the filed data cannot account for.';
  } else {
    code = flagged.length ? 'premium-against-risk' : 'premium-unexplained';
    says = flagged.length
      ? `A ${fmtPct(gapPct)} premium that survives the noise, on a home carrying ${flagged.length} flagged `
        + `risk${flagged.length > 1 ? 's' : ''}. Paying above comparable evidence for something the data already flags.`
      : `A ${fmtPct(gapPct)} premium that survives the noise, and ${coverage.ran} checks found nothing that explains it. `
        + 'Whatever justifies it is not in the filed data.';
  }

  /* The verdict is only as strong as how much of the board was read. */
  const qualifier = coverage.complete
    ? null
    : `${coverage.couldNotRun.length} of ${coverage.ran + coverage.couldNotRun.length} checks could not run, so "nothing `
      + 'explains it" here means nothing was FOUND, not that nothing is there.';

  return {
    ok: true, version: VERSION, rubricVersion: a?.version || null,
    asking: { price: Number(asking), psf: Math.round(askingPsf) },
    estimate: { psf: est.psf, price: est.price, band: est.band, error: err, evidence: est.evidence },
    gap: { pct: gapPct, direction, dollars: Math.round((askingPsf - est.psf) * Number(areaSqft)) },
    test1,
    test2: { flagged, clear, coverage, rubricScore: a ? { points: a.points, max: a.max, band: a.band } : null },
    verdict: { code, says, qualifier },
    /**
     * Said every time, because it is the honest division of labour and the
     * reason the tool stops here. Renovation, facing, corner-or-corridor,
     * layout efficiency, noise and condition are in no public dataset, and
     * together they are most of the AVM's remaining error.
     */
    whatIsLeft: 'The residual is what the filed data cannot explain. Renovation, facing, corner or '
      + 'corridor position, layout efficiency, noise and condition are in no public dataset — '
      + 'they are what a viewing is for, and they are the most likely explanation of anything left here.',
  };
}

const fmtPct = v => `${(100 * Math.abs(v)).toFixed(1)}%`;
