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
 * Folds are divided on a hash of the href, so every sale at one block lands in
 * the same fold. Splitting by row would put two sales from the same cohort
 * either side of the line, and the table would be graded partly on homes it
 * had already seen.
 *
 * ── FIVE FOLDS, THEN EVERYTHING ────────────────────────────────────────────
 * This used to publish a table built on a 60% training half and grade it on
 * the other 40%. For the big bins that was fine. For the small ones it was
 * not: private lookups where the building's own sales carried 30–60% of the
 * weight had 156 training trials, which put their p90 at 12.2% — while the
 * held-out half ran at 18.6% and all 270 together at 15.1%. A 90th
 * percentile from 150 heavy-tailed errors is a noisy number, and the table
 * was publishing the noise and then grading itself 80% on it.
 *
 * So validation is five-fold: each fold is predicted by a table built from
 * the other four and never sees its own homes. That is the calibration the
 * file reports. The PUBLISHED figures are then built from every trial, which
 * is the most evidence available for each bin and the table a live lookup
 * actually gets.
 *
 * ── ownShare WAS MEASURED WEAK, AND WAS NOT ─────────────────────────────────
 * The feature list above ranks ownShare at 0.92pp — measured as the spread of
 * MEDIAN error across quintiles, and by COUNT of own sales. Both hid it. By
 * weight, and in the TAIL, the neighbour-carried private lookups were the
 * worst-calibrated the tool made: "nine in ten within 13.8%" printed where two
 * in three were. A feature can move the median little and the 90th
 * percentile a great deal, and the 90th percentile is the one a client hears.
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

/* Deterministic, so a rebuild reproduces the same folds. */
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); };
const K = 5;
const foldOf = r => hash(r.href) % K;

const binOf = (v, c) => (v <= c[0] ? 0 : v <= c[1] ? 1 : 2);
const stat = a => ({ n: a.length, median: r4(med(a.map(r => r.ape))), p90: r4(qt(a.map(r => r.ape), 0.9)) });

/**
 * ── THE THIN END GETS ITS OWN FIGURE ──────────────────────────────────────
 * The lowest effN tercile ran from 0.5 to about 2.3, and its figures were an
 * average across that range. At the bottom of it — evidence weighing about
 * one sale — the private error was well above the bin's. The bin was printing
 * "tight" on lookups whose own history said "workable": the least evidence
 * got the most confident word.
 *
 * So a lookup whose evidence weighs no more than THIN_EFFN — about one sale
 * and a little — is graded against lookups that were just as thin, whatever
 * its band. The band is exactly the thing thin evidence cannot measure, so it
 * is not used to split them further.
 */
export const THIN_EFFN = 1.2;

/**
 * ── AND EVIDENCE CARRIED BY OTHER BUILDINGS GETS ITS OWN FIGURE ───────────
 * Neither effN nor the band can see where the weight came from. A lookup can
 * weigh five good sales with four of them next door. So the share of the
 * weight that is this address's own sales is graded first, in two tiers. It
 * is knowable before the answer, like every other feature here: it is read
 * off the comparables, not off the outcome.
 */
export const OWN_CUTS = [0.3, 0.6];

/**
 * Every tier, from one set of trials. Called once per fold to validate and
 * once on everything to publish — the same function both times, so what is
 * graded is exactly what ships.
 *
 * Cut points come from the trials passed in. In validation that means the
 * four training folds only: reading them off everything would let the fold
 * being graded influence the bins it is graded in.
 */
function buildTable(train) {
  const cuts = {
    bandPct: [qt(train.map(r => r.bandPct), 1 / 3), qt(train.map(r => r.bandPct), 2 / 3)].map(r4),
    effN:    [qt(train.map(r => r.effN), 1 / 3), qt(train.map(r => r.effN), 2 / 3)].map(r4),
  };
  const keyOf = r => `${r.kind}|b${binOf(r.bandPct, cuts.bandPct)}|n${binOf(r.effN, cuts.effN)}`;

  const raw = {};
  for (const r of train) (raw[keyOf(r)] ||= []).push(r);
  const bins = {};
  for (const [k, v] of Object.entries(raw)) if (v.length >= MIN_BIN) bins[k] = stat(v);

  const thin = {};
  const own = {};
  const byKind = {};
  for (const k of ['HDB', 'PRIVATE']) {
    const ofKind = train.filter(r => r.kind === k);
    const t = ofKind.filter(r => r.effN <= THIN_EFFN);
    if (t.length >= MIN_BIN) thin[k] = stat(t);
    const low = ofKind.filter(r => Number.isFinite(r.ownWeight) && r.ownWeight < OWN_CUTS[0]);
    const part = ofKind.filter(r => Number.isFinite(r.ownWeight) && r.ownWeight >= OWN_CUTS[0] && r.ownWeight < OWN_CUTS[1]);
    own[k] = {};
    if (low.length >= MIN_BIN) own[k].lowOwn = stat(low);
    if (part.length >= MIN_BIN) own[k].partOwn = stat(part);
    byKind[k] = stat(ofKind);
  }
  const overall = stat(train);

  /* The same precedence lib/consult/error.js applies live: where the weight
     came from, then how much of it there is, then the shape of the band. */
  const pick = r => {
    const w = r.ownWeight;
    const o = !Number.isFinite(w) ? null
      : w < OWN_CUTS[0] ? own[r.kind]?.lowOwn
      : w < OWN_CUTS[1] ? own[r.kind]?.partOwn : null;
    return o || (r.effN <= THIN_EFFN && thin[r.kind]) || bins[keyOf(r)] || byKind[r.kind] || overall;
  };
  return { cuts, bins, raw, thin, own, byKind, overall, pick };
}

/* ── VALIDATION, ON HOMES THE TABLE HAS NOT SEEN ──────────────────────────
 * A predicted error that does not calibrate is worse than none: it puts a
 * number on a hunch. Every trial is predicted by the table built without its
 * fold, and two things are checked:
 *
 *   p90 coverage  — what share came in at or under the p90 they were given.
 *                   Should land near 90%.
 *   median split  — what share came in under the predicted median. Near 50%.
 *
 * Reported overall AND per regime. The overall figure once read 90.2% while
 * the neighbour-carried private lookups sat at 66% — an average hid it. A
 * table that fails is a finding, not something to retune until it passes.
 */
const predicted = new Array(rows.length);
for (let f = 0; f < K; f++) {
  const T = buildTable(rows.filter(r => foldOf(r) !== f));
  rows.forEach((r, i) => { if (foldOf(r) === f) predicted[i] = T.pick(r); });
}
const cover = idx => (idx.length ? r4(idx.filter(i => rows[i].ape <= predicted[i].p90).length / idx.length) : null);
const all = rows.map((_, i) => i);
const regime = (k, lo, hi) => all.filter(i => rows[i].kind === k && rows[i].ownWeight >= lo && rows[i].ownWeight < hi);
const calibration = {
  method: `${K}-fold, split by address — each lookup graded by a table built without it`,
  testN: rows.length,
  p90Coverage: cover(all),
  medianSplit: r4(all.filter(i => rows[i].ape <= predicted[i].median).length / all.length),
  byOwnShare: Object.fromEntries(['PRIVATE', 'HDB'].flatMap(k => [
    [`${k}|own<30%`, regime(k, -Infinity, OWN_CUTS[0])],
    [`${k}|own30-60%`, regime(k, OWN_CUTS[0], OWN_CUTS[1])],
    [`${k}|own>=60%`, regime(k, OWN_CUTS[1], Infinity)],
  ]).map(([k, idx]) => [k, { n: idx.length, p90Coverage: cover(idx) }])),
};

/* ── THE PUBLISHED TABLE: every trial ──────────────────────────────────── */
const PUB = buildTable(rows);

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
  n: rows.length,
  minBin: MIN_BIN,
  features: ['kind', 'ownShare', 'effN', 'bandPct'],
  cuts: { ...PUB.cuts, thinEffN: THIN_EFFN, own: OWN_CUTS },
  thin: PUB.thin,
  own: PUB.own,
  bins: PUB.bins,
  byKind: PUB.byKind,
  overall: PUB.overall,
  calibration,
  note: 'Absolute percentage error of the AVM against sales it was not allowed to see. '
      + 'Rebuild after any change to the estimator, the cohort rules or the weights — '
      + 'a stale table describes a method that no longer exists.',
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

const pct = v => `${(100 * v).toFixed(2)}%`;
console.log(`${rows.length} trials · published from all of them · validated ${K}-fold by address`);
console.log(`cuts  bandPct ${PUB.cuts.bandPct.join(' / ')}   effN ${PUB.cuts.effN.join(' / ')}`);
console.log(`\n${Object.keys(PUB.bins).length} bins met the ${MIN_BIN}-trial floor:\n`);
console.log('  bin                 n   median    p90');
for (const k of Object.keys(PUB.bins).sort()) {
  const b = PUB.bins[k];
  console.log(`  ${k.padEnd(16)} ${String(b.n).padStart(4)}   ${pct(b.median)}   ${pct(b.p90)}`);
}
const below = Object.keys(PUB.raw).filter(k => PUB.raw[k].length < MIN_BIN);
if (below.length) console.log(`\n  ${below.length} bins fell below the floor and fall back to their kind: ${below.join(', ')}`);
console.log(`\ntiers and fallbacks:`);
for (const [k, t] of Object.entries(PUB.own)) for (const [tier, v] of Object.entries(t)) console.log(`  ${(k + '|' + tier).padEnd(16)} ${String(v.n).padStart(4)}   ${pct(v.median)}   ${pct(v.p90)}   (own share ${tier === 'lowOwn' ? '< ' + OWN_CUTS[0] : OWN_CUTS[0] + '–' + OWN_CUTS[1]})`);
for (const [k, v] of Object.entries(PUB.thin)) console.log(`  ${(k + '|thin').padEnd(16)} ${String(v.n).padStart(4)}   ${pct(v.median)}   ${pct(v.p90)}   (effN <= ${THIN_EFFN})`);
for (const [k, v] of Object.entries(PUB.byKind)) console.log(`  ${k.padEnd(16)} ${String(v.n).padStart(4)}   ${pct(v.median)}   ${pct(v.p90)}`);

console.log(`\nCalibration, ${calibration.method}:`);
console.log(`  came in at or under the predicted p90    ${(100 * calibration.p90Coverage).toFixed(1)}%   (target 90%)`);
console.log(`  came in at or under the predicted median ${(100 * calibration.medianSplit).toFixed(1)}%   (target 50%)`);
console.log("\n  by how much of the answer was the building's own sales:");
for (const [k, v] of Object.entries(calibration.byOwnShare)) {
  if (v.n) console.log(`    ${k.padEnd(20)} ${String(v.n).padStart(5)} lookups   ${(100 * v.p90Coverage).toFixed(1)}% under the predicted p90`);
}
console.log(`\nWrote ${OUT}`);
