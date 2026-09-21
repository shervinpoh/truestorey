/**
 * Measure the AVM against sales it was not allowed to see.
 *
 * ── WHY THIS SCRIPT IS THE POINT AND THE AVM IS THE MEANS ──────────────────
 * "More accurate than the ones most property sites use" is a claim, and this
 * repo has a standing note that an exit code is a claim rather than evidence.
 * The same applies here and harder, because an unmeasured AVM is not merely
 * unproven — it is the exact thing rule 2 exists to keep off the site, with no
 * offsetting benefit. A number Shervin cannot defend in a living room is worth
 * less than no number, because he will have said it out loud.
 *
 * So the estimate ships with an error measured over held-out sales, and the
 * error is reported in the units the valuation industry already uses.
 *
 * ── THE BASELINE, AND WHAT IT IS HONESTLY A PROXY FOR ──────────────────────
 * There is no API to PropertyGuru's or Edgeprop's AVM and no lawful way to
 * scrape one, so this does NOT benchmark against a named competitor and no
 * output here should ever be worded as though it does.
 *
 * What it benchmarks against is the METHOD: the unweighted, un-time-adjusted
 * median psf of recent sales at the same address, which is what a comparables
 * widget on a listing page effectively shows. That is a fair and checkable
 * comparator, and the honest sentence it supports is "this method beats a
 * plain median of recent sales at the same address by X" — not "this beats
 * PropertyGuru".
 *
 *   npm run backtest              300 trials over the last 6 months
 *   node scripts/backtest-avm.mjs --n 1000 --months 12 --seed 7
 */
import fs from 'node:fs';
import { recordByHref } from '../lib/data/query.js';
import { floorMid } from '../lib/blindspot/measure.js';
import { estimate } from '../lib/consult/avm.js';
import { asOfRecord, buildViews } from '../lib/consult/asof.js';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const N = Number(arg('n', 300));
const WINDOW = Number(arg('months', 6));
const SEED = Number(arg('seed', 1));
/* The effective-sample floor, swept rather than chosen — it trades coverage
   against accuracy and the shape of that trade is not guessable. */
const MIN_EFF = arg('min-eff', null);

/**
 * ── ABLATION ──────────────────────────────────────────────────────────────
 *   --ablate floor    no storey curve
 *   --ablate index    no time restatement
 *   --ablate union    one rung only, the way priceAnalysis picks it
 *   --ablate weights  flat — every comparable counts the same
 *   --ablate all      all four off: a plain median of the matched cohort
 *
 * A component that cannot be switched off is a component nobody has measured,
 * and three of the four below were added on an argument rather than on a
 * number. The argument can be right and the implementation still cost
 * accuracy — which is exactly what happened to the floor curve.
 */
const ABLATE = String(arg('ablate', '')).split(',').filter(Boolean);
const off = k => ABLATE.includes(k) || ABLATE.includes('all');
const FLAT = { distanceM: Infinity, months: Infinity, areaPct: Infinity };
if (ABLATE.length) console.log(`Ablating: ${ABLATE.join(', ')}`);

/* Seeded, so a reported figure can be reproduced by whoever doubts it. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SQFT_PER_SQM = 10.7639;
const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
};
const pct = (n, d) => (d ? (100 * n / d) : 0);

const comps = JSON.parse(fs.readFileSync('data/comps.json', 'utf8'));

/* ── the held-out set ─────────────────────────────────────────────────────
 * Every sale in the window, from every address, then sampled at random.
 *
 * NOT the busiest addresses. Sampling where the data is thick would measure
 * the AVM only where it was always going to do well and would report a
 * coverage of ~100% that is a fact about the sample and not about the island.
 * "Say what could not be measured" is the whole reason `scored` and
 * `attempted` are reported separately below. */
const latest = Object.values(comps.records)
  .flatMap(r => (r.sales || []).map(s => s[0]))
  .sort().at(-1);
const cutoff = (() => {
  const [y, m] = latest.split('-').map(Number);
  const d = new Date(y, m - 1 - WINDOW, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

const pool = [];
for (const [href, r] of Object.entries(comps.records)) {
  for (const [month, psf, areaSqm, type, floor] of (r.sales || [])) {
    if (month <= cutoff || !Number.isFinite(psf) || !Number.isFinite(areaSqm)) continue;
    pool.push({ href, kind: r.kind, label: r.label, month, psf, areaSqm, type, floor });
  }
}

const rnd = mulberry32(SEED);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const trials = pool.slice(0, N);

console.log(`Backtest · ${trials.length} of ${pool.length} sales after ${cutoff} (latest filed ${latest}) · seed ${SEED}`);
console.log('Building as-of views…');
const views = buildViews(comps, trials.map(t => t.month));

/**
 * ── PER-TRIAL FEATURES ────────────────────────────────────────────────────
 * `--dump <file>` writes one JSON line per scored trial: everything about the
 * cohort that was knowable BEFORE the answer was, plus the error it turned
 * out to have.
 *
 * Only knowable-in-advance features are recorded. An error table built on
 * anything the lookup cannot see at the time would predict beautifully here
 * and predict nothing live, which is the same class of mistake as the
 * backtest leak in lib/consult/asof.js.
 */
const DUMP_PATH = arg('dump', null);
const COHORTS = process.argv.includes('--cohorts');
const dumped = [];

const errs = [];
const baseErrs = [];
let attempted = 0, noRecord = 0, unpaired = 0;
const notRun = new Map();

for (const t of trials) {
  attempted++;
  const full = recordByHref(t.href);
  if (!full) { noRecord++; continue; }

  const rec = asOfRecord(full, t.month);
  const index = views.get(t.month);
  const areaSqft = t.areaSqm * SQFT_PER_SQM;

  const r = estimate(rec, {
    areaSqft,
    floor: off('floor') ? null : floorMid(t.floor),
    asOf: new Date(`${t.month}-15T00:00:00Z`),
    index,
    useIndex: !off('index'),
    unionRungs: !off('union'),
    /* --off levels ablates the building-level restatement. NOTE: the levels
       in data/private-scan.json are fitted on the WHOLE window, so a trial
       predicting a mid-window sale sees a level partly formed by sales after
       it. The improvement below is therefore optimistic. It is reported
       because the direction is still informative, and because the level
       persists at r=0.72 between halves — which is the separate evidence
       that it is usable forward at all. A leak-free version needs the level
       refitted as of each trial's cutoff. */
    useLevels: !off('levels'),
    ...(MIN_EFF !== null ? { minEffectiveN: Number(MIN_EFF) } : {}),
    weights: off('weights') ? FLAT : undefined,
  });

  if (!r.ok) {
    const key = /At least/.test(r.reason || '') ? 'too few comparables' : (r.reason || 'unknown');
    notRun.set(key, (notRun.get(key) || 0) + 1);
    continue;
  }

  /* The baseline: plain median psf at this address over the prior 12 months,
     unweighted and unadjusted for time, size or floor. */
  const [y, m] = t.month.split('-').map(Number);
  const from = new Date(y, m - 13, 1);
  const fromKey = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
  const own = (rec.recent || [])
    .filter(s => String(s.month) >= fromKey && Number.isFinite(s.psf))
    .map(s => s.psf);
  const base = median(own);

  /* ── SCORED ONLY WHERE BOTH RAN ──────────────────────────────────────────
   * The first version pushed the AVM's error unconditionally and the
   * baseline's only when the address had 12 months of its own sales, so the
   * two columns were computed over different homes — 108 against 100 — and
   * the difference between them was partly a difference in which properties
   * each column happened to cover. A comparison between two samples is not a
   * comparison between two methods. Both or neither. */
  if (!base) { unpaired++; continue; }
  const ape = Math.abs(r.psf - t.psf) / t.psf;
  errs.push({ kind: t.kind, ape, spe: (r.psf - t.psf) / t.psf });
  baseErrs.push({ kind: t.kind, ape: Math.abs(base - t.psf) / t.psf });

  if (DUMP_PATH) {
    const e = r.evidence;
    const ages = r.comparables.map(c => c.ageMonths).filter(Number.isFinite).sort((a, b) => a - b);
    dumped.push({
      href: t.href, month: t.month, kind: t.kind,
      /* knowable before the answer */
      sample: e.sample,
      ownShare: e.sample ? e.fromAddress / e.sample : 0,
      effN: Number(r.comparables.reduce((s, c) => s + c.weight, 0).toFixed(3)),
      radiusKm: e.radiusKm ?? 0,
      bandPct: Number(((r.band.psfHigh - r.band.psfLow) / r.psf).toFixed(4)),
      spreadPct: Number(((r.spread.psfHigh - r.spread.psfLow) / r.psf).toFixed(4)),
      ageMed: ages.length ? ages[(ages.length - 1) >> 1] : null,
      floorAdj: e.floorAdjusted ? e.floorAdjusted.moved / Math.max(1, e.floorAdjusted.of) : 0,
      /* the outcome */
      actual: t.psf,
      ape: Number(ape.toFixed(5)),
      /* --cohorts adds the raw comparables, so a tuner can re-weight them
         without re-running the engine. Cohort selection does not depend on the
         weights, so building it once and re-weighting many times is exact and
         not an approximation — it is the same arithmetic in a different order. */
      ...(COHORTS ? { c: r.comparables.map(c => [c.psf, c.distanceM || 0, c.ageMonths ?? -1, c.gapArea ?? 0]) } : {}),
    });
  }
}

if (DUMP_PATH) {
  fs.writeFileSync(DUMP_PATH, dumped.map(d => JSON.stringify(d)).join('\n') + '\n');
  console.log(`\nWrote ${dumped.length} trials to ${DUMP_PATH}`);
}

const report = (name, list) => {
  const a = list.filter(Boolean).map(e => e.ape);
  if (!a.length) return console.log(`\n${name}: nothing scored.`);
  const within = p => pct(a.filter(v => v <= p).length, a.length);
  console.log(`\n${name}  (n=${a.length})`);
  console.log(`  median abs error   ${(100 * median(a)).toFixed(2)}%`);
  console.log(`  within  5%         ${within(0.05).toFixed(1)}%`);
  console.log(`  within 10%         ${within(0.10).toFixed(1)}%`);
  console.log(`  within 20%         ${within(0.20).toFixed(1)}%`);
  /* DUMP=1 prints the raw shape of each column.
   *
   * It is here because it settled a false alarm that cost an hour: the
   * baseline reported a 4.86% median and 50.9% within-5% for HDB, for private
   * and for both together, which across disjoint subsets looked impossible and
   * looked like a filtering bug. It is neither — the baseline's median sits
   * just under the 5% threshold, so the share below 5% pins near half in every
   * subset that shares that median. Two minutes of raw numbers said so; two
   * more hours of reading the filter would not have. */
  if (process.env.DUMP) {
    const srt=[...a].sort((x,y)=>x-y);
    console.log(`  DUMP n=${a.length} min=${srt[0].toFixed(5)} mid=${srt[(a.length-1)>>1].toFixed(5)} max=${srt.at(-1).toFixed(5)} sum=${a.reduce((x,y)=>x+y,0).toFixed(4)}`);
  }
};

console.log(`\nCoverage: ${errs.length} of ${attempted} attempted produced an estimate `
  + `(${pct(errs.length, attempted).toFixed(1)}%).`);
if (noRecord) console.log(`  ${noRecord} had no record page — not an AVM failure.`);
for (const [why, n] of [...notRun].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n} did not run: ${why}`);
}
if (unpaired) console.log(`  ${unpaired} estimated but excluded: the address filed nothing in the prior `
  + `12 months, so the baseline had nothing to score and the pair would not be like-for-like.`);

report('AVM — indexed, weighted, floor-adjusted', errs);
report('Baseline — plain median, same address, 12 months', baseErrs);

const bias = median(errs.map(e => e.spe));
if (bias !== null) {
  console.log(`\nBias (median signed error): ${(100 * bias).toFixed(2)}% `
    + `— ${bias > 0 ? 'over' : 'under'}-estimating by this much at the middle.`);
}

for (const k of ['HDB', 'PRIVATE']) {
  const sub = errs.filter(e => e.kind === k);
  const bsub = baseErrs.filter(e => e.kind === k);
  if (sub.length >= 10) { report(`  └ ${k} — AVM`, sub); report(`  └ ${k} — baseline`, bsub); }
}
