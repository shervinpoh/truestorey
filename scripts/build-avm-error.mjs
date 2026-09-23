/**
 * How wrong the AVM usually is, for a lookup that looks like this one.
 *
 *   npm run build:avm-error
 *
 * ── WHY ONE NATIONAL ERROR FIGURE IS NOT ENOUGH ────────────────────────────
 * The backtest says the median absolute error is about 3.6%. That is true and
 * it is nearly useless at the moment it matters, because the error is not 3.6%
 * everywhere. Measured over 2,419 trials, a lookup in the tightest fifth of
 * cohorts ran at 3.04% and one in the widest fifth at 6.17% — and the private
 * tail is twice the HDB tail, 19.4% against 9.7% at the 90th percentile.
 *
 * That spread is the whole question in front of a listing. "This is 6% under
 * comparable evidence" means something quite different on a thick cohort in
 * one's own block than on six sales scraped from three projects away, and
 * without this table the difference is a matter of feel.
 *
 * ── WHY A TABLE AND NOT A REGRESSION ───────────────────────────────────────
 * Same argument as the Blindspot rubric. A fitted coefficient is a number
 * nobody can check and it will happily extrapolate somewhere absurd. A
 * measured table can be pointed at: this bin, these many trials, this was the
 * error. It cannot extrapolate at all, which is the feature.
 *
 * ── THE FEATURES ARE THE ONES THAT MEASURED, NOT THE ONES THAT SOUNDED RIGHT ─
 * Eight candidates were measured for how far they separate error across their
 * own quintiles:
 *
 *   bandPct   3.13pp   the cohort's own interquartile width
 *   spreadPct 2.88pp   its full range — highly correlated with bandPct
 *   effN      2.18pp   total weight: an effective sample, not a count
 *   radiusKm  0.93pp
 *   ownShare  0.92pp
 *   sample    0.88pp   the RAW count barely predicts anything
 *   floorAdj  0.70pp
 *   ageMed    0.36pp
 *
 * So: kind, bandPct, effN. `spreadPct` is dropped as a near-duplicate of
 * bandPct, and `sample` — the obvious choice, and the one a person would pick
 * — is nearly worthless next to the weighted version of itself.
 *
 * ── SPLIT BY ADDRESS, NOT BY ROW ───────────────────────────────────────────
 * Train and test are divided on a hash of the href, so every sale at one block
 * lands on the same side. Splitting by row would put two sales from the same
 * cohort either side of the line, and the table would be graded partly on
 * homes it had already seen.
 */
import fs from 'node:fs';
import { WEIGHTS, VERSION as AVM_VERSION } from '../lib/consult/avm.js';

const IN = 'data/.avm-trials.jsonl';
const OUT = 'data/avm-error.json';
const VERSION = '2026-09-avmerr-v1';

/** Below this a bin cannot state a 90th percentile worth printing, and falls
 *  back to its kind's overall figure with `basis` saying so. Absence of
 *  evidence must not read as a tight error bar. */
const MIN_BIN = 60;

if (!fs.existsSync(IN)) {
  console.error(`${IN} not found. Run:\n  node scripts/backtest-avm.mjs --n 12000 --dump ${IN}`);
  process.exit(1);
}
const rows = fs.readFileSync(IN, 'utf8').trim().split('\n').map(l => JSON.parse(l));

const srt = a => [...a].sort((x, y) => x - y);
const med = a => (a.length ? srt(a)[(a.length - 1) >> 1] : null);
const qt = (a, p) => (a.length ? srt(a)[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
const r4 = v => (v === null ? null : Number(v.toFixed(4)));

/* Deterministic, so a rebuild reproduces the same split. */
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); };
const train = rows.filter(r => hash(r.href) % 100 < 60);
const test  = rows.filter(r => hash(r.href) % 100 >= 60);

/* Cut points from the TRAINING half only. Reading them off everything would
   let the test half influence the bins it is later graded in. */
const cuts = {
  bandPct: [qt(train.map(r => r.bandPct), 1 / 3), qt(train.map(r => r.bandPct), 2 / 3)].map(r4),
  effN:    [qt(train.map(r => r.effN), 1 / 3), qt(train.map(r => r.effN), 2 / 3)].map(r4),
};
const binOf = (v, c) => (v <= c[0] ? 0 : v <= c[1] ? 1 : 2);
export const keyOf = r => `${r.kind}|b${binOf(r.bandPct, cuts.bandPct)}|n${binOf(r.effN, cuts.effN)}`;

const stat = a => ({ n: a.length, median: r4(med(a.map(r => r.ape))), p90: r4(qt(a.map(r => r.ape), 0.9)) });

const bins = {};
for (const r of train) (bins[keyOf(r)] ||= []).push(r);
const table = {};
for (const [k, v] of Object.entries(bins)) if (v.length >= MIN_BIN) table[k] = stat(v);

/**
 * ── THE THIN END GETS ITS OWN FIGURE ──────────────────────────────────────
 * The lowest effN tercile ran from 0.5 to about 2.3, and its figures were an
 * average across that range. At the bottom of it — evidence weighing about
 * one sale — the private error was 3.0% median and 11.3% at p90, against the
 * bin's 2.7% and 8.4%. The bin was printing "tight" on lookups whose own
 * history said "workable": the least evidence got the most confident word.
 *
 * So a lookup whose evidence weighs no more than THIN_EFFN — about one sale
 * and a little — is graded against lookups that were just as thin, whatever
 * its band. The band is exactly the thing thin evidence cannot measure, so it
 * is not used to split them further.
 */
export const THIN_EFFN = 1.2;
const thinTier = {};
for (const k of ['HDB', 'PRIVATE']) {
  const v = train.filter(r => r.kind === k && r.effN <= THIN_EFFN);
  if (v.length >= MIN_BIN) thinTier[k] = stat(v);
}

const byKind = {};
for (const k of ['HDB', 'PRIVATE']) byKind[k] = stat(train.filter(r => r.kind === k));
const overall = stat(train);

/* ── VALIDATION, ON HOMES THE TABLE HAS NOT SEEN ──────────────────────────
 * A predicted error that does not calibrate is worse than none: it puts a
 * number on a hunch. Two checks, both on the held-out half.
 *
 *   p90 coverage  — of test lookups, what share came in at or under the p90
 *                   their bin predicted. Should land near 90%.
 *   median split  — what share came in under the predicted median. Near 50%.
 *
 * Both are reported whatever they say. A table that fails them is a finding,
 * not something to retune until it passes.
 */
const pick = r => (r.effN <= THIN_EFFN && thinTier[r.kind]) || table[keyOf(r)] || byKind[r.kind] || overall;
const under90 = test.filter(r => r.ape <= pick(r).p90).length;
const underMed = test.filter(r => r.ape <= pick(r).median).length;
const calibration = {
  testN: test.length,
  p90Coverage: r4(under90 / test.length),
  medianSplit: r4(underMed / test.length),
};

const out = {
  version: VERSION,
  /* Which estimator these errors describe. lib/consult/error.js compares it
     and reports a stale table rather than quoting it — a table built against
     different weights describes a method that is no longer running, while
     still returning numbers that look authoritative. */
  estimator: AVM_VERSION,
  weights: WEIGHTS,
  builtAt: new Date().toISOString(),
  source: `${rows.length} held-out sales, ${IN}`,
  trainN: train.length,
  minBin: MIN_BIN,
  features: ['kind', 'bandPct', 'effN'],
  cuts: { ...cuts, thinEffN: THIN_EFFN },
  thin: thinTier,
  bins: table,
  byKind,
  overall,
  calibration,
  note: 'Absolute percentage error of the AVM against sales it was not allowed to see. '
      + 'Rebuild after any change to the estimator, the cohort rules or the weights — '
      + 'a stale table describes a method that no longer exists.',
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

console.log(`${rows.length} trials · ${train.length} train / ${test.length} test, split by address`);
console.log(`cuts  bandPct ${cuts.bandPct.join(' / ')}   effN ${cuts.effN.join(' / ')}`);
console.log(`\n${Object.keys(table).length} bins met the ${MIN_BIN}-trial floor:\n`);
console.log('  bin                 n   median    p90');
for (const k of Object.keys(table).sort()) {
  const b = table[k];
  console.log(`  ${k.padEnd(16)} ${String(b.n).padStart(4)}   ${(100 * b.median).toFixed(2)}%   ${(100 * b.p90).toFixed(2)}%`);
}
const thin = Object.keys(bins).filter(k => bins[k].length < MIN_BIN);
if (thin.length) console.log(`\n  ${thin.length} bins fell below the floor and fall back to their kind: ${thin.join(', ')}`);
console.log(`\nkind fallbacks:`);
for (const [k, v] of Object.entries(thinTier)) console.log(`  ${(k + '|thin').padEnd(16)} ${String(v.n).padStart(4)}   ${(100 * v.median).toFixed(2)}%   ${(100 * v.p90).toFixed(2)}%   (effN <= ${THIN_EFFN})`);
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(16)} ${String(v.n).padStart(4)}   ${(100 * v.median).toFixed(2)}%   ${(100 * v.p90).toFixed(2)}%`);

console.log(`\nCalibration on ${test.length} held-out lookups:`);
console.log(`  came in at or under the predicted p90   ${(100 * calibration.p90Coverage).toFixed(1)}%   (target 90%)`);
console.log(`  came in at or under the predicted median ${(100 * calibration.medianSplit).toFixed(1)}%   (target 50%)`);
console.log(`\nWrote ${OUT}`);
